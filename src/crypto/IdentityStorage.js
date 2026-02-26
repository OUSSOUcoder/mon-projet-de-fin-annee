/**
 * IdentityStorage
 * Stockage persistant et chiffré des clés d'identité X3DH dans IndexedDB.
 *
 * Les clés privées ne quittent JAMAIS le navigateur en clair.
 * Elles sont chiffrées avec AES-256-GCM dérivé du mot de passe utilisateur.
 *
 * Structure IndexedDB :
 *   DB: SecureChatIdentityDB
 *   Store: identities  → { userId, encryptedIdentity, salt, iv, createdAt }
 *   Store: prekey_log  → { id, userId, action, timestamp }  (audit)
 */

const DB_NAME    = 'SecureChatIdentityDB';
const DB_VERSION = 1;

// ─────────────────────────────────────────────
// DÉRIVATION DE CLÉ DEPUIS MOT DE PASSE
// ─────────────────────────────────────────────

/**
 * Dérive une clé AES-256 depuis un mot de passe + salt
 * en utilisant PBKDF2 avec 310 000 itérations (recommandation OWASP 2024)
 */
async function deriveKeyFromPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name:       'PBKDF2',
      salt:       salt,
      iterations: 310_000,
      hash:       'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─────────────────────────────────────────────
// CHIFFREMENT / DÉCHIFFREMENT
// ─────────────────────────────────────────────

async function encryptData(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKeyFromPassword(password, salt);

  const plaintext  = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  return {
    ciphertext: Array.from(new Uint8Array(ciphertext)),
    salt:       Array.from(salt),
    iv:         Array.from(iv)
  };
}

async function decryptData(encrypted, password) {
  const salt = new Uint8Array(encrypted.salt);
  const iv   = new Uint8Array(encrypted.iv);
  const key  = await deriveKeyFromPassword(password, salt);

  const ciphertext   = new Uint8Array(encrypted.ciphertext).buffer;
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  return JSON.parse(new TextDecoder().decode(plaintextBuf));
}

// ─────────────────────────────────────────────
// CLASSE PRINCIPALE
// ─────────────────────────────────────────────

export class IdentityStorage {
  constructor() {
    this.db    = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) return;

    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onerror = () => reject(req.error);

      req.onsuccess = () => {
        this.db    = req.result;
        this.ready = true;
        resolve();
      };

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('identities')) {
          const store = db.createObjectStore('identities', { keyPath: 'userId' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }

        if (!db.objectStoreNames.contains('prekey_log')) {
          const log = db.createObjectStore('prekey_log', {
            keyPath: 'id', autoIncrement: true
          });
          log.createIndex('userId',    'userId',    { unique: false });
          log.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  // ─── Vérifier si une identité existe ─────

  async hasIdentity(userId) {
    if (!this.ready) await this.init();
    return new Promise((resolve, reject) => {
      const tx      = this.db.transaction('identities', 'readonly');
      const store   = tx.objectStore('identities');
      const request = store.get(userId);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  // ─── Sauvegarder une identité (chiffrée) ─

  /**
   * @param {string}       userId
   * @param {X3DHIdentity} identity  - instance X3DHIdentity avec export()
   * @param {string}       password  - mot de passe utilisateur
   */
  async saveIdentity(userId, identity, password) {
    if (!this.ready) await this.init();

    const exported  = await identity.export();
    const encrypted = await encryptData(exported, password);

    const record = {
      userId,
      encryptedIdentity: encrypted,
      createdAt:         Date.now(),
      updatedAt:         Date.now(),
      version:           1
    };

    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction('identities', 'readwrite');
      const store = tx.objectStore('identities');
      const req   = store.put(record);
      req.onsuccess = () => {
        console.log(`✅ Identité ${userId} sauvegardée (chiffrée)`);
        resolve(record);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ─── Charger et déchiffrer une identité ──

  /**
   * @param {string} userId
   * @param {string} password
   * @returns {X3DHIdentity}
   * @throws si mot de passe incorrect (AES-GCM échoue)
   */
  async loadIdentity(userId, password) {
    if (!this.ready) await this.init();

    const record = await new Promise((resolve, reject) => {
      const tx    = this.db.transaction('identities', 'readonly');
      const store = tx.objectStore('identities');
      const req   = store.get(userId);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });

    if (!record) {
      throw new Error(`Aucune identité trouvée pour ${userId}`);
    }

    try {
      const decrypted = await decryptData(record.encryptedIdentity, password);
      const { X3DHIdentity } = await import('./X3DH.js');
      const identity = await X3DHIdentity.import(decrypted);
      console.log(`✅ Identité ${userId} chargée`);
      return identity;
    } catch (err) {
      throw new Error('Mot de passe incorrect ou données corrompues');
    }
  }

  // ─── Mettre à jour après consommation OTPK ─

  async updateIdentity(userId, identity, password) {
    await this.saveIdentity(userId, identity, password);
    await this._logAction(userId, 'otpk_consumed');
  }

  // ─── Mettre à jour le bundle publié ──────

  async savePreKeyBundle(userId, bundle) {
    if (!this.ready) await this.init();

    // On stocke le bundle public séparément (pas chiffré, c'est public)
    const record = {
      userId,
      encryptedIdentity: undefined, // champ non utilisé ici
      bundle,
      bundleUpdatedAt: Date.now()
    };

    // Merge avec le record existant
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction('identities', 'readwrite');
      const store = tx.objectStore('identities');
      const getReq = store.get(userId);
      getReq.onsuccess = () => {
        const existing = getReq.result || { userId };
        const updated  = { ...existing, bundle, bundleUpdatedAt: Date.now() };
        const putReq   = store.put(updated);
        putReq.onsuccess = () => resolve();
        putReq.onerror   = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  // ─── Audit log ───────────────────────────

  async _logAction(userId, action) {
    const tx    = this.db.transaction('prekey_log', 'readwrite');
    const store = tx.objectStore('prekey_log');
    store.add({ userId, action, timestamp: Date.now() });
  }

  async getAuditLog(userId) {
    if (!this.ready) await this.init();
    return new Promise((resolve, reject) => {
      const tx      = this.db.transaction('prekey_log', 'readonly');
      const store   = tx.objectStore('prekey_log');
      const index   = store.index('userId');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  // ─── Suppression ─────────────────────────

  async deleteIdentity(userId) {
    if (!this.ready) await this.init();
    return new Promise((resolve, reject) => {
      const tx    = this.db.transaction('identities', 'readwrite');
      const store = tx.objectStore('identities');
      const req   = store.delete(userId);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db    = null;
      this.ready = false;
    }
  }
}

export default IdentityStorage;