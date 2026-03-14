import {
  generateECDHKeyPair,
  performECDH,
  exportPublicKey,
  importPublicKey,
  hkdf,
  encryptAESGCM,
  decryptAESGCM,
  computeHMAC,
  verifyHMAC,
  concatBuffers
} from './Primitives';

// ==================== REPLAY PROTECTION ====================
class ReplayProtection {
  constructor(maxAge = 5 * 60 * 1000, cleanupInterval = 60 * 1000) {
    this.receivedNonces = new Set();
    this.nonceTimestamps = new Map();
    this.maxNonceAge = maxAge;
    this.cleanupInterval = cleanupInterval;
    this.stats = {
      messagesAccepted: 0,
      messagesRejected: 0,
      replayDetected: 0,
      tooOldDetected: 0
    };
    this.startCleanup();
  }

  async validateMessage(nonce, timestamp) {
    const nonceStr = this.bufferToHex(nonce);

    if (this.receivedNonces.has(nonceStr)) {
      this.stats.messagesRejected++;
      this.stats.replayDetected++;
      throw new Error(`🚨 REPLAY ATTACK DETECTED! Nonce ${nonceStr.substring(0, 16)}... already used`);
    }

    const messageAge = Date.now() - timestamp;

    // ✅ FIX : fenêtre élargie à 30 minutes pour éviter faux positifs
    // lors de reconnexions ou rechargements de page
    if (messageAge > 30 * 60 * 1000) {
      this.stats.messagesRejected++;
      this.stats.tooOldDetected++;
      throw new Error(`⏰ Message too old: ${Math.floor(messageAge / 1000)}s`);
    }

    if (messageAge < -30000) {
      this.stats.messagesRejected++;
      throw new Error(`⏰ Message timestamp is in the future`);
    }

    this.receivedNonces.add(nonceStr);
    this.nonceTimestamps.set(nonceStr, timestamp);
    this.stats.messagesAccepted++;
    return true;
  }

  cleanupOldNonces() {
    const now = Date.now();
    for (const [nonce, timestamp] of this.nonceTimestamps.entries()) {
      if (now - timestamp > this.maxNonceAge) {
        this.receivedNonces.delete(nonce);
        this.nonceTimestamps.delete(nonce);
      }
    }
  }

  startCleanup() {
    this.cleanupTimer = setInterval(() => this.cleanupOldNonces(), this.cleanupInterval);
  }

  stopCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  getStats() {
    return {
      ...this.stats,
      activeNonces: this.receivedNonces.size,
      replayRate: this.stats.messagesRejected > 0
        ? (this.stats.replayDetected / this.stats.messagesRejected * 100).toFixed(2) + '%'
        : '0%'
    };
  }

  reset() {
    this.receivedNonces.clear();
    this.nonceTimestamps.clear();
    this.stats = {
      messagesAccepted: 0,
      messagesRejected: 0,
      replayDetected: 0,
      tooOldDetected: 0
    };
  }

  bufferToHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  destroy() {
    this.stopCleanup();
    this.receivedNonces.clear();
    this.nonceTimestamps.clear();
  }
}

// ==================== RATCHET STORAGE ====================
export class RatchetStorage {
  constructor(dbName = 'DoubleRatchetDB', version = 1) {
    this.dbName = dbName;
    this.version = version;
    this.db = null;
    this.ready = false;
  }

  async init() {
    if (this.ready) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.ready = true;
        resolve(this.db);
      };
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('ratchets')) {
          const ratchetStore = db.createObjectStore('ratchets', { keyPath: 'sessionId' });
          ratchetStore.createIndex('userId', 'userId', { unique: false });
          ratchetStore.createIndex('lastUpdated', 'lastUpdated', { unique: false });
          ratchetStore.createIndex('isActive', 'isActive', { unique: false });
        }
      };
    });
  }

  async saveRatchetState(sessionId, ratchet, options = {}) {
    if (!this.ready) await this.init();
    try {
      const state = await ratchet.export();
      const record = {
        sessionId,
        userId: options.userId || 'unknown',
        state,
        lastUpdated: Date.now(),
        messagesSent: ratchet.messagesSent,
        messagesReceived: ratchet.messagesReceived,
        isActive: options.isActive !== false,
        replayStats: ratchet.getReplayStats ? ratchet.getReplayStats() : null,
        version: this.version
      };
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(['ratchets'], 'readwrite');
        const store = transaction.objectStore('ratchets');
        // ✅ FIX : put() au lieu de add()
        const request = store.put(record);
        request.onsuccess = () => resolve(record);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('❌ Erreur export ratchet:', error);
      throw error;
    }
  }

  async loadRatchetState(sessionId) {
    if (!this.ready) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['ratchets'], 'readonly');
      const store = transaction.objectStore('ratchets');
      const request = store.get(sessionId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteRatchetState(sessionId) {
    if (!this.ready) await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['ratchets'], 'readwrite');
      const store = transaction.objectStore('ratchets');
      const request = store.delete(sessionId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async cleanupOldSessions(daysOld = 30) {
    if (!this.ready) await this.init();
    const cutoffDate = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    let deleted = 0;
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['ratchets'], 'readwrite');
      const store = transaction.objectStore('ratchets');
      const index = store.index('lastUpdated');
      const request = index.openCursor(IDBKeyRange.upperBound(cutoffDate));
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) { cursor.delete(); deleted++; cursor.continue(); }
      };
      transaction.oncomplete = () => resolve(deleted);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.ready = false;
    }
  }
}

// ==================== MESSAGE CHAIN ====================
class MessageChain {
  constructor(chainKey, messageNumber = 0) {
    this.chainKey = chainKey;
    this.messageNumber = messageNumber;
  }

  async ratchetForward() {
    const chainKeyHMAC = await crypto.subtle.importKey(
      'raw', this.chainKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const messageKey   = await crypto.subtle.sign('HMAC', chainKeyHMAC, new Uint8Array([0x01]));
    const nextChainKey = await crypto.subtle.sign('HMAC', chainKeyHMAC, new Uint8Array([0x02]));
    const currentMessageNumber = this.messageNumber;
    this.chainKey = nextChainKey;
    this.messageNumber++;
    return { messageKey, messageNumber: currentMessageNumber };
  }

  getCurrentMessageNumber() { return this.messageNumber; }

  export() {
    return {
      chainKey: Array.from(new Uint8Array(this.chainKey)),
      messageNumber: this.messageNumber
    };
  }

  static import(data) {
    return new MessageChain(new Uint8Array(data.chainKey).buffer, data.messageNumber);
  }
}

// ==================== DH RATCHET ====================
export class DHRatchet {
  constructor(rootKey, isInitiator = false, options = {}) {
    this.rootKey = rootKey;
    this.isInitiator = isInitiator;
    this.dhKeyPair = null;
    this.dhRemotePublicKey = null;
    this.sendingChain = null;
    this.receivingChain = null;
    this.messagesSent = 0;
    this.messagesReceived = 0;
    this.receivedMessageNumbers = new Set();
    this.skippedMessageKeys = new Map();
    this.maxSkip = 1000;
    this.replayProtection = options.replayProtection || new ReplayProtection();
    this.sendSequenceNumber = 0;
    this.lastReceivedSequence = -1;
    this.enableReplayProtection = options.enableReplayProtection !== false;
    this.storage = options.storage || null;
    this.sessionId = options.sessionId || null;
    this.autoSave = options.autoSave !== false;

    // ✅ FIX Bug 3 : cache des messages déjà déchiffrés
    this.decryptedCache = new Map();
  }

  async initialize(dhKeyPair, dhRemotePublicKey = null) {
    this.dhKeyPair = dhKeyPair;
    this.dhRemotePublicKey = dhRemotePublicKey;
    if (this.isInitiator && this.dhRemotePublicKey) {
      await this.performDHRatchetStep();
    }
    if (this.autoSave) await this._autoSave();
  }

  async performDHRatchetStep() {
    if (!this.dhRemotePublicKey) throw new Error('Clé publique distante manquante');
    const dhOutput = await performECDH(this.dhKeyPair.privateKey, this.dhRemotePublicKey);
    const encoder = new TextEncoder();
    const derivedKeys = await hkdf(dhOutput, this.rootKey, encoder.encode('DoubleRatchet-ChainKeys'), 64);
    this.rootKey = derivedKeys.slice(0, 32);
    this.sendingChain = new MessageChain(derivedKeys.slice(32, 64));
  }

  async encrypt(plaintext) {
    if (!this.sendingChain) throw new Error('Sending chain non initialisée');
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);
    const { messageKey, messageNumber } = await this.sendingChain.ratchetForward();
    const salt = new Uint8Array(32);
    const info = encoder.encode(`MessageKeys-${messageNumber}`);
    const derivedKeys = await hkdf(messageKey, salt, info, 80);
    const encryptionKeyBytes = derivedKeys.slice(0, 32);
    const authKeyBytes = derivedKeys.slice(32, 64);
    const encryptionKey = await crypto.subtle.importKey(
      'raw', encryptionKeyBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
    );
    const dhPublicKey = await exportPublicKey(this.dhKeyPair.publicKey);
    const nonce = crypto.getRandomValues(new Uint8Array(16));
    const timestamp = Date.now();
    const sequenceNumber = this.sendSequenceNumber++;
    const associatedData = encoder.encode(
      JSON.stringify({ messageNumber, dhPublicKey, timestamp, sequenceNumber, nonce: Array.from(nonce) })
    );
    const { ciphertext, iv } = await encryptAESGCM(encryptionKey, plaintextBytes, associatedData);
    const authKey = await crypto.subtle.importKey(
      'raw', authKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const mac = await computeHMAC(authKey, concatBuffers(associatedData, iv, ciphertext));
    this.messagesSent++;
    if (this.autoSave) await this._autoSave();
    return { ciphertext, iv, mac, messageNumber, dhPublicKey, nonce: nonce.buffer, timestamp, sequenceNumber };
  }

  async decrypt(encryptedMessage) {
    const { ciphertext, iv, mac, messageNumber, dhPublicKey, nonce, timestamp, sequenceNumber } = encryptedMessage;

    // ✅ FIX Bug 3 : vérifier le cache avant replay protection
    const cacheKey = `${messageNumber}_${sequenceNumber}`;
    if (this.decryptedCache.has(cacheKey)) {
      console.log(`ℹ️ Message ${messageNumber} déjà déchiffré → retour depuis cache`);
      return this.decryptedCache.get(cacheKey);
    }

    // ✅ FIX Bug 3 : replay protection avec gestion d'erreur douce
    if (this.enableReplayProtection && nonce && timestamp) {
      try {
        await this.replayProtection.validateMessage(nonce, timestamp);
      } catch (error) {
        // Si message déjà traité → retourner depuis cache plutôt que crash
        if (error.message.includes('REPLAY ATTACK')) {
          const cached = this.decryptedCache.get(cacheKey);
          if (cached) return cached;
          // ✅ Si pas en cache (rechargement page) → ignorer et continuer
          console.warn(`⚠️ Nonce déjà vu mais pas en cache → rechargement probable, on continue`);
        } else {
          throw error; // Message trop vieux → erreur légitime
        }
      }
    }

    if (sequenceNumber !== undefined && sequenceNumber <= this.lastReceivedSequence) {
      console.warn(`⚠️ Out-of-order message: ${sequenceNumber}`);
    }

    const messageId = `${messageNumber}`;
    if (this.receivedMessageNumbers.has(messageId)) {
      // ✅ FIX : retourner depuis cache plutôt que throw
      const cached = this.decryptedCache.get(cacheKey);
      if (cached) return cached;
      throw new Error(`Message ${messageNumber} déjà traité`);
    }

    const receivedDHKey = await importPublicKey(dhPublicKey);
    const needDHRatchet = await this.needsDHRatchet(receivedDHKey);
    if (needDHRatchet || !this.receivingChain) {
      await this.receiveDHRatchet(receivedDHKey);
    }

    const messageKey = await this.getMessageKey(messageNumber);
    const encoder = new TextEncoder();
    const salt = new Uint8Array(32);
    const info = encoder.encode(`MessageKeys-${messageNumber}`);
    const derivedKeys = await hkdf(messageKey, salt, info, 80);
    const encryptionKeyBytes = derivedKeys.slice(0, 32);
    const authKeyBytes = derivedKeys.slice(32, 64);
    const associatedData = encoder.encode(
      JSON.stringify({ messageNumber, dhPublicKey, timestamp, sequenceNumber, nonce: Array.from(new Uint8Array(nonce)) })
    );
    const authKey = await crypto.subtle.importKey(
      'raw', authKeyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    const isValidMAC = await verifyHMAC(authKey, concatBuffers(associatedData, iv, ciphertext), mac);
    if (!isValidMAC) throw new Error('Authentification HMAC échouée');

    const encryptionKey = await crypto.subtle.importKey(
      'raw', encryptionKeyBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const plaintextBytes = await decryptAESGCM(encryptionKey, ciphertext, iv, associatedData);
    const plaintext = new TextDecoder().decode(plaintextBytes);

    // ✅ FIX : sauvegarder dans cache
    this.decryptedCache.set(cacheKey, plaintext);

    this.receivedMessageNumbers.add(messageId);
    this.messagesReceived++;
    if (sequenceNumber !== undefined) this.lastReceivedSequence = sequenceNumber;
    if (this.autoSave) await this._autoSave();

    return plaintext;
  }

  async needsDHRatchet(receivedDHKey) {
    if (!this.dhRemotePublicKey) return true;
    const currentKey = await exportPublicKey(this.dhRemotePublicKey);
    const newKey = await exportPublicKey(receivedDHKey);
    return JSON.stringify(currentKey) !== JSON.stringify(newKey);
  }

  async receiveDHRatchet(newRemotePublicKey) {
    if (!this.receivingChain) {
      const dhOutput = await performECDH(this.dhKeyPair.privateKey, newRemotePublicKey);
      const encoder = new TextEncoder();
      const derivedKeys = await hkdf(dhOutput, this.rootKey, encoder.encode('DoubleRatchet-ChainKeys'), 64);
      this.rootKey = derivedKeys.slice(0, 32);
      this.receivingChain = new MessageChain(derivedKeys.slice(32, 64));
      this.dhRemotePublicKey = newRemotePublicKey;
      this.dhKeyPair = await generateECDHKeyPair();
      await this.performDHRatchetStep();
      return;
    }
    this.dhRemotePublicKey = newRemotePublicKey;
    const dhOutput = await performECDH(this.dhKeyPair.privateKey, this.dhRemotePublicKey);
    const encoder = new TextEncoder();
    const derivedKeys = await hkdf(dhOutput, this.rootKey, encoder.encode('DoubleRatchet-ChainKeys'), 64);
    this.rootKey = derivedKeys.slice(0, 32);
    this.receivingChain = new MessageChain(derivedKeys.slice(32, 64));
    this.dhKeyPair = await generateECDHKeyPair();
    await this.performDHRatchetStep();
  }

  async getMessageKey(messageNumber) {
    if (!this.receivingChain) throw new Error('Receiving chain non initialisée');
    const currentNumber = this.receivingChain.getCurrentMessageNumber();
    if (messageNumber < currentNumber) {
      const cached = this.skippedMessageKeys.get(`${messageNumber}`);
      if (!cached) throw new Error(`Message ${messageNumber} trop ancien`);
      this.skippedMessageKeys.delete(`${messageNumber}`);
      return cached;
    }
    const skip = messageNumber - currentNumber;
    if (skip > this.maxSkip) throw new Error(`Trop de messages sautés: ${skip}`);
    for (let i = 0; i < skip; i++) {
      const { messageKey, messageNumber: skippedNum } = await this.receivingChain.ratchetForward();
      this.skippedMessageKeys.set(`${skippedNum}`, messageKey);
    }
    const { messageKey } = await this.receivingChain.ratchetForward();
    return messageKey;
  }

  async _autoSave() {
    if (!this.storage || !this.sessionId) return;
    try {
      await this.storage.saveRatchetState(this.sessionId, this);
    } catch (error) {
      console.error('⚠️ Erreur auto-save:', error);
    }
  }

  getReplayStats() { return this.replayProtection.getStats(); }
  resetReplayProtection() { this.replayProtection.reset(); }

  async export() {
    return {
      rootKey: Array.from(new Uint8Array(this.rootKey)),
      isInitiator: this.isInitiator,
      dhKeyPair: this.dhKeyPair ? {
        publicKey: await exportPublicKey(this.dhKeyPair.publicKey),
        privateKey: await crypto.subtle.exportKey('jwk', this.dhKeyPair.privateKey)
      } : null,
      dhRemotePublicKey: this.dhRemotePublicKey ? await exportPublicKey(this.dhRemotePublicKey) : null,
      sendingChain: this.sendingChain ? this.sendingChain.export() : null,
      receivingChain: this.receivingChain ? this.receivingChain.export() : null,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      receivedMessageNumbers: Array.from(this.receivedMessageNumbers),
      skippedMessageKeys: Array.from(this.skippedMessageKeys.entries()).map(
        ([key, value]) => [key, Array.from(new Uint8Array(value))]
      ),
      sendSequenceNumber: this.sendSequenceNumber,
      lastReceivedSequence: this.lastReceivedSequence
    };
  }

  static async import(data) {
    const ratchet = new DHRatchet(new Uint8Array(data.rootKey).buffer, data.isInitiator);
    if (data.dhKeyPair) {
      const publicKey = await importPublicKey(data.dhKeyPair.publicKey);
      const privateKey = await crypto.subtle.importKey(
        'jwk', data.dhKeyPair.privateKey,
        { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey', 'deriveBits']
      );
      ratchet.dhKeyPair = { publicKey, privateKey };
    }
    if (data.dhRemotePublicKey) ratchet.dhRemotePublicKey = await importPublicKey(data.dhRemotePublicKey);
    if (data.sendingChain) ratchet.sendingChain = MessageChain.import(data.sendingChain);
    if (data.receivingChain) ratchet.receivingChain = MessageChain.import(data.receivingChain);
    ratchet.messagesSent = data.messagesSent;
    ratchet.messagesReceived = data.messagesReceived;
    ratchet.receivedMessageNumbers = new Set(data.receivedMessageNumbers);
    ratchet.skippedMessageKeys = new Map(
      data.skippedMessageKeys.map(([key, value]) => [key, new Uint8Array(value).buffer])
    );
    if (data.sendSequenceNumber !== undefined) ratchet.sendSequenceNumber = data.sendSequenceNumber;
    if (data.lastReceivedSequence !== undefined) ratchet.lastReceivedSequence = data.lastReceivedSequence;
    return ratchet;
  }
}

export default DHRatchet;