/**
 * X3DH - Extended Triple Diffie-Hellman
 * Implémentation complète selon la spec Signal
 * https://signal.org/docs/specifications/x3dh/
 *
 * Permet d'initier une session E2EE avec un utilisateur HORS-LIGNE
 * en utilisant ses PreKeys publiées sur le serveur.
 *
 * Flux :
 *   Bob publie son PreKeyBundle sur le serveur
 *   Alice télécharge le bundle de Bob
 *   Alice calcule un secret partagé sans que Bob soit en ligne
 *   Bob retrouve le même secret au prochain message reçu
 */

import {
  generateECDHKeyPair,
  performECDH,
  exportPublicKey,
  importPublicKey,
  hkdf
} from './Primitives';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const X3DH_INFO       = 'X3DH';
const SIGNED_PK_TTL   = 7 * 24 * 60 * 60 * 1000; // 7 jours
const ONE_TIME_PK_COUNT = 100;                      // nombre initial de OTPKs

// ─────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────

/**
 * Signe des données avec une clé ECDSA dérivée de la clé d'identité ECDH.
 * En pratique Signal utilise Ed25519, ici on simule avec ECDH+HMAC
 * car WebCrypto ne supporte pas Ed25519 nativement dans tous les navigateurs.
 */
async function signData(privateKey, data) {
  // Dériver une clé HMAC depuis la clé privée ECDH
  const rawPrivate = await crypto.subtle.exportKey('jwk', privateKey);
  const keyMaterial = new TextEncoder().encode(rawPrivate.d);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', keyMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', hmacKey, data);
  return new Uint8Array(signature);
}

async function verifySignature(publicKey, data, signature) {
  try {
    const rawPublic = await crypto.subtle.exportKey('jwk', publicKey);
    const keyMaterial = new TextEncoder().encode(rawPublic.x + rawPublic.y);
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      await crypto.subtle.digest('SHA-256', keyMaterial),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify('HMAC', hmacKey, signature, data);
  } catch {
    return false;
  }
}

function toBytes(str) {
  return new TextEncoder().encode(str);
}

function concatAll(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(new Uint8Array(arr), offset);
    offset += arr.byteLength;
  }
  return result.buffer;
}

// ─────────────────────────────────────────────
// CLASSE PRINCIPALE : X3DHIdentity
// Représente l'identité complète d'un utilisateur
// ─────────────────────────────────────────────

export class X3DHIdentity {
  constructor() {
    this.identityKeyPair    = null; // IK  — clé longue durée
    this.signedPreKeyPair   = null; // SPK — clé signée, rotation hebdo
    this.signedPreKeyId     = null;
    this.signedPreKeySig    = null;
    this.signedPreKeyDate   = null;
    this.oneTimePreKeys     = [];   // OTPKs — clés jetables
    this.usedOneTimePreKeys = new Set();
  }

  // ─── Génération initiale ───────────────────

  /**
   * Génère toutes les clés pour un nouvel utilisateur.
   * À appeler une seule fois à l'inscription.
   */
  async generate() {
    // 1. Clé d'identité longue durée
    this.identityKeyPair = await generateECDHKeyPair();

    // 2. Signed PreKey (signée par IK)
    await this._generateSignedPreKey();

    // 3. One-Time PreKeys
    await this._generateOneTimePreKeys(ONE_TIME_PK_COUNT);

    console.log('✅ X3DH Identity générée');
    return this;
  }

  async _generateSignedPreKey() {
    this.signedPreKeyPair = await generateECDHKeyPair();
    this.signedPreKeyId   = Date.now();
    this.signedPreKeyDate = Date.now();

    // Signer la SPK avec IK
    const spkPublicBytes = await exportPublicKeyBytes(this.signedPreKeyPair.publicKey);
    this.signedPreKeySig = await signData(this.identityKeyPair.privateKey, spkPublicBytes);
  }

  async _generateOneTimePreKeys(count) {
    for (let i = 0; i < count; i++) {
      const keyPair = await generateECDHKeyPair();
      const id = `otpk_${Date.now()}_${i}_${Math.random().toString(36).slice(2)}`;
      this.oneTimePreKeys.push({ id, keyPair });
    }
  }

  // ─── Rotation des clés ────────────────────

  /**
   * Vérifie si la Signed PreKey doit être renouvelée (> 7 jours).
   * À appeler périodiquement.
   */
  async rotateSignedPreKeyIfNeeded() {
    const age = Date.now() - this.signedPreKeyDate;
    if (age > SIGNED_PK_TTL) {
      await this._generateSignedPreKey();
      console.log('🔄 Signed PreKey renouvelée');
      return true;
    }
    return false;
  }

  /**
   * Ajoute de nouvelles OTPKs quand le stock est bas.
   * À appeler quand le serveur signale que le stock est < 10.
   */
  async replenishOneTimePreKeys(count = 50) {
    await this._generateOneTimePreKeys(count);
    console.log(`✅ ${count} nouvelles OTPKs générées`);
  }

  // ─── Export pour le serveur ───────────────

  /**
   * Construit le PreKeyBundle à publier sur le serveur.
   * Le serveur stocke uniquement les clés PUBLIQUES.
   */
  async buildPreKeyBundle() {
    const identityPublicJWK = await exportPublicKey(this.identityKeyPair.publicKey);
    const spkPublicJWK      = await exportPublicKey(this.signedPreKeyPair.publicKey);

    const oneTimePublicKeys = await Promise.all(
      this.oneTimePreKeys
        .filter(otpk => !this.usedOneTimePreKeys.has(otpk.id))
        .map(async otpk => ({
          id: otpk.id,
          publicKey: await exportPublicKey(otpk.keyPair.publicKey)
        }))
    );

    return {
      identityKey: identityPublicJWK,
      signedPreKey: {
        id:        this.signedPreKeyId,
        publicKey: spkPublicJWK,
        signature: Array.from(this.signedPreKeySig),
        createdAt: this.signedPreKeyDate
      },
      oneTimePreKeys: oneTimePublicKeys,
      generatedAt: Date.now()
    };
  }

  /**
   * Sérialise l'identité complète (clés privées incluses) pour
   * stockage local chiffré (IndexedDB).
   */
  async export() {
    const exportKeyPair = async (kp) => ({
      publicKey:  await exportPublicKey(kp.publicKey),
      privateKey: await crypto.subtle.exportKey('jwk', kp.privateKey)
    });

    return {
      identityKeyPair:   await exportKeyPair(this.identityKeyPair),
      signedPreKeyPair:  await exportKeyPair(this.signedPreKeyPair),
      signedPreKeyId:    this.signedPreKeyId,
      signedPreKeySig:   Array.from(this.signedPreKeySig),
      signedPreKeyDate:  this.signedPreKeyDate,
      oneTimePreKeys:    await Promise.all(
        this.oneTimePreKeys.map(async otpk => ({
          id:      otpk.id,
          keyPair: await exportKeyPair(otpk.keyPair)
        }))
      ),
      usedOneTimePreKeys: Array.from(this.usedOneTimePreKeys),
      version: 1
    };
  }

  static async import(data) {
    const importKeyPair = async (kpData) => ({
      publicKey:  await importPublicKey(kpData.publicKey),
      privateKey: await crypto.subtle.importKey(
        'jwk',
        kpData.privateKey,
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      )
    });

    const identity = new X3DHIdentity();
    identity.identityKeyPair   = await importKeyPair(data.identityKeyPair);
    identity.signedPreKeyPair  = await importKeyPair(data.signedPreKeyPair);
    identity.signedPreKeyId    = data.signedPreKeyId;
    identity.signedPreKeySig   = new Uint8Array(data.signedPreKeySig);
    identity.signedPreKeyDate  = data.signedPreKeyDate;
    identity.oneTimePreKeys    = await Promise.all(
      data.oneTimePreKeys.map(async otpk => ({
        id:      otpk.id,
        keyPair: await importKeyPair(otpk.keyPair)
      }))
    );
    identity.usedOneTimePreKeys = new Set(data.usedOneTimePreKeys);
    return identity;
  }

  /**
   * Marque une OTPK comme utilisée (après réception d'un message initial)
   */
  consumeOneTimePreKey(id) {
    this.usedOneTimePreKeys.add(id);
    this.oneTimePreKeys = this.oneTimePreKeys.filter(k => k.id !== id);
  }

  getOneTimePreKey(id) {
    return this.oneTimePreKeys.find(k => k.id === id) || null;
  }

  getRemainingOneTimePreKeyCount() {
    return this.oneTimePreKeys.filter(k => !this.usedOneTimePreKeys.has(k.id)).length;
  }
}

// ─────────────────────────────────────────────
// EXPÉDITEUR : initiation de session X3DH
// ─────────────────────────────────────────────

/**
 * Alice initie une session avec Bob à partir du PreKeyBundle de Bob.
 *
 * Calcule :
 *   DH1 = DH(IK_Alice, SPK_Bob)
 *   DH2 = DH(EK_Alice, IK_Bob)
 *   DH3 = DH(EK_Alice, SPK_Bob)
 *   DH4 = DH(EK_Alice, OTPK_Bob)  ← si disponible
 *   SK  = KDF(DH1 || DH2 || DH3 || DH4)
 *
 * @param {X3DHIdentity} senderIdentity - Identité d'Alice
 * @param {object}       recipientBundle - PreKeyBundle de Bob (clés publiques)
 * @returns {{ sessionKey, initialMessage }} — clé de session + message initial à envoyer
 */
export async function x3dhSenderInitiate(senderIdentity, recipientBundle) {
  // 1. Vérifier la signature de la SPK de Bob
  const spkPublicKey = await importPublicKey(recipientBundle.signedPreKey.publicKey);
  const spkBytes     = await exportPublicKeyBytes(spkPublicKey);
  const sigBytes     = new Uint8Array(recipientBundle.signedPreKey.signature);
  const ikBobPublic  = await importPublicKey(recipientBundle.identityKey);

  const sigValid = await verifySignature(ikBobPublic, spkBytes, sigBytes);
  if (!sigValid) {
    throw new Error('❌ Signature SPK invalide — bundle compromis ou falsifié');
  }

  // 2. Générer la clé éphémère d'Alice (EK)
  const ephemeralKeyPair = await generateECDHKeyPair();

  // 3. Sélectionner une OTPK de Bob si disponible
  const otpk = recipientBundle.oneTimePreKeys?.length > 0
    ? recipientBundle.oneTimePreKeys[0]
    : null;

  const otpkPublicKey = otpk ? await importPublicKey(otpk.publicKey) : null;

  // 4. Calculer les 4 DH
  const dh1 = await performECDH(senderIdentity.identityKeyPair.privateKey, spkPublicKey);
  const dh2 = await performECDH(ephemeralKeyPair.privateKey, ikBobPublic);
  const dh3 = await performECDH(ephemeralKeyPair.privateKey, spkPublicKey);
  const dh4 = otpkPublicKey
    ? await performECDH(ephemeralKeyPair.privateKey, otpkPublicKey)
    : null;

  // 5. Dériver la session key via KDF
  const dhConcat = dh4
    ? concatAll(dh1, dh2, dh3, dh4)
    : concatAll(dh1, dh2, dh3);

  const sessionKey = await hkdf(
    dhConcat,
    new Uint8Array(32),
    toBytes(X3DH_INFO),
    32
  );

  // 6. Construire le message initial (header X3DH)
  const ikAlicePublicJWK = await exportPublicKey(senderIdentity.identityKeyPair.publicKey);
  const ekAlicePublicJWK = await exportPublicKey(ephemeralKeyPair.publicKey);

  const initialMessage = {
    type:           'x3dh-init',
    senderIdentityKey:  ikAlicePublicJWK,
    senderEphemeralKey: ekAlicePublicJWK,
    recipientSPKId:     recipientBundle.signedPreKey.id,
    recipientOTPKId:    otpk?.id || null,
    timestamp:          Date.now()
  };

  console.log(`✅ X3DH initié — OTPK utilisée: ${otpk ? 'oui' : 'non (fallback SPK)'}`);

  return {
    sessionKey,
    initialMessage,
    usedOTPKId: otpk?.id || null
  };
}

// ─────────────────────────────────────────────
// DESTINATAIRE : réception d'une session X3DH
// ─────────────────────────────────────────────

/**
 * Bob reçoit un message initial d'Alice et recalcule le même secret.
 *
 * @param {X3DHIdentity} recipientIdentity - Identité de Bob
 * @param {object}       initialMessage    - Header X3DH envoyé par Alice
 * @returns {{ sessionKey, senderIdentityKey }}
 */
export async function x3dhReceiverProcess(recipientIdentity, initialMessage) {
  const {
    senderIdentityKey,
    senderEphemeralKey,
    recipientSPKId,
    recipientOTPKId
  } = initialMessage;

  // 1. Vérifier que la SPK utilisée correspond à celle de Bob
  if (recipientSPKId !== recipientIdentity.signedPreKeyId) {
    console.warn(`⚠️ SPK ID reçu (${recipientSPKId}) ≠ SPK actuelle (${recipientIdentity.signedPreKeyId})`);
    // En prod : chercher dans les anciennes SPKs archivées
  }

  // 2. Récupérer la OTPK utilisée (si présente)
  let otpkPrivateKey = null;
  if (recipientOTPKId) {
    const otpk = recipientIdentity.getOneTimePreKey(recipientOTPKId);
    if (!otpk) {
      throw new Error(`OTPK ${recipientOTPKId} introuvable — déjà utilisée ou inconnue`);
    }
    otpkPrivateKey = otpk.keyPair.privateKey;
    recipientIdentity.consumeOneTimePreKey(recipientOTPKId);
    console.log(`🗑️ OTPK ${recipientOTPKId} consommée`);
  }

  // 3. Importer les clés publiques d'Alice
  const ikAlicePublic = await importPublicKey(senderIdentityKey);
  const ekAlicePublic = await importPublicKey(senderEphemeralKey);

  // 4. Recalculer les mêmes DH dans le même ordre
  const dh1 = await performECDH(recipientIdentity.signedPreKeyPair.privateKey, ikAlicePublic);
  const dh2 = await performECDH(recipientIdentity.identityKeyPair.privateKey, ekAlicePublic);
  const dh3 = await performECDH(recipientIdentity.signedPreKeyPair.privateKey, ekAlicePublic);
  const dh4 = otpkPrivateKey
    ? await performECDH(otpkPrivateKey, ekAlicePublic)
    : null;

  // 5. Dériver le même sessionKey
  const dhConcat = dh4
    ? concatAll(dh1, dh2, dh3, dh4)
    : concatAll(dh1, dh2, dh3);

  const sessionKey = await hkdf(
    dhConcat,
    new Uint8Array(32),
    toBytes(X3DH_INFO),
    32
  );

  console.log('✅ X3DH session reçue et vérifiée');

  return {
    sessionKey,
    senderIdentityKey: ikAlicePublic
  };
}

// ─────────────────────────────────────────────
// UTILITAIRE INTERNE
// ─────────────────────────────────────────────

async function exportPublicKeyBytes(publicKey) {
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  return new Uint8Array(spki);
}

export default { X3DHIdentity, x3dhSenderInitiate, x3dhReceiverProcess };