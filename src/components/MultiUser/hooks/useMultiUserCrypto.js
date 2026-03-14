import { useCallback } from 'react';
import { DHRatchet } from '../../../crypto/DHRatchet';
import { generateECDHKeyPair, performECDH, hkdf, importPublicKey } from '../../../crypto/Primitives';
import { SealedSenderEncryptor } from '../../../crypto/SealedSender';
import { X3DHIdentity, x3dhSenderInitiate, x3dhReceiverProcess } from '../../../crypto/X3DH';

export function useMultiUserCrypto({
  socket,
  username,
  roomId,
  password,
  cryptoEngine,
  storage,
  idStorage,
  showToast,
  playSound,
  markSession,
  cryptoSessionsReady,
  ratchetsRef,
  x3dhIdentityRef,
  myIdentityKeyPairRef,
  myIdentityPublicJWKRef,
  myPrivateKeyRef,
  usersRef,
  serverSigningPublicKey,
  myCertificate,
  selectedUser,
  messageText,
  verifiedContacts,
  pendingSend,
  setMyPrivateKey,
  setMyFingerprint,
  setOtpkCount,
  setJoined,
  setMessages,
  setMessageText,
  setIsTyping,
  setUnreadCount,
  setDecryptedMessages,
  setMessageKeys,
  setCurrentDecrypting,
  setPendingSend,
  setVerifiedContacts,
}) {

  // ── Fingerprint ────────────────────────────
  const computeFingerprint = async (publicKeyJWK) => {
    const pk   = await window.crypto.subtle.importKey('jwk', publicKeyJWK, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
    const spki = await window.crypto.subtle.exportKey('spki', pk);
    const hash = await window.crypto.subtle.digest('SHA-256', spki);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').match(/.{1,8}/g).join(' ');
  };

  // ── Génération clés legacy ─────────────────
  const generateLegacyKeys = async () => {
    const kp = await window.crypto.subtle.generateKey(
      { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true, ['encrypt', 'decrypt']
    );
    const publicKeyJWK  = await window.crypto.subtle.exportKey('jwk', kp.publicKey);
    const privateKeyJWK = await window.crypto.subtle.exportKey('jwk', kp.privateKey);
    setMyPrivateKey(kp.privateKey);
    myPrivateKeyRef.current = kp.privateKey;
    await storage.saveKeys(username, publicKeyJWK, privateKeyJWK);
    const fingerprint = await computeFingerprint(publicKeyJWK);
    setMyFingerprint(fingerprint);

    const identityKP = await generateECDHKeyPair();
    myIdentityKeyPairRef.current = identityKP;
    const identityPublicJWK = await window.crypto.subtle.exportKey('jwk', identityKP.publicKey);
    myIdentityPublicJWKRef.current = identityPublicJWK;

    return { publicKeyJWK, fingerprint, identityPublicJWK };
  };

  // ── joinRoom ───────────────────────────────
  const joinRoom = async () => {
    if (!socket || !roomId || !username) { showToast('Remplissez tous les champs !', 'warning'); return; }
    if (!password) { showToast('Entrez un mot de passe pour sécuriser vos clés', 'warning'); return; }
    try {
      const legacyKeys = await generateLegacyKeys();
      let x3dhId;
      const exists = await idStorage.hasIdentity(username);
      if (exists) {
        try {
          x3dhId = await idStorage.loadIdentity(username, password);
          showToast('🔑 Identité X3DH chargée depuis le stockage', 'success');
        } catch {
          showToast('⚠️ Mot de passe incorrect, nouvelle identité X3DH générée', 'warning');
          x3dhId = await new X3DHIdentity().generate();
          await idStorage.saveIdentity(username, x3dhId, password);
        }
      } else {
        x3dhId = await new X3DHIdentity().generate();
        await idStorage.saveIdentity(username, x3dhId, password);
        showToast('✅ Nouvelle identité X3DH générée et sauvegardée', 'success');
      }

      const rotated = await x3dhId.rotateSignedPreKeyIfNeeded();
      if (rotated) await idStorage.saveIdentity(username, x3dhId, password);
      x3dhIdentityRef.current = x3dhId;
      setOtpkCount(x3dhId.getRemainingOneTimePreKeyCount());

      const bundle = await x3dhId.buildPreKeyBundle();
      socket.emit('publish-prekey-bundle', { username, bundle });
      socket.emit('join-simulation', {
        roomId, username,
        publicKey: legacyKeys.publicKeyJWK,
        publicKeyFingerprint: legacyKeys.fingerprint,
        identityKey: legacyKeys.identityPublicJWK
      });

      setJoined(true);
      showToast('🔐 Connexion sécurisée à la room', 'info');

      const savedVerified = await idStorage.loadVerifiedContacts(username);
      if (savedVerified.size > 0) {
        setVerifiedContacts(savedVerified);
        showToast(`✅ ${savedVerified.size} contact(s) vérifié(s) chargé(s)`, 'info');
      }

      const saved = await storage.loadMessages(roomId);
      if (saved.length > 0) setMessages(saved);

    } catch (err) {
      console.error('❌ joinRoom:', err);
      showToast('Erreur connexion : ' + err.message, 'error');
    }
  };

  // ── toHex ──────────────────────────────────
  const toHex = (val) => {
    if (!val) return null;
    let bytes;
    if (val instanceof ArrayBuffer) bytes = new Uint8Array(val);
    else if (Array.isArray(val))    bytes = new Uint8Array(val);
    else                            bytes = new Uint8Array(val);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  // ── handleDecrypt ──────────────────────────
  const handleDecrypt = async (msg) => {
    if (setCurrentDecrypting === msg.id) return;
    setCurrentDecrypting(msg.id);

    try {
      const privateKey = myPrivateKeyRef.current;
      if (!privateKey)             throw new Error('Clé privée RSA non disponible');
      if (!serverSigningPublicKey) throw new Error('Clé serveur manquante');

      if (msg.sealed && msg.sealedMessage) {
        const unsealed       = await SealedSenderEncryptor.unseal(msg.sealedMessage, privateKey, serverSigningPublicKey);
        const senderUsername = unsealed.senderId;
        const sender         = usersRef.current.find(u => u.username === senderUsername);
        if (!sender) throw new Error('Expéditeur introuvable');

        const contactId = senderUsername;
        let ratchet = ratchetsRef.current.get(contactId);

        if (!ratchet) {
          if (msg.x3dhInit && x3dhIdentityRef.current) {
            try {
              const { sessionKey } = await x3dhReceiverProcess(x3dhIdentityRef.current, msg.x3dhInit);
              await idStorage.updateIdentity(username, x3dhIdentityRef.current, password);
              setOtpkCount(x3dhIdentityRef.current.getRemainingOneTimePreKeyCount());
              const isInitiator = username.localeCompare(contactId) < 0;
              ratchet = new DHRatchet(sessionKey, isInitiator);
              const senderIdKey = await importPublicKey(msg.x3dhInit.senderIdentityKey);
              if (isInitiator) await ratchet.initialize(await generateECDHKeyPair(), senderIdKey);
              else await ratchet.initialize(x3dhIdentityRef.current.identityKeyPair, null);
              showToast('✅ Session X3DH établie', 'success');
            } catch (e) { console.warn('X3DH échoué, fallback ECDH:', e.message); }
          }

          if (!ratchet) {
            const myKP = myIdentityKeyPairRef.current;
            if (!myKP) throw new Error('Identité ECDH locale manquante');
            const senderIdJWK = sender.identityKey || sender.certificate?.senderKey || unsealed.senderIdentity;
            if (!senderIdJWK) throw new Error('Clé identité expéditeur manquante');
            const senderIdKey  = await importPublicKey(senderIdJWK);
            const sharedSecret = await performECDH(myKP.privateKey, senderIdKey);
            const rootKey      = await hkdf(sharedSecret, new Uint8Array(32), new TextEncoder().encode('X3DH-session'), 32);
            const isInitiator  = username.localeCompare(contactId) < 0;
            ratchet = new DHRatchet(rootKey, isInitiator);
            if (isInitiator) await ratchet.initialize(await generateECDHKeyPair(), senderIdKey);
            else await ratchet.initialize(myKP, null);
          }

          ratchetsRef.current.set(contactId, ratchet);
          markSession(sender.id, 'established');
        }

        const innerBytes = new Uint8Array(unsealed.message);
        const encMsg     = JSON.parse(new TextDecoder().decode(innerBytes));
        const toBuf      = (arr) => new Uint8Array(arr).buffer;
        const decrypted  = await ratchet.decrypt({
          ...encMsg,
          ciphertext: toBuf(encMsg.ciphertext),
          iv:    toBuf(encMsg.iv),
          mac:   toBuf(encMsg.mac),
          nonce: toBuf(encMsg.nonce)
        });

        const keyInfo = {
          messageNumber:  encMsg.messageNumber ?? 0,
          sequenceNumber: encMsg.sequenceNumber ?? '—',
          aesIV:  toHex(encMsg.iv)    ? toHex(encMsg.iv).substring(0, 24)  + '…' : 'N/A',
          mac:    toHex(encMsg.mac)   ? toHex(encMsg.mac).substring(0, 16) + '…' : 'N/A',
          nonce:  toHex(encMsg.nonce) ? toHex(encMsg.nonce).substring(0, 16) + '…' : 'N/A',
          timestamp: encMsg.timestamp,
          isReal: true
        };

        setMessageKeys(prev => ({ ...prev, [msg.id]: keyInfo }));
        setDecryptedMessages(prev => ({
          ...prev,
          [msg.id]: { plaintext: decrypted, from: senderUsername, to: msg.to, timestamp: msg.timestamp, ciphertext: '(sealed)', keyInfo, compromised: false }
        }));
        setUnreadCount(prev => Math.max(0, prev - 1));
        socket.emit('message-read', { messageId: msg.id, roomId, from: senderUsername });
        showToast('✅ Message SEALED déchiffré (Double Ratchet)', 'success');
        return;
      }

      const sender = usersRef.current.find(u => u.username === msg.from);
      if (!sender) throw new Error('Expéditeur introuvable');
      if (!msg.encryptedData?.ciphertext) throw new Error('Données chiffrées manquantes');
      if (!msg.encryptedData?.encryptedSessionKey) throw new Error('Clé de session manquante');

      const plaintext = await cryptoEngine.decryptMessage(sender.id, msg.encryptedData, myPrivateKeyRef.current);
      cryptoSessionsReady.current.add(sender.id);
      markSession(sender.id, 'established');
      if (!plaintext) throw new Error('Déchiffrement retourné vide');

      const keyInfo = {
        messageNumber: msg.encryptedData.messageNumber ?? '—',
        aesIV:  msg.encryptedData.ciphertext ? msg.encryptedData.ciphertext.substring(0, 24) : 'N/A',
        mac:    'N/A',
        nonce:  msg.encryptedData.iv ? msg.encryptedData.iv.substring(0, 16) : 'N/A',
        isReal: true
      };

      setMessageKeys(prev => ({ ...prev, [msg.id]: keyInfo }));
      setDecryptedMessages(prev => ({
        ...prev,
        [msg.id]: { plaintext, from: msg.from, to: msg.to, timestamp: msg.timestamp, ciphertext: msg.encryptedData.ciphertext, keyInfo, compromised: false }
      }));
      setUnreadCount(prev => Math.max(0, prev - 1));
      socket.emit('message-read', { messageId: msg.id, roomId, from: msg.from });
      showToast('✅ Message déchiffré avec succès', 'success');

    } catch (err) {
      console.error('❌ handleDecrypt:', err);
      showToast('Erreur : ' + err.message, 'error');
      playSound('error');
    } finally {
      setCurrentDecrypting(null);
    }
  };

  // ── sendMessage ────────────────────────────
  const sendMessage = async () => {
    if (!messageText.trim() || !selectedUser) {
      showToast('Sélectionnez un destinataire et écrivez un message !', 'warning');
      return;
    }

    if (!verifiedContacts.has(selectedUser.id) && !pendingSend) {
      showToast(`⚠️ ${selectedUser.username} n'est pas vérifié — cliquez à nouveau pour envoyer quand même`, 'warning');
      setPendingSend(true);
      setTimeout(() => setPendingSend(false), 5000);
      return;
    }
    setPendingSend(false);

    try {
      if (!serverSigningPublicKey) throw new Error('Clé serveur manquante');
      if (!myCertificate)          throw new Error('Certificat expéditeur manquant');

      const contactId = selectedUser.username;
      let ratchet = ratchetsRef.current.get(contactId);
      let x3dhInitMsg = null;

      if (!ratchet) {
        markSession(selectedUser.id, 'pending');

        if (x3dhIdentityRef.current) {
          try {
            const bundlePromise = new Promise((resolve, reject) => {
              socket.emit('get-prekey-bundle', { username: contactId });
              socket.once(`prekey-bundle:${contactId}`, resolve);
              setTimeout(() => reject(new Error('timeout')), 5000);
            });
            const bundle = await bundlePromise;
            if (bundle) {
              const { sessionKey, initialMessage } = await x3dhSenderInitiate(x3dhIdentityRef.current, bundle);
              x3dhInitMsg = initialMessage;
              const isInitiator = username.localeCompare(contactId) < 0;
              ratchet = new DHRatchet(sessionKey, isInitiator);
              const spkPub = await importPublicKey(bundle.signedPreKey.publicKey);
              if (isInitiator) await ratchet.initialize(await generateECDHKeyPair(), spkPub);
              else await ratchet.initialize(x3dhIdentityRef.current.identityKeyPair, null);
              showToast(`✅ Session X3DH initiée avec ${contactId}`, 'success');
            }
          } catch (e) { console.warn('X3DH envoi échoué, fallback ECDH:', e.message); }
        }

        if (!ratchet) {
          const myKP = myIdentityKeyPairRef.current;
          if (!myKP) throw new Error('Identité ECDH locale manquante');
          const recipIdJWK = selectedUser.identityKey || selectedUser.certificate?.senderKey;
          if (!recipIdJWK) throw new Error('Clé identité destinataire manquante');
          const recipIdKey   = await importPublicKey(recipIdJWK);
          const sharedSecret = await performECDH(myKP.privateKey, recipIdKey);
          const rootKey      = await hkdf(sharedSecret, new Uint8Array(32), new TextEncoder().encode('X3DH-session'), 32);
          const isInitiator  = username.localeCompare(contactId) < 0;
          ratchet = new DHRatchet(rootKey, isInitiator);
          if (isInitiator) await ratchet.initialize(await generateECDHKeyPair(), recipIdKey);
          else await ratchet.initialize(myKP, null);
        }

        ratchetsRef.current.set(contactId, ratchet);
        markSession(selectedUser.id, 'established');
      }

      await new Promise(resolve => setTimeout(resolve, 100));
      const encRatchet = await ratchet.encrypt(messageText);
      const toArr = (buf) => Array.from(new Uint8Array(buf));
      const payload = {
        ...encRatchet,
        ciphertext: toArr(encRatchet.ciphertext),
        iv:    toArr(encRatchet.iv),
        mac:   toArr(encRatchet.mac),
        nonce: toArr(encRatchet.nonce)
      };
      const ratchetBytes = new TextEncoder().encode(JSON.stringify(payload));

      const sealed = await SealedSenderEncryptor.seal(
        Array.from(ratchetBytes),
        myCertificate,
        myIdentityKeyPairRef.current.publicKey,
        selectedUser.publicKey
      );

      socket.emit('send-sealed-message', {
        roomId,
        to: selectedUser.username,
        sealedMessage: sealed,
        x3dhInit: x3dhInitMsg
      });

      setMessageText('');
      setIsTyping(false);
      socket.emit('stop-typing', { roomId, username });
      showToast('✅ Message envoyé (Sealed Sender + Double Ratchet)', 'success');
      playSound('sent');

    } catch (err) {
      console.error('❌ sendMessage:', err);
      showToast('Erreur envoi : ' + err.message, 'error');
      playSound('error');
    }
  };

  return { joinRoom, sendMessage, handleDecrypt };
}
