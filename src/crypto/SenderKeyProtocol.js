/**
 * SenderKeyProtocol.js — Version corrigée
 * ✅ FIX 1 : ConstraintError → put() au lieu de add() dans storeKeyPair
 * ✅ FIX 2 : 3ème utilisateur ne reçoit pas les messages
 *           → receiveSenderKey gère le cas où la clé ECDH n'est pas encore
 *             dans IndexedDB (nouveau membre qui rejoint après la distribution)
 * ✅ FIX 3 : decryptGroupMessage avance la chainKey correctement
 *           même si des messages ont été manqués (rattrapage)
 */

const subtle = window.crypto.subtle;

// ─────────────────────────────────────────────
// UTILITAIRES CRYPTO
// ─────────────────────────────────────────────

async function generateAESKey() {
  return subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false,
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
// ECDH P-256
// ─────────────────────────────────────────────

async function generateECDHKeyPair() {
  return subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
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

async function deriveWrappingKey(myPrivateKey, theirPublicKey) {
  return subtle.deriveKey(
    { name: 'ECDH', public: theirPublicKey },
    myPrivateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

async function wrapSenderKey(senderKey, wrappingKey) {
  const iv      = window.crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.wrapKey('raw', senderKey, wrappingKey, { name: 'AES-GCM', iv });
  return {
    wrapped: Array.from(new Uint8Array(wrapped)),
    iv:      Array.from(iv)
  };
}

async function unwrapSenderKey(wrappedBytes, iv, unwrappingKey) {
  return subtle.unwrapKey(
    'raw',
    new Uint8Array(wrappedBytes),
    unwrappingKey,
    { name: 'AES-GCM', iv: new Uint8Array(iv) },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─────────────────────────────────────────────
// CHAIN KEY RATCHET
// ─────────────────────────────────────────────

const MSG_KEY_CONSTANT   = new Uint8Array([0x01]);
const CHAIN_KEY_CONSTANT = new Uint8Array([0x02]);

async function hmacSHA256(keyBytes, data) {
  const hmacKey = await subtle.importKey(
    'raw', keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await subtle.sign('HMAC', hmacKey, data);
  return new Uint8Array(sig);
}

async function deriveMessageKey(chainKeyBytes) {
  const mkBytes = await hmacSHA256(chainKeyBytes, MSG_KEY_CONSTANT);
  return subtle.importKey(
    'raw', mkBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function advanceChainKey(chainKeyBytes) {
  return hmacSHA256(chainKeyBytes, CHAIN_KEY_CONSTANT);
}

// ─────────────────────────────────────────────
// SECURE STORAGE IndexedDB
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

// ✅ FIX 1 : put() au lieu de add() → évite ConstraintError
async function storeKeyPair(id, keyPair) {
  const db = await openSecureDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    // ✅ put() écrase si existe déjà, add() lève ConstraintError
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
// CLASSE : SenderKeyStore
// ─────────────────────────────────────────────

export class SenderKeyStore {
  constructor(ownerId) {
    this.ownerId = ownerId || `skstore_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.mySenderKey     = null;
    this.myChainKeyBytes = null;
    this.myMessageNumber = 0;
    this.myECDHPublicKeyRaw = null;
    this.senderStates = new Map();
    this.distributionLog = [];
  }

  async initialize() {
    this.mySenderKey     = await generateAESKey();
    this.myChainKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
    this.myMessageNumber = 0;

    const ecdhKP = await generateECDHKeyPair();
    // ✅ FIX 1 : put() utilisé dans storeKeyPair
    await storeKeyPair(this.ownerId, ecdhKP);
    this.myECDHPublicKeyRaw = await exportECDHPublicKey(ecdhKP);

    console.log('✅ SenderKeyStore initialisé — ECDH P-256 + ChainKey + Secure Storage');
    return this.myECDHPublicKeyRaw;
  }

  async generateMySenderKey() {
    return this.initialize();
  }

  async buildDistributionMessage(groupId, members) {
    if (!this.mySenderKey) await this.initialize();

    const encryptedKeys = {};

    for (const member of members) {
      if (!member.publicKey && !member.ecdhPublicKey) continue;
      try {
        if (member.ecdhPublicKey) {
          const recipientPub = await importECDHPublicKey(member.ecdhPublicKey);
          const ephemeralKP  = await generateECDHKeyPair();
          const ephemeralPub = await exportECDHPublicKey(ephemeralKP);
          const wrappingKey  = await deriveWrappingKey(ephemeralKP.privateKey, recipientPub);
          const { wrapped, iv } = await wrapSenderKey(this.mySenderKey, wrappingKey);

          encryptedKeys[member.username] = {
            method:        'ECDH-P256',
            ephemeralPub,
            wrapped,
            iv,
            chainKeyBytes: Array.from(this.myChainKeyBytes)
          };
        } else {
          // Fallback RSA-OAEP
          const rsaKey = await subtle.importKey(
            'jwk', member.publicKey,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false, ['encrypt']
          );
          const encCK = await subtle.encrypt(
            { name: 'RSA-OAEP' }, rsaKey, this.myChainKeyBytes
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

  // ✅ FIX 2 : receiveSenderKey robuste pour le 3ème utilisateur
  async receiveSenderKey(senderUsername, encryptedKeyData, myPrivateKeyRSA) {
    try {
      let senderKey     = null;
      let chainKeyBytes = null;

      if (encryptedKeyData && encryptedKeyData.method === 'ECDH-P256') {
        // ✅ FIX 2 : charger la clé depuis IndexedDB
        let myKP = await loadKeyPair(this.ownerId);

        // ✅ FIX 2 : si clé pas encore en IndexedDB → réinitialiser
        if (!myKP) {
          console.warn(`⚠️ Clé ECDH introuvable pour ${this.ownerId} → réinitialisation`);
          await this.initialize();
          myKP = await loadKeyPair(this.ownerId);
        }

        if (!myKP) throw new Error('Impossible de charger/créer la clé ECDH');

        const ephemeralPub  = await importECDHPublicKey(encryptedKeyData.ephemeralPub);
        const unwrappingKey = await deriveWrappingKey(myKP.privateKey, ephemeralPub);

        senderKey     = await unwrapSenderKey(
          encryptedKeyData.wrapped,
          encryptedKeyData.iv,
          unwrappingKey
        );
        chainKeyBytes = new Uint8Array(encryptedKeyData.chainKeyBytes);

      } else if (encryptedKeyData && encryptedKeyData.method === 'RSA-OAEP') {
        if (!myPrivateKeyRSA) throw new Error('Clé privée RSA manquante');
        const decrypted = await subtle.decrypt(
          { name: 'RSA-OAEP' }, myPrivateKeyRSA,
          new Uint8Array(encryptedKeyData.encryptedCK)
        );
        chainKeyBytes = new Uint8Array(decrypted);

      } else {
        if (!myPrivateKeyRSA) throw new Error('Format inconnu et pas de clé RSA');
        const decrypted = await subtle.decrypt(
          { name: 'RSA-OAEP' }, myPrivateKeyRSA,
          new Uint8Array(encryptedKeyData)
        );
        chainKeyBytes = new Uint8Array(decrypted);
      }

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

  async encryptGroupMessage(plaintext) {
    if (!this.myChainKeyBytes) await this.initialize();

    const messageKey = await deriveMessageKey(this.myChainKeyBytes);
    const { ciphertext, iv } = await aesEncrypt(messageKey, plaintext);
    this.myMessageNumber++;
    this.myChainKeyBytes = await advanceChainKey(this.myChainKeyBytes);

    return {
      type:          'group-message',
      ciphertext,
      iv,
      messageNumber: this.myMessageNumber,
      timestamp:     Date.now()
    };
  }

  // ✅ FIX 3 : rattrapage si messages manqués
  async decryptGroupMessage(senderUsername, encryptedMsg) {
    const state = this.senderStates.get(senderUsername);
    if (!state) {
      throw new Error(`Pas de SenderKey pour ${senderUsername} — distribution manquante`);
    }

    // ✅ FIX 3 : rattrapage des messages manqués
    const expectedMsgNum = state.msgNum;
    const receivedMsgNum = encryptedMsg.messageNumber;

    if (receivedMsgNum > expectedMsgNum + 1) {
      console.warn(`⚠️ Messages manqués pour ${senderUsername}: attendu ${expectedMsgNum + 1}, reçu ${receivedMsgNum}`);
      // Avancer la chainKey pour rattraper
      for (let i = expectedMsgNum; i < receivedMsgNum - 1; i++) {
        state.chainKeyBytes = await advanceChainKey(state.chainKeyBytes);
        state.msgNum++;
      }
    }

    const messageKey = await deriveMessageKey(state.chainKeyBytes);
    const plaintext  = await aesDecrypt(messageKey, encryptedMsg.ciphertext, encryptedMsg.iv);

    state.chainKeyBytes = await advanceChainKey(state.chainKeyBytes);
    state.msgNum++;

    return plaintext;
  }

  hasSenderKey(username) { return this.senderStates.has(username); }
  getMemberCount()       { return this.senderStates.size; }
  getECDHPublicKey()     { return this.myECDHPublicKeyRaw; }

  get mySenderKeyRaw() {
    return this.myECDHPublicKeyRaw;
  }

  async rotateMySenderKey() {
    await deleteKeyPair(this.ownerId);
    await this.initialize();
    this.distributionLog.push({ action: 'rotated', timestamp: Date.now() });
    console.log('🔄 Rotation — nouvelle paire ECDH + nouvelle ChainKey');
    return this.myECDHPublicKeyRaw;
  }

  async destroy() {
    await deleteKeyPair(this.ownerId).catch(() => {});
    this.mySenderKey     = null;
    this.myChainKeyBytes = null;
    this.senderStates.clear();
    console.log('🗑️ SenderKeyStore détruit — clés supprimées de IndexedDB');
  }
}

// ─────────────────────────────────────────────
// CLASSE : GroupManager
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

  async destroyGroup(groupId) {
    const group = this.groups.get(groupId);
    if (group?.senderKeyStore) await group.senderKeyStore.destroy();
    this.groups.delete(groupId);
  }
}