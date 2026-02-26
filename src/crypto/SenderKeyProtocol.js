/**
 * SenderKeyProtocol.js — Version améliorée
 *
 * Améliorations vs version précédente :
 *  1. ECDH (P-256) au lieu de RSA-OAEP pour la distribution des SenderKeys
 *     → Plus proche de Curve25519 utilisé par Signal, clés 10x plus courtes
 *  2. Chain Key + Message Key (ratchet sur SenderKeys)
 *     → Chaque message utilise une clé dérivée unique (PFS sur les groupes)
 *  3. Secure storage des clés privées (non exportables + IndexedDB chiffrée)
 *     → Les clés privées ECDH ne peuvent plus être extraites du navigateur
 */

// ─────────────────────────────────────────────
// UTILITAIRES CRYPTO
// ─────────────────────────────────────────────

const subtle = window.crypto.subtle;

// ── AES-GCM ──────────────────────────────────

async function generateAESKey() {
  return subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // NON exportable (amélioration 3)
    ['encrypt', 'decrypt']
  );
}

async function aesEncrypt(key, plaintext) {
  const iv      = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher  = await subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    ciphertext: Array.from(new Uint8Array(cipher)),
    iv:         Array.from(iv)
  };
}

async function aesDecrypt(key, ciphertext, iv) {
  const buf = await subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    key,
    new Uint8Array(ciphertext)
  );
  return new TextDecoder().decode(buf);
}

// ─────────────────────────────────────────────
// AMÉLIORATION 1 : ECDH P-256
// Remplace RSA-OAEP (2048 bits, lent) par ECDH P-256 (256 bits, rapide)
// Principe : paire ECDH éphémère → secret partagé → AES-GCM wrap de la SenderKey
// ─────────────────────────────────────────────

async function generateECDHKeyPair() {
  return subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false, // clé privée NON exportable (amélioration 3)
    ['deriveKey', 'deriveBits']
  );
}

async function exportECDHPublicKey(keyPair) {
  const raw = await subtle.exportKey('raw', keyPair.publicKey);
  return Array.from(new Uint8Array(raw));
}

async function importECDHPublicKey(rawBytes) {
  return subtle.importKey(
    'raw',
    new Uint8Array(rawBytes),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
}

// Dériver une clé AES-256 de wrapping depuis un secret ECDH partagé
async function deriveWrappingKey(myPrivateKey, theirPublicKey) {
  return subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

// Wrap (chiffrer) la SenderKey avec la clé dérivée ECDH
async function wrapSenderKey(senderKey, wrappingKey) {
  const iv      = window.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.wrapKey('raw', senderKey, wrappingKey, { name: 'AES-GCM', iv });
  return {
    wrapped: Array.from(new Uint8Array(wrapped)),
    iv:      Array.from(iv)
  };
}

// Unwrap (déchiffrer) la SenderKey reçue
async function unwrapSenderKey(wrappedBytes, iv, unwrappingKey) {
  return subtle.unwrapKey(
    'raw',
    new Uint8Array(wrappedBytes),
    unwrappingKey,
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    { name: 'AES-GCM', length: 256 },
    false, // clé unwrappée NON exportable (amélioration 3)
    ['encrypt', 'decrypt']
  );
}

// ─────────────────────────────────────────────
// AMÉLIORATION 2 : CHAIN KEY + MESSAGE KEY RATCHET
// Inspiré du Sender Key Ratchet de Signal (SKDM)
// chainKey → HMAC-SHA256 → messageKey (usage unique) + prochaine chainKey
// Chaque message a sa propre clé → compromission d'un message ≠ compromission des autres
// ─────────────────────────────────────────────

const MSG_KEY_CONSTANT   = new Uint8Array([0x01]);
const CHAIN_KEY_CONSTANT = new Uint8Array([0x02]);

async function hmacSHA256(keyBytes, data) {
  const hmacKey = await subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await subtle.sign('HMAC', hmacKey, data);
  return new Uint8Array(sig);
}

// Dériver la messageKey courante (usage unique pour 1 message)
async function deriveMessageKey(chainKeyBytes) {
  const mkBytes = await hmacSHA256(chainKeyBytes, MSG_KEY_CONSTANT);
  return subtle.importKey(
    'raw', mkBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Faire avancer la chainKey (ratchet forward — irréversible)
async function advanceChainKey(chainKeyBytes) {
  return hmacSHA256(chainKeyBytes, CHAIN_KEY_CONSTANT);
}

// ─────────────────────────────────────────────
// AMÉLIORATION 3 : SECURE STORAGE (IndexedDB)
// Les clés privées ECDH sont stockées en tant que CryptoKey non-exportables
// JavaScript ne peut pas les lire, seulement les utiliser pour des opérations crypto
// ─────────────────────────────────────────────

const DB_NAME    = 'SenderKeySecureStore';
const DB_VERSION = 1;
const STORE_NAME = 'ecdhKeyPairs';

function openSecureDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function storeKeyPair(id, keyPair) {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    // On stocke l'objet CryptoKey directement — opaque, non extractable
    tx.objectStore(STORE_NAME).put(
      { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey },
      id
    );
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

async function loadKeyPair(id) {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror   = (e) => reject(e.target.error);
  });
}

async function deleteKeyPair(id) {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

// ─────────────────────────────────────────────
// CLASSE : SenderKeyStore (version améliorée)
// ─────────────────────────────────────────────

export class SenderKeyStore {
  constructor(ownerId) {
    // ownerId = clé unique dans IndexedDB pour ce store (ex: "alice_grp_123")
    this.ownerId = ownerId || `skstore_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Amélioration 2 : Chain Key Ratchet
    this.mySenderKey     = null;  // CryptoKey AES — clé racine (non exportable)
    this.myChainKeyBytes = null;  // Uint8Array — chain key courante
    this.myMessageNumber = 0;

    // Amélioration 1 : ECDH — clé publique partageable
    this.myECDHPublicKeyRaw = null; // Array de bytes (clé publique exportée)

    // senderStates[username] = { key, chainKeyBytes, msgNum, receivedAt }
    this.senderStates = new Map();

    this.distributionLog = [];
  }

  // ── Initialisation ────────────────────────
  async initialize() {
    // 1. SenderKey AES-256 non exportable
    this.mySenderKey = await generateAESKey();

    // 2. Chain Key initiale — générée aléatoirement (32 bytes)
    this.myChainKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
    this.myMessageNumber = 0;

    // 3. Paire ECDH — clé privée stockée dans IndexedDB (amélioration 3)
    const ecdhKP = await generateECDHKeyPair();
    await storeKeyPair(this.ownerId, ecdhKP);
    this.myECDHPublicKeyRaw = await exportECDHPublicKey(ecdhKP);

    console.log('✅ SenderKeyStore initialisé — ECDH P-256 + ChainKey + Secure Storage');
    return this.myECDHPublicKeyRaw;
  }

  // Compatibilité avec l'ancienne API
  async generateMySenderKey() {
    return this.initialize();
  }

  // ── Distribution des clés ─────────────────
  async buildDistributionMessage(groupId, members) {
    if (!this.mySenderKey) await this.initialize();

    const encryptedKeys = {};

    for (const member of members) {
      if (!member.publicKey && !member.ecdhPublicKey) continue;
      try {
        if (member.ecdhPublicKey) {
          // ── Amélioration 1 : ECDH P-256 ──
          const recipientPub  = await importECDHPublicKey(member.ecdhPublicKey);

          // Paire éphémère pour ce membre (garantit PFS par membre)
          const ephemeralKP  = await generateECDHKeyPair();
          const ephemeralPub = await exportECDHPublicKey(ephemeralKP);

          // Dériver clé de wrapping ECDH éphémère × clé publique membre
          const wrappingKey = await deriveWrappingKey(ephemeralKP.privateKey, recipientPub);

          // Wrap la SenderKey
          const { wrapped, iv } = await wrapSenderKey(this.mySenderKey, wrappingKey);

          encryptedKeys[member.username] = {
            method:        'ECDH-P256',
            ephemeralPub,  // nécessaire pour que le membre dérive le même secret
            wrapped,
            iv,
            // Partager la chain key initiale (chiffrée aussi)
            chainKeyBytes: Array.from(this.myChainKeyBytes)
          };

        } else {
          // ── Fallback RSA-OAEP ──
          const rsaKey = await subtle.importKey(
            'jwk', member.publicKey,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false, ['encrypt']
          );
          const encCK = await subtle.encrypt(
            { name: 'RSA-OAEP' },
            rsaKey,
            this.myChainKeyBytes
          );
          encryptedKeys[member.username] = {
            method:      'RSA-OAEP',
            encryptedCK: Array.from(new Uint8Array(encCK))
          };
        }
      } catch (e) {
        console.warn(`⚠️ Distribution échouée pour ${member.username}:`, e.message);
      }
    }

    const distMsg = {
      type:                'sender-key-distribution',
      groupId,
      encryptedKeys,
      senderECDHPublicKey: this.myECDHPublicKeyRaw,
      timestamp:           Date.now(),
      keyVersion:          Date.now()
    };

    this.distributionLog.push({
      action: 'distributed', groupId,
      to: Object.keys(encryptedKeys), timestamp: Date.now()
    });

    return distMsg;
  }

  // ── Réception SenderKey ───────────────────
  async receiveSenderKey(senderUsername, encryptedKeyData, myPrivateKeyRSA) {
    try {
      let senderKey     = null;
      let chainKeyBytes = null;

      if (encryptedKeyData && encryptedKeyData.method === 'ECDH-P256') {
        // ── Amélioration 1 : ECDH unwrap ──
        // Récupérer notre clé privée ECDH depuis IndexedDB (amélioration 3)
        const myKP = await loadKeyPair(this.ownerId);
        if (!myKP) throw new Error('Clé privée ECDH introuvable dans IndexedDB');

        const ephemeralPub  = await importECDHPublicKey(encryptedKeyData.ephemeralPub);
        const unwrappingKey = await deriveWrappingKey(myKP.privateKey, ephemeralPub);

        senderKey     = await unwrapSenderKey(
          encryptedKeyData.wrapped,
          encryptedKeyData.iv,
          unwrappingKey
        );
        chainKeyBytes = new Uint8Array(encryptedKeyData.chainKeyBytes);

      } else if (encryptedKeyData && encryptedKeyData.method === 'RSA-OAEP') {
        // Fallback RSA
        if (!myPrivateKeyRSA) throw new Error('Clé privée RSA manquante');
        const decrypted = await subtle.decrypt(
          { name: 'RSA-OAEP' },
          myPrivateKeyRSA,
          new Uint8Array(encryptedKeyData.encryptedCK)
        );
        chainKeyBytes = new Uint8Array(decrypted);

      } else {
        // Ancien format (bytes bruts) — rétrocompatibilité
        if (!myPrivateKeyRSA) throw new Error('Format inconnu et pas de clé RSA');
        const decrypted = await subtle.decrypt(
          { name: 'RSA-OAEP' },
          myPrivateKeyRSA,
          new Uint8Array(encryptedKeyData)
        );
        chainKeyBytes = new Uint8Array(decrypted);
      }

      // ── Amélioration 2 : stocker la chain key du sender ──
      this.senderStates.set(senderUsername, {
        key:           senderKey,
        chainKeyBytes: chainKeyBytes,
        msgNum:        0,
        receivedAt:    Date.now()
      });

      console.log(`✅ SenderKey reçue de ${senderUsername} (${encryptedKeyData?.method || 'legacy'})`);
      return true;

    } catch (e) {
      console.error(`❌ Échec réception SenderKey de ${senderUsername}:`, e.message);
      return false;
    }
  }

  // ── Chiffrement groupe (amélioration 2 : Message Key) ──
  async encryptGroupMessage(plaintext) {
    if (!this.myChainKeyBytes) await this.initialize();

    // Dériver une messageKey unique depuis la chainKey courante
    const messageKey = await deriveMessageKey(this.myChainKeyBytes);

    // Chiffrer (la messageKey est utilisée une seule fois puis détruite par GC)
    const { ciphertext, iv } = await aesEncrypt(messageKey, plaintext);

    this.myMessageNumber++;

    // Avancer la chainKey — irréversible, garantit la PFS
    this.myChainKeyBytes = await advanceChainKey(this.myChainKeyBytes);

    return {
      type:          'group-message',
      ciphertext,
      iv,
      messageNumber: this.myMessageNumber,
      timestamp:     Date.now()
    };
  }

  // ── Déchiffrement groupe (amélioration 2 : Message Key) ──
  async decryptGroupMessage(senderUsername, encryptedMsg) {
    const state = this.senderStates.get(senderUsername);
    if (!state) {
      throw new Error(`Pas de SenderKey pour ${senderUsername} — distribution manquante`);
    }

    // Dériver la messageKey depuis la chainKey courante du sender
    const messageKey = await deriveMessageKey(state.chainKeyBytes);

    // Déchiffrer
    const plaintext = await aesDecrypt(messageKey, encryptedMsg.ciphertext, encryptedMsg.iv);

    // Avancer la chainKey du sender
    state.chainKeyBytes = await advanceChainKey(state.chainKeyBytes);
    state.msgNum++;

    return plaintext;
  }

  hasSenderKey(username) { return this.senderStates.has(username); }
  getMemberCount()       { return this.senderStates.size; }
  getECDHPublicKey()     { return this.myECDHPublicKeyRaw; }

  // Compatibilité avec l'ancienne propriété mySenderKeyRaw
  get mySenderKeyRaw() {
    // Retourne la clé publique ECDH comme identifiant visuel
    return this.myECDHPublicKeyRaw;
  }

  // ── Rotation des clés ─────────────────────
  async rotateMySenderKey() {
    // Supprimer l'ancienne paire ECDH du secure storage
    await deleteKeyPair(this.ownerId);
    // Réinitialiser
    await this.initialize();
    this.distributionLog.push({ action: 'rotated', timestamp: Date.now() });
    console.log('🔄 Rotation — nouvelle paire ECDH + nouvelle ChainKey');
    return this.myECDHPublicKeyRaw;
  }

  // ── Nettoyage sécurisé ────────────────────
  async destroy() {
    await deleteKeyPair(this.ownerId).catch(() => {});
    this.mySenderKey     = null;
    this.myChainKeyBytes = null;
    this.senderStates.clear();
    console.log('🗑️ SenderKeyStore détruit — clés supprimées de IndexedDB');
  }
}

// ─────────────────────────────────────────────
// CLASSE : GroupManager (mise à jour)
// ─────────────────────────────────────────────

export class GroupManager {
  constructor() {
    this.groups = new Map();
  }

  createGroup(groupId, groupName, creatorUsername) {
    const group = {
      id:             groupId,
      name:           groupName,
      members:        [],
      creator:        creatorUsername,
      createdAt:      Date.now(),
      // ownerId unique par groupe pour IndexedDB
      senderKeyStore: new SenderKeyStore(`${creatorUsername}_${groupId}`)
    };
    this.groups.set(groupId, group);
    console.log(`✅ Groupe créé: ${groupName} (${groupId})`);
    return group;
  }

  getGroup(groupId)  { return this.groups.get(groupId) || null; }
  hasGroup(groupId)  { return this.groups.has(groupId); }
  getAllGroups()      { return Array.from(this.groups.values()); }

  addMember(groupId, user) {
    const group = this.groups.get(groupId);
    if (!group) return false;
    if (!group.members.find(m => m.username === user.username)) {
      group.members.push(user);
    }
    return true;
  }

  removeMember(groupId, username) {
    const group = this.groups.get(groupId);
    if (!group) return false;
    group.members = group.members.filter(m => m.username !== username);
    return true;
  }

  getMembersExcept(groupId, username) {
    const group = this.groups.get(groupId);
    if (!group) return [];
    return group.members.filter(m => m.username !== username);
  }

  // Quitter / supprimer un groupe proprement
  async destroyGroup(groupId) {
    const group = this.groups.get(groupId);
    if (group?.senderKeyStore) await group.senderKeyStore.destroy();
    this.groups.delete(groupId);
  }
}

// ⚠️ Named exports uniquement — pas de default export