/**
 * IdentityStorage
 * Stockage persistant et chiffré des clés d'identité X3DH dans IndexedDB.
 */

const DB_NAME    = 'SecureChatIdentityDB';
const DB_VERSION = 2; // Incrémenter si structure de DB modifiée

async function deriveKeyFromPassword(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await deriveKeyFromPassword(password, salt);
  const plaintext  = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
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
  const plaintextBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plaintextBuf));
}

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
        // ✅ Store dédié pour les contacts vérifiés
        if (!db.objectStoreNames.contains('verified_contacts')) {
          db.createObjectStore('verified_contacts', { keyPath: 'username' });
        }
      };
    });
  }

  // ✅ FIX : méthode getDB remplacée par openDB interne
  async _getDB() {
    if (!this.ready) await this.init();
    return this.db;
  }

  // ✅ FIX : saveVerifiedContacts corrigé
  async saveVerifiedContacts(username, verifiedSet) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        // ✅ Utiliser 'verified_contacts' store dédié
        const tx    = db.transaction('verified_contacts', 'readwrite');
        const store = tx.objectStore('verified_contacts');
        const req   = store.put({
          username,
          verifiedContacts: [...verifiedSet],
          updatedAt: Date.now()
        });
        req.onsuccess = () => resolve();
        req.onerror   = () => reject(req.error);
      });
    } catch (e) {
      console.warn('saveVerifiedContacts failed:', e);
    }
  }

  // ✅ FIX : loadVerifiedContacts corrigé
  async loadVerifiedContacts(username) {
    try {
      const db = await this._getDB();
      return new Promise((resolve, reject) => {
        // ✅ Utiliser 'verified_contacts' store dédié
        const tx    = db.transaction('verified_contacts', 'readonly');
        const store = tx.objectStore('verified_contacts');
        const req   = store.get(username);
        req.onsuccess = () => {
          const data = req.result;
          resolve(data?.verifiedContacts ? new Set(data.verifiedContacts) : new Set());
        };
        req.onerror = () => {
          console.warn('loadVerifiedContacts error:', req.error);
          resolve(new Set()); // ✅ Retourner Set vide plutôt que crash
        };
      });
    } catch (e) {
      console.warn('loadVerifiedContacts failed:', e);
      return new Set();
    }
  }

  async hasIdentity(userId) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx      = db.transaction('identities', 'readonly');
      const store   = tx.objectStore('identities');
      const request = store.get(userId);
      request.onsuccess = () => resolve(!!request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  async saveIdentity(userId, identity, password) {
    const db = await this._getDB();
    const exported  = await identity.export();
    const encrypted = await encryptData(exported, password);
    const record = {
      userId,
      encryptedIdentity: encrypted,
      createdAt:  Date.now(),
      updatedAt:  Date.now(),
      version:    1
    };
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('identities', 'readwrite');
      const store = tx.objectStore('identities');
      const req   = store.put(record);
      req.onsuccess = () => {
        console.log(`✅ Identité ${userId} sauvegardée (chiffrée)`);
        resolve(record);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async loadIdentity(userId, password) {
    const db = await this._getDB();
    const record = await new Promise((resolve, reject) => {
      const tx    = db.transaction('identities', 'readonly');
      const store = tx.objectStore('identities');
      const req   = store.get(userId);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
    if (!record) throw new Error(`Aucune identité trouvée pour ${userId}`);
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

  async updateIdentity(userId, identity, password) {
    await this.saveIdentity(userId, identity, password);
    await this._logAction(userId, 'otpk_consumed');
  }

  async savePreKeyBundle(userId, bundle) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx     = db.transaction('identities', 'readwrite');
      const store  = tx.objectStore('identities');
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

  async _logAction(userId, action) {
    const db    = await this._getDB();
    const tx    = db.transaction('prekey_log', 'readwrite');
    const store = tx.objectStore('prekey_log');
    store.add({ userId, action, timestamp: Date.now() });
  }

  async getAuditLog(userId) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx      = db.transaction('prekey_log', 'readonly');
      const store   = tx.objectStore('prekey_log');
      const index   = store.index('userId');
      const request = index.getAll(userId);
      request.onsuccess = () => resolve(request.result);
      request.onerror   = () => reject(request.error);
    });
  }

  async deleteIdentity(userId) {
    const db = await this._getDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction('identities', 'readwrite');
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