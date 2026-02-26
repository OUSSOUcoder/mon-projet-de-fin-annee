import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { EnhancedCrypto } from '../crypto/EnhancedCrypto';
import { PersistentStorage } from '../utils/PersistentStorage';
import soundGenerator from '../utils/SoundGenerator';
import { DHRatchet } from '../crypto/DHRatchet';
import { generateECDHKeyPair, performECDH, hkdf, importPublicKey } from '../crypto/Primitives';
import { SealedSenderEncryptor } from '../crypto/SealedSender';
import { X3DHIdentity, x3dhSenderInitiate, x3dhReceiverProcess } from '../crypto/X3DH';
import { IdentityStorage } from '../crypto/IdentityStorage';
import { SenderKeyStore, GroupManager } from '../crypto/SenderKeyProtocol';

// ─────────────────────────────────────────────
// COMPOSANTS UI
// ─────────────────────────────────────────────

function Toast({ message, type = 'info', onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const colors = {
    info:    'bg-blue-600 border-blue-500',
    success: 'bg-green-600 border-green-500',
    warning: 'bg-yellow-600 border-yellow-500',
    error:   'bg-red-600 border-red-500'
  };
  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };

  return (
    <div className={`${colors[type]} border-l-4 p-4 rounded-lg shadow-xl backdrop-blur-sm animate-slide-in`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold">{icons[type]}</span>
          <p className="text-white font-medium text-sm">{message}</p>
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white text-lg leading-none font-bold">×</button>
      </div>
    </div>
  );
}

function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {toasts.map((t) => (
        <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
      ))}
    </div>
  );
}

function TypingIndicator({ users }) {
  if (users.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-lg text-sm text-gray-300">
      <div className="flex gap-1">
        {[0, 150, 300].map(d => (
          <span key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
      <span>
        {users.length === 1
          ? `${users[0]} est en train d'écrire...`
          : `${users.length} personnes écrivent...`}
      </span>
    </div>
  );
}

// Badge clés affiché directement sur le message dans la liste
function MessageKeyBadge({ keyInfo }) {
  if (!keyInfo) return null;
  return (
    <div className="mt-1 flex items-center gap-1 flex-wrap">
      <span className="text-[9px] bg-purple-900/60 border border-purple-500/40 text-purple-300 px-1.5 py-0.5 rounded font-mono">
        #msg {keyInfo.messageNumber}
      </span>
      <span className="text-[9px] bg-green-900/60 border border-green-500/40 text-green-300 px-1.5 py-0.5 rounded font-mono" title="AES-GCM IV">
        IV: {keyInfo.aesIV || keyInfo.aesKey || 'N/A'}
      </span>
      <span className="text-[9px] bg-yellow-900/60 border border-yellow-500/40 text-yellow-300 px-1.5 py-0.5 rounded font-mono" title="HMAC-SHA256">
        MAC: {keyInfo.mac || 'N/A'}
      </span>
      <span className="text-[9px] bg-blue-900/60 border border-blue-500/40 text-blue-300 px-1.5 py-0.5 rounded font-mono" title="Nonce anti-replay">
        🎲 {keyInfo.nonce || 'N/A'}
      </span>
    </div>
  );
}

// Badge statut de session
function SessionBadge({ status }) {
  if (status === 'established') return (
    <span className="inline-flex items-center gap-1 text-xs bg-green-900/60 border border-green-500/50 text-green-300 px-2 py-0.5 rounded-full font-semibold">
      <span className="w-1.5 h-1.5 bg-green-400 rounded-full inline-block animate-pulse" />
      Session établie
    </span>
  );
  if (status === 'pending') return (
    <span className="inline-flex items-center gap-1 text-xs bg-yellow-900/60 border border-yellow-500/50 text-yellow-300 px-2 py-0.5 rounded-full font-semibold">
      <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full inline-block" />
      Session en cours…
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-700/60 border border-gray-500/50 text-gray-400 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 bg-gray-500 rounded-full inline-block" />
      Pas de session
    </span>
  );
}

// ─────────────────────────────────────────────
// MITM PANEL
// ─────────────────────────────────────────────

function InterceptCard({ log, index }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-gray-900 border border-red-500/30 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-red-900/10 transition-colors" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2">
          <span className="text-red-400 font-bold text-xs">#{index + 1}</span>
          <span className="text-orange-400 text-xs font-mono">{log.from} → {log.to}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${log.messageType === 'SEALED_SENDER' ? 'bg-purple-900/60 text-purple-300 border border-purple-500/40' : 'bg-blue-900/60 text-blue-300 border border-blue-500/40'}`}>
            {log.messageType === 'SEALED_SENDER' ? '🔐 SEALED' : '🔒 E2EE'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] bg-green-900/60 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded font-bold">✓ E2EE INTACT</span>
          <span className="text-gray-500 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-red-500/20 space-y-2 pt-2">
          <div className="bg-red-950/40 border border-red-500/30 rounded p-2">
            <p className="text-red-400 text-[10px] font-bold mb-1">❌ Tentative de déchiffrement</p>
            <p className="text-gray-400 text-[10px]"><span className="text-gray-500">Résultat :</span> <span className="text-red-300">ÉCHEC</span></p>
            <p className="text-gray-400 text-[10px] mt-1"><span className="text-gray-500">Raison :</span> {log.decryptAttempt?.reason}</p>
            <p className="text-green-400 text-[10px] mt-1 font-semibold">{log.decryptAttempt?.e2eeStatus}</p>
          </div>
          <div className="bg-yellow-950/30 border border-yellow-500/20 rounded p-2">
            <p className="text-yellow-400 text-[10px] font-bold mb-1">👁️ Ce que l'attaquant PEUT voir :</p>
            <div className="space-y-0.5">
              {log.visibleMetadata && Object.entries(log.visibleMetadata).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-gray-500 text-[10px]">{k}:</span>
                  <span className="text-yellow-300 text-[10px] font-mono">{String(v)}</span>
                </div>
              ))}
              <div className="flex justify-between">
                <span className="text-gray-500 text-[10px]">heure:</span>
                <span className="text-yellow-300 text-[10px] font-mono">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
            </div>
            <p className="text-red-400 text-[9px] mt-1 font-semibold">⚠️ Contenu : ILLISIBLE (chiffré E2EE)</p>
          </div>
          {log.networkMetadata && (
            <div className="bg-gray-800/50 rounded p-2">
              <p className="text-gray-400 text-[10px] font-bold mb-1">📡 Métadonnées réseau :</p>
              <div className="grid grid-cols-2 gap-1 text-[10px]">
                <div><span className="text-gray-500">Taille: </span><span className="text-gray-300">{log.networkMetadata.size} octets</span></div>
                <div><span className="text-gray-500">X3DH: </span><span className="text-gray-300">{log.networkMetadata.hasX3DHInit ? '✓ oui' : '✗ non'}</span></div>
              </div>
            </div>
          )}
          <p className="text-[9px] text-gray-600 italic">{log.decryptAttempt?.attackerNote}</p>
        </div>
      )}
    </div>
  );
}

function MITMPanel({ socket, users, username, roomId }) {
  const [mitmActive, setMitmActive]           = useState(false);
  const [targets, setTargets]                 = useState([]);
  const [interceptLogs, setInterceptLogs]     = useState([]);
  const [stats, setStats]                     = useState(null);
  const [duration, setDuration]               = useState(0);
  const [injectionTarget, setInjectionTarget] = useState('');
  const [injectionResult, setInjectionResult] = useState(null);
  const [activeTab, setActiveTab]             = useState('attack');
  const [attackerName, setAttackerName]       = useState('');
  const startTimeRef = useRef(null);
  const timerRef     = useRef(null);
  const logsEndRef   = useRef(null);

  useEffect(() => {
    if (!socket) return;
    socket.on('mitm-status', ({ active, attackerName: name, finalStats, duration: dur }) => {
      setMitmActive(active);
      if (active) {
        setAttackerName(name || 'Attaquant');
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000)), 1000);
      } else {
        clearInterval(timerRef.current);
        setDuration(0);
        if (finalStats) setStats(finalStats);
      }
    });
    socket.on('mitm-intercept', ({ log, stats: s }) => {
      setInterceptLogs(prev => [log, ...prev].slice(0, 50));
      setStats(s);
    });
    socket.on('mitm-injection-attempt', ({ result, reason }) => {
      setInjectionResult({ success: false, reason });
    });
    return () => {
      socket.off('mitm-status');
      socket.off('mitm-intercept');
      socket.off('mitm-injection-attempt');
      clearInterval(timerRef.current);
    };
  }, [socket]);

  const startMITM  = () => socket.emit('mitm-start', { roomId, targets });
  const stopMITM   = () => socket.emit('mitm-stop',  { roomId });
  const toggleTarget = (u) => setTargets(prev => prev.includes(u) ? prev.filter(t => t !== u) : [...prev, u]);
  const injectMsg  = () => { if (injectionTarget) { socket.emit('mitm-inject', { roomId, targetUsername: injectionTarget }); setInjectionResult(null); } };
  const clearLogs  = () => { socket.emit('mitm-clear-logs'); setInterceptLogs([]); setStats(null); };

  const otherUsers = users.filter(u => u.username !== username);

  return (
    <div className="bg-gray-800 rounded-xl border border-red-500/50 overflow-hidden">
      {/* Header */}
      <div className={`p-4 ${mitmActive ? 'bg-red-900/40' : 'bg-gray-900/60'} border-b border-red-500/30`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`text-2xl ${mitmActive ? 'animate-pulse' : ''}`}>🕵️</span>
            <div>
              <h2 className="font-bold text-red-400">Attaque MITM Réelle</h2>
              <p className="text-[10px] text-gray-400">
                {mitmActive ? `⚠️ Active — ${duration}s — ${interceptLogs.length} intercepté(s)` : 'Man-in-the-Middle simulé'}
              </p>
            </div>
          </div>
          {mitmActive && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
              <span className="text-red-400 text-xs font-bold">EN COURS</span>
            </div>
          )}
        </div>
        {stats && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            {[
              { label: 'Interceptés', value: stats.totalIntercepted,   color: 'red' },
              { label: 'Tentatives',  value: stats.decryptionAttempts, color: 'yellow' },
              { label: 'E2EE intact', value: `${stats.decryptionFailed}/${stats.decryptionAttempts}`, color: 'green' }
            ].map(s => (
              <div key={s.label} className={`bg-${s.color}-900/30 border border-${s.color}-500/30 rounded p-2 text-center`}>
                <p className={`text-${s.color}-400 font-bold text-lg`}>{s.value}</p>
                <p className="text-gray-500 text-[9px]">{s.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Onglets */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'attack',  label: '⚙️ Contrôle' },
          { id: 'logs',    label: `📋 Logs (${interceptLogs.length})` },
          { id: 'explain', label: '📖 Explication' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${activeTab === tab.id ? 'bg-red-900/20 text-red-400 border-b-2 border-red-500' : 'text-gray-400 hover:text-gray-300'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {/* Contrôle */}
        {activeTab === 'attack' && (
          <div className="space-y-4">
            {!mitmActive && (
              <div>
                <p className="text-xs text-gray-400 mb-2">Cibles (vide = tout le monde) :</p>
                <div className="flex flex-wrap gap-2">
                  {otherUsers.map(u => (
                    <button key={u.id} onClick={() => toggleTarget(u.username)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${targets.includes(u.username) ? 'bg-red-600 text-white border border-red-400' : 'bg-gray-700 text-gray-300 border border-gray-600 hover:border-red-500/50'}`}>
                      {targets.includes(u.username) ? '✓ ' : ''}{u.username}
                    </button>
                  ))}
                  {otherUsers.length === 0 && <p className="text-gray-600 text-xs italic">Aucun autre participant</p>}
                </div>
              </div>
            )}
            <button onClick={mitmActive ? stopMITM : startMITM}
              className={`w-full py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 ${mitmActive ? 'bg-gray-700 hover:bg-gray-600 text-white border border-gray-500' : 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-900/30'}`}>
              {mitmActive ? '⏹ Arrêter l\'attaque' : '▶ Lancer l\'attaque MITM'}
            </button>
            <div className="border border-orange-500/30 rounded-lg p-3 bg-orange-950/20">
              <p className="text-orange-400 text-xs font-bold mb-2">💉 Tentative d'injection de message</p>
              <p className="text-gray-500 text-[10px] mb-2">Tente d'injecter un faux message → rejeté (certificat invalide)</p>
              <div className="flex gap-2">
                <select value={injectionTarget} onChange={e => setInjectionTarget(e.target.value)}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs text-white">
                  <option value="">Choisir une cible...</option>
                  {otherUsers.map(u => <option key={u.id} value={u.username}>{u.username}</option>)}
                </select>
                <button onClick={injectMsg} disabled={!injectionTarget}
                  className="px-3 py-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 rounded text-xs font-bold text-white">
                  Injecter
                </button>
              </div>
              {injectionResult && (
                <div className="mt-2 p-2 bg-green-900/20 border border-green-500/40 rounded text-xs text-green-300">
                  ✅ Injection bloquée — {injectionResult.reason}
                </div>
              )}
            </div>
            <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-3">
              <p className="text-blue-400 text-[10px] font-bold mb-1">ℹ️ But pédagogique</p>
              <p className="text-gray-400 text-[10px]">
                Même avec accès total au serveur, l'attaquant ne peut pas lire les messages E2EE.
                Il voit uniquement les métadonnées (qui, quand, taille) — jamais le contenu.
              </p>
            </div>
          </div>
        )}

        {/* Logs */}
        {activeTab === 'logs' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">
                {interceptLogs.length === 0 ? 'Aucun message intercepté' : `${interceptLogs.length} intercepté(s) — contenu illisible`}
              </p>
              {interceptLogs.length > 0 && (
                <button onClick={clearLogs} className="text-[10px] text-gray-500 hover:text-gray-300">🗑 Vider</button>
              )}
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {interceptLogs.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-600 text-sm">{mitmActive ? '⏳ En attente de messages...' : '▶ Lancez l\'attaque pour voir les logs'}</p>
                </div>
              ) : (
                interceptLogs.map((log, i) => <InterceptCard key={log.id} log={log} index={i} />)
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Explication */}
        {activeTab === 'explain' && (
          <div className="space-y-3 text-[11px]">
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-white font-bold mb-2">🔍 Qu'est-ce qu'une attaque MITM ?</p>
              <p className="text-gray-400">L'attaquant se positionne entre Alice et Bob. Il intercepte tous les messages qui passent par le serveur.</p>
            </div>
            <div className="bg-green-950/30 border border-green-500/20 rounded-lg p-3">
              <p className="text-green-400 font-bold mb-2">✅ Pourquoi E2EE résiste</p>
              <div className="space-y-1 text-gray-400">
                <p>• Les clés privées ne quittent jamais les appareils clients</p>
                <p>• Le serveur ne reçoit que des données chiffrées opaques</p>
                <p>• Sealed Sender masque l'identité de l'expéditeur</p>
                <p>• Double Ratchet change les clés à chaque message</p>
              </div>
            </div>
            <div className="bg-yellow-950/30 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-yellow-400 font-bold mb-2">👁️ Ce que l'attaquant VOIT quand même</p>
              <div className="space-y-1 text-gray-400">
                <p>• Qui communique avec qui (graphe social)</p>
                <p>• Quand les messages sont envoyés (timing)</p>
                <p>• La taille approximative des messages</p>
              </div>
            </div>
            <div className="bg-red-950/30 border border-red-500/20 rounded-lg p-3">
              <p className="text-red-400 font-bold mb-2">❌ Ce que l'attaquant NE PEUT PAS</p>
              <div className="space-y-1 text-gray-400">
                <p>• Lire le contenu des messages</p>
                <p>• Injecter de faux messages (certificats requis)</p>
                <p>• Compromettre les messages passés (PFS)</p>
                <p>• Identifier l'expéditeur (Sealed Sender)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// GROUP PANEL
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// REMPLACEMENT COMPLET DU GroupPanel dans MultiUserSimulation.jsx
// Corrections :
//  1. Publier la clé ECDH publique au moment du join
//  2. Redistribuer automatiquement quand un nouveau membre arrive
//  3. Ousmane voit le groupe et reçoit les messages
// ─────────────────────────────────────────────

// ── ÉTAPE 1 : Dans joinRoom(), après socket.emit('join-simulation', {...}),
//              ajouter l'émission de la clé ECDH publique ──

// Dans la fonction joinRoom(), cherche :
//   socket.emit('join-simulation', { ... });
// Et AJOUTE juste après :

/*
  // Publier notre clé ECDH publique pour le Sender Key Protocol
  const ecdhKP = await window.crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
  const ecdhPubRaw = await window.crypto.subtle.exportKey('raw', ecdhKP.publicKey);
  const ecdhPubArray = Array.from(new Uint8Array(ecdhPubRaw));
  
  // Stocker dans une ref pour usage dans GroupPanel
  myECDHKeyPairRef.current = ecdhKP;
  myECDHPublicKeyRef.current = ecdhPubArray;

  socket.emit('publish-ecdh-key', {
    roomId,
    username,
    ecdhPublicKey: ecdhPubArray
  });
*/

// ── ÉTAPE 2 : Remplacer TOUT le composant GroupPanel par celui-ci ──

function GroupPanel({ socket, users, username, myPrivateKey, roomId, showToast }) {
  const [groups, setGroups]               = useState([]);
  const [activeGroup, setActiveGroup]     = useState(null);
  const [groupName, setGroupName]         = useState('');
  const [groupMessage, setGroupMessage]   = useState('');
  const [groupMessages, setGroupMessages] = useState({});
  const [groupKeys, setGroupKeys]         = useState({});
  const [activeTab, setActiveTab]         = useState('groups');
  const [usersECDH, setUsersECDH]         = useState({}); // username → ecdhPublicKey

  const groupManagerRef   = useRef(new GroupManager());
  const senderKeyStoreRef = useRef(new Map()); // groupId → SenderKeyStore
  const myECDHKeyPairRef  = useRef(null);      // notre paire ECDH locale
  const myECDHPubRef      = useRef(null);      // notre clé publique ECDH (Array)

  // ── Générer et publier notre clé ECDH au montage ──
  useEffect(() => {
    if (!socket) return;

    const initECDH = async () => {
      // Générer paire ECDH pour ce composant
      const kp = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      );
      myECDHKeyPairRef.current = kp;

      const raw = await window.crypto.subtle.exportKey('raw', kp.publicKey);
      myECDHPubRef.current = Array.from(new Uint8Array(raw));

      // Publier au serveur pour que les autres puissent nous chiffrer
      socket.emit('publish-ecdh-key', {
        roomId,
        username,
        ecdhPublicKey: myECDHPubRef.current
      });
    };

    initECDH();

    // Recevoir les clés ECDH des autres membres
    socket.on('ecdh-key-published', ({ username: who, ecdhPublicKey }) => {
      if (who === username) return;
      setUsersECDH(prev => ({ ...prev, [who]: ecdhPublicKey }));

      // Si on a des groupes communs, redistribuer notre clé vers ce membre
      const gm = groupManagerRef.current;
      gm.getAllGroups().forEach(async (group) => {
        const isMember = group.members.find(m => m.username === who);
        if (isMember) {
          await distributeMyKey(group.id, [{ username: who, ecdhPublicKey }]);
          showToast(`🔑 Clé redistribuée à ${who} (ECDH reçue)`, 'info');
        }
      });
    });

    return () => {
      socket.off('ecdh-key-published');
    };
  }, [socket, roomId, username]);

  // ── Écouter les événements groupe ──────────
  useEffect(() => {
    if (!socket) return;

    socket.on('group-sender-key-distribution', async ({
      groupId, groupName: gName, from, encryptedKey, members, keyVersion
    }) => {
      if (!myPrivateKey && !myECDHKeyPairRef.current) return;

      const gm = groupManagerRef.current;

      // Créer le groupe localement si inconnu
      if (!gm.hasGroup(groupId)) {
        const g = gm.createGroup(groupId, gName, from);
        members.forEach(m => gm.addMember(groupId, m));
        setGroups(gm.getAllGroups());
        showToast(`👥 Groupe "${gName}" rejoint !`, 'success');
      }

      // Récupérer ou créer la SenderKeyStore
      if (!senderKeyStoreRef.current.has(groupId)) {
        const store = new SenderKeyStore(`${username}_${groupId}`);
        // Initialiser notre propre clé ECDH dans ce store
        if (myECDHKeyPairRef.current) {
          store.myECDHPublicKeyRaw = myECDHPubRef.current;
          // Stocker la clé privée dans IndexedDB du store
          await window.crypto.subtle.exportKey('raw', myECDHKeyPairRef.current.publicKey)
            .then(() => {
              // Stocker la paire dans IndexedDB avec l'ownerId du store
              const db_name = 'SenderKeySecureStore';
              const req = indexedDB.open(db_name, 1);
              req.onupgradeneeded = (e) => e.target.result.createObjectStore('ecdhKeyPairs');
              req.onsuccess = (e) => {
                const db = e.target.result;
                const tx = db.transaction('ecdhKeyPairs', 'readwrite');
                tx.objectStore('ecdhKeyPairs').put(
                  { publicKey: myECDHKeyPairRef.current.publicKey, privateKey: myECDHKeyPairRef.current.privateKey },
                  store.ownerId
                );
              };
            });
        }
        senderKeyStoreRef.current.set(groupId, store);
      }

      const store = senderKeyStoreRef.current.get(groupId);

      // Déchiffrer et stocker la SenderKey de l'expéditeur
      // encryptedKey peut être l'ancien format (bytes) ou le nouveau (objet ECDH)
      const ok = await store.receiveSenderKey(from, encryptedKey, myPrivateKey);

      if (ok) {
        showToast(`🔑 Clé de groupe reçue de ${from}`, 'success');
        setGroupKeys(prev => ({
          ...prev,
          [groupId]: { members, keyVersion, updatedAt: Date.now() }
        }));

        // Publier notre propre SenderKey en retour si on ne l'a pas encore fait
        if (!store.mySenderKey) {
          await distributeMyKey(groupId);
        }
      }
    });

    // Réception d'un message de groupe
    socket.on('group-message', async ({ groupId, from, encryptedMsg, timestamp }) => {
      const store = senderKeyStoreRef.current.get(groupId);
      if (!store) {
        console.warn(`⚠️ Pas de store pour groupe ${groupId}`);
        return;
      }

      try {
        const plaintext = await store.decryptGroupMessage(from, encryptedMsg);
        setGroupMessages(prev => ({
          ...prev,
          [groupId]: [...(prev[groupId] || []), {
            id: `gm_${Date.now()}_${Math.random()}`,
            from, plaintext, timestamp, groupId
          }]
        }));
      } catch (e) {
        console.warn(`⚠️ Déchiffrement groupe échoué (${from}):`, e.message);
        showToast(`Clé manquante pour ${from} — redemande en cours`, 'warning');

        // Demander une redistribution
        socket.emit('request-sender-key', { roomId, groupId, from });
      }
    });

    socket.on('group-key-rotation', ({ groupId, leftUsername }) => {
      showToast(`🔄 Rotation des clés (${leftUsername} a quitté)`, 'warning');
      distributeMyKey(groupId);
    });

    // Réponse à une demande de redistribution
    socket.on('sender-key-requested', ({ groupId, requestedBy }) => {
      distributeMyKey(groupId, null, requestedBy);
    });

    return () => {
      socket.off('group-sender-key-distribution');
      socket.off('group-message');
      socket.off('group-key-rotation');
      socket.off('sender-key-requested');
    };
  }, [socket, myPrivateKey, username]);

  // ── Créer un groupe ─────────────────────────
  const createGroup = async () => {
    if (!groupName.trim()) return;
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const gm      = groupManagerRef.current;

    // Enrichir les users avec leurs clés ECDH
    const enrichedUsers = users
      .filter(u => u.username !== username)
      .map(u => ({
        ...u,
        ecdhPublicKey: usersECDH[u.username] || null
      }));

    const group = gm.createGroup(groupId, groupName, username);
    enrichedUsers.forEach(u => gm.addMember(groupId, u));
    // Ajouter aussi nous-mêmes
    gm.addMember(groupId, { username, ecdhPublicKey: myECDHPubRef.current });

    setGroups(gm.getAllGroups());
    setActiveGroup(groupId);

    // Créer notre SenderKeyStore avec notre ownerId
    const store = new SenderKeyStore(`${username}_${groupId}`);
    // Injecter notre paire ECDH dans le store
    if (myECDHKeyPairRef.current) {
      await _injectECDHIntoStore(store);
    }
    senderKeyStoreRef.current.set(groupId, store);

    // Distribuer notre SenderKey à tous les membres
    await distributeMyKey(groupId);

    setGroupName('');
    showToast(`✅ Groupe "${groupName}" créé (${enrichedUsers.length} membres)`, 'success');
  };

  // Injecter notre paire ECDH dans un SenderKeyStore
  const _injectECDHIntoStore = async (store) => {
    store.myECDHPublicKeyRaw = myECDHPubRef.current;
    // Stocker dans IndexedDB avec l'ownerId du store
    return new Promise((resolve) => {
      const req = indexedDB.open('SenderKeySecureStore', 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore('ecdhKeyPairs');
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('ecdhKeyPairs', 'readwrite');
        tx.objectStore('ecdhKeyPairs').put(
          {
            publicKey:  myECDHKeyPairRef.current.publicKey,
            privateKey: myECDHKeyPairRef.current.privateKey
          },
          store.ownerId
        );
        tx.oncomplete = resolve;
      };
    });
  };

  // ── Distribuer notre SenderKey ──────────────
  const distributeMyKey = async (groupId, specificMembers = null, specificUsername = null) => {
    const store = senderKeyStoreRef.current.get(groupId);
    const group = groupManagerRef.current.getGroup(groupId);
    if (!store || !group) return;

    // Initialiser le store si nécessaire
    if (!store.mySenderKey) {
      if (myECDHKeyPairRef.current) {
        await _injectECDHIntoStore(store);
      }
      await store.initialize();
    }

    // Déterminer les membres cibles
    let targets;
    if (specificUsername) {
      // Redistribuer à un seul membre
      const targetUser = users.find(u => u.username === specificUsername);
      if (!targetUser) return;
      targets = [{
        ...targetUser,
        ecdhPublicKey: usersECDH[specificUsername] || null
      }];
    } else if (specificMembers) {
      targets = specificMembers;
    } else {
      targets = groupManagerRef.current
        .getMembersExcept(groupId, username)
        .map(m => ({
          ...m,
          ecdhPublicKey: usersECDH[m.username] || null
        }));
    }

    if (targets.length === 0) return;

    const distributionMsg = await store.buildDistributionMessage(groupId, targets);

    // Envoyer via socket — le serveur relaie individuellement
    socket.emit('group-distribute-key', {
      roomId,
      groupId,
      groupName:     group.name,
      encryptedKeys: distributionMsg.encryptedKeys,
      members:       group.members,
      keyVersion:    distributionMsg.keyVersion,
      senderECDHPub: store.myECDHPublicKeyRaw
    });

    setGroupKeys(prev => ({
      ...prev,
      [groupId]: {
        members:    targets.map(m => m.username),
        keyVersion: distributionMsg.keyVersion,
        updatedAt:  Date.now()
      }
    }));
  };

  // ── Envoyer un message de groupe ────────────
  const sendGroupMessage = async () => {
    if (!groupMessage.trim() || !activeGroup) return;
    const store = senderKeyStoreRef.current.get(activeGroup);

    if (!store?.mySenderKey) {
      showToast('SenderKey non initialisée — redistribution...', 'warning');
      await distributeMyKey(activeGroup);
      return;
    }

    try {
      const encryptedMsg = await store.encryptGroupMessage(groupMessage);

      socket.emit('send-group-message', {
        roomId,
        groupId:     activeGroup,
        encryptedMsg
      });

      setGroupMessages(prev => ({
        ...prev,
        [activeGroup]: [...(prev[activeGroup] || []), {
          id:        `gm_${Date.now()}`,
          from:      username,
          plaintext: groupMessage,
          timestamp: Date.now(),
          groupId:   activeGroup,
          isMine:    true
        }]
      }));

      setGroupMessage('');
      showToast('✅ Message groupe envoyé', 'success');
    } catch (e) {
      showToast('Erreur envoi groupe : ' + e.message, 'error');
    }
  };

  const currentGroup = activeGroup ? groupManagerRef.current.getGroup(activeGroup) : null;
  const currentMsgs  = activeGroup ? (groupMessages[activeGroup] || []) : [];
  const store        = activeGroup ? senderKeyStoreRef.current.get(activeGroup) : null;

  // ─── RENDU ───────────────────────────────────
  return (
    <div className="bg-gray-800 rounded-xl border border-teal-500/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-teal-900/20 border-b border-teal-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👥</span>
            <div>
              <h2 className="font-bold text-teal-400">Messagerie de Groupe</h2>
              <p className="text-[10px] text-gray-400">
                Sender Key Protocol — ECDH P-256 + Chain Key Ratchet
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {myECDHPubRef.current && (
              <span className="text-[9px] bg-green-900/50 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded">
                🔑 ECDH prêt
              </span>
            )}
            {groups.length > 0 && (
              <span className="text-xs bg-teal-900/50 border border-teal-500/30 text-teal-300 px-2 py-1 rounded-full">
                {groups.length} groupe(s)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex border-b border-gray-700">
        {[
          { id: 'groups',  label: '📋 Groupes' },
          { id: 'chat',    label: `💬 Chat${activeGroup ? ` (${currentMsgs.length})` : ''}` },
          { id: 'keys',    label: '🔑 Clés' },
          { id: 'explain', label: '📖 Protocole' }
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${
              activeTab === tab.id
                ? 'bg-teal-900/20 text-teal-400 border-b-2 border-teal-500'
                : 'text-gray-400 hover:text-gray-300'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="p-4">

        {/* ── Onglet Groupes ── */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <p className="text-xs text-gray-400 font-semibold mb-2">Créer un nouveau groupe</p>
              <div className="flex gap-2">
                <input
                  type="text" placeholder="Nom du groupe..." value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && createGroup()}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <button onClick={createGroup} disabled={!groupName.trim() || users.length < 2}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded text-xs font-bold text-white">
                  Créer
                </button>
              </div>
              {/* Statut ECDH des membres */}
              <div className="mt-2 flex flex-wrap gap-1">
                {users.filter(u => u.username !== username).map(u => (
                  <span key={u.username}
                    className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                      usersECDH[u.username]
                        ? 'bg-green-900/40 border-green-500/40 text-green-400'
                        : 'bg-yellow-900/40 border-yellow-500/40 text-yellow-400'
                    }`}>
                    {u.username}: {usersECDH[u.username] ? '✓ ECDH' : '⏳ attente'}
                  </span>
                ))}
              </div>
            </div>

            {groups.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-gray-600 text-sm">Aucun groupe</p>
                <p className="text-gray-700 text-xs mt-1">Créez un groupe ou attendez une invitation</p>
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map(g => {
                  const gStore   = senderKeyStoreRef.current.get(g.id);
                  const isActive = activeGroup === g.id;
                  return (
                    <div
                      key={g.id}
                      onClick={() => { setActiveGroup(g.id); setActiveTab('chat'); }}
                      className={`p-3 rounded-lg cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-teal-900/30 border-teal-500/50'
                          : 'bg-gray-700/50 border-gray-600 hover:border-teal-500/30'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm text-white">{g.name}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {g.members.length} membre(s) · créé par {g.creator}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                            gStore?.mySenderKey
                              ? 'bg-green-900/50 border-green-500/40 text-green-400'
                              : 'bg-yellow-900/50 border-yellow-500/40 text-yellow-400'
                          }`}>
                            {gStore?.mySenderKey ? '🔑 Clé prête' : '⏳ Init...'}
                          </span>
                          {gStore && (
                            <span className="text-[9px] text-gray-500">
                              {gStore.getMemberCount()} clé(s) reçue(s)
                            </span>
                          )}
                          {/* Messages non lus */}
                          {(groupMessages[g.id] || []).filter(m => !m.isMine).length > 0 && (
                            <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold">
                              {(groupMessages[g.id] || []).filter(m => !m.isMine).length} msg
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Onglet Chat ── */}
        {activeTab === 'chat' && (
          <div className="space-y-3">
            {!activeGroup ? (
              <div className="text-center py-8">
                <p className="text-gray-500 text-sm">Sélectionnez ou créez un groupe</p>
              </div>
            ) : (
              <>
                <div className="bg-teal-950/30 border border-teal-500/20 rounded p-2 flex items-center justify-between">
                  <div>
                    <p className="text-teal-400 text-xs font-bold">{currentGroup?.name}</p>
                    <p className="text-gray-500 text-[10px]">
                      {currentGroup?.members.length} membres · ECDH P-256 + ChainKey
                    </p>
                  </div>
                  <span className="text-[9px] bg-green-900/50 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded font-bold">
                    1 chiffrement → {currentGroup?.members.length || 0} membres
                  </span>
                </div>

                <div className="h-64 overflow-y-auto bg-gray-900 rounded-lg p-3 space-y-2">
                  {currentMsgs.length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-8">Aucun message dans ce groupe</p>
                  ) : (
                    currentMsgs.map(msg => (
                      <div key={msg.id} className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs p-2 rounded-lg ${msg.isMine ? 'bg-teal-600' : 'bg-gray-700'}`}>
                          {!msg.isMine && (
                            <p className="text-[10px] font-bold text-teal-300 mb-1">{msg.from}</p>
                          )}
                          <p className="text-xs text-white">{msg.plaintext}</p>
                          <p className="text-[9px] text-white/50 mt-1 text-right">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`Message dans ${currentGroup?.name}...`}
                    value={groupMessage}
                    onChange={e => setGroupMessage(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendGroupMessage()}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                  <button onClick={sendGroupMessage} disabled={!groupMessage.trim()}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded text-xs font-bold text-white">
                    👥 Envoyer
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Onglet Clés ── */}
        {activeTab === 'keys' && (
          <div className="space-y-3">
            {!activeGroup ? (
              <p className="text-gray-500 text-xs text-center py-4">Sélectionnez un groupe</p>
            ) : (
              <>
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs font-bold text-white mb-2">🔑 Ma SenderKey ({currentGroup?.name})</p>
                  {store?.mySenderKey ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">ECDH P-256 (pub):</span>
                        <span className="text-green-400 font-mono">
                          {store.myECDHPublicKeyRaw
                            ? store.myECDHPublicKeyRaw.slice(0, 8).map(b => b.toString(16).padStart(2,'0')).join('') + '…'
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Messages envoyés:</span>
                        <span className="text-blue-400">{store.myMessageNumber}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Clés reçues:</span>
                        <span className="text-purple-400">
                          {store.getMemberCount()} / {(currentGroup?.members.length || 1) - 1}
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-gray-500">Clé privée:</span>
                        <span className="text-red-400 font-bold">🔒 IndexedDB (non exportable)</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-yellow-400 text-[10px]">⏳ Clé pas encore initialisée</p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-bold text-gray-400">Membres du groupe :</p>
                  {currentGroup?.members.filter(m => m.username !== username).map(m => {
                    const hasKey  = store?.hasSenderKey(m.username);
                    const hasECDH = !!usersECDH[m.username];
                    return (
                      <div key={m.username}
                        className={`flex items-center justify-between p-2 rounded border text-xs ${
                          hasKey
                            ? 'bg-green-900/20 border-green-500/20'
                            : 'bg-gray-900/50 border-gray-700'
                        }`}>
                        <div>
                          <span className="text-gray-300">{m.username}</span>
                          <span className={`ml-2 text-[9px] ${hasECDH ? 'text-green-400' : 'text-yellow-400'}`}>
                            {hasECDH ? '✓ ECDH' : '⏳ ECDH'}
                          </span>
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                          hasKey
                            ? 'bg-green-900/50 text-green-400 border border-green-500/40'
                            : 'bg-gray-800 text-gray-500 border border-gray-600'
                        }`}>
                          {hasKey ? '✓ clé reçue' : '⏳ en attente'}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => distributeMyKey(activeGroup)}
                    className="flex-1 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 rounded text-xs text-yellow-400 font-semibold"
                  >
                    🔄 Re-distribuer ma SenderKey
                  </button>
                  <button
                    onClick={async () => {
                      const store = senderKeyStoreRef.current.get(activeGroup);
                      if (store) {
                        await store.rotateMySenderKey();
                        await distributeMyKey(activeGroup);
                        showToast('🔄 Rotation complète — nouvelle ChainKey', 'success');
                      }
                    }}
                    className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded text-xs text-red-400 font-semibold"
                  >
                    ⚡ Rotation des clés
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Onglet Explication ── */}
        {activeTab === 'explain' && (
          <div className="space-y-3 text-[11px]">
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-white font-bold mb-2">🔐 Améliorations implémentées</p>
              <div className="space-y-2">
                <div className="bg-blue-950/30 border border-blue-500/20 rounded p-2">
                  <p className="text-blue-400 font-bold">1. ECDH P-256 (vs RSA-OAEP)</p>
                  <p className="text-gray-400">Clés 10x plus courtes, même sécurité. Paire éphémère par membre → PFS par distribution.</p>
                </div>
                <div className="bg-purple-950/30 border border-purple-500/20 rounded p-2">
                  <p className="text-purple-400 font-bold">2. Chain Key + Message Key Ratchet</p>
                  <p className="text-gray-400">Chaque message utilise une clé dérivée unique via HMAC-SHA256. Compromettre msg N ne compromet pas N+1.</p>
                </div>
                <div className="bg-green-950/30 border border-green-500/20 rounded p-2">
                  <p className="text-green-400 font-bold">3. Secure Storage (IndexedDB)</p>
                  <p className="text-gray-400">Clés privées ECDH stockées non-exportables. JavaScript ne peut pas les lire, seulement les utiliser.</p>
                </div>
              </div>
            </div>
            <div className="bg-yellow-950/30 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-yellow-400 font-bold mb-1">⚡ Flux de synchronisation</p>
              <div className="space-y-1 text-gray-400">
                <p>1. Chaque membre publie sa clé ECDH au join</p>
                <p>2. À la création du groupe → distribution immédiate</p>
                <p>3. Nouveau membre → redistribution automatique</p>
                <p>4. Membre parti → rotation des chain keys</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPOSANT PRINCIPAL
// ─────────────────────────────────────────────

function MultiUserSimulation() {
  // ── Connexion ────────────────────────────
  const [socket, setSocket]       = useState(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId]       = useState('');
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [joined, setJoined]       = useState(false);

  // ── Participants & Messages ───────────────
  const [users, setUsers]               = useState([]);
  const [messages, setMessages]         = useState([]);
  const [attacks, setAttacks]           = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messageText, setMessageText]   = useState('');

  // ── Crypto ───────────────────────────────
  const [cryptoEngine]  = useState(() => new EnhancedCrypto());
  const [storage]       = useState(() => new PersistentStorage());
  const [idStorage]     = useState(() => new IdentityStorage());
  const [myPrivateKey, setMyPrivateKey] = useState(null);

  // ── UI State ─────────────────────────────
  const [decryptedMessages, setDecryptedMessages] = useState({});
  const [messageKeys, setMessageKeys]             = useState({});
  const [showDecryptPanel, setShowDecryptPanel]   = useState(false);
  const [currentDecrypting, setCurrentDecrypting] = useState(null);
  const [toasts, setToasts]                       = useState([]);
  const [typingUsers, setTypingUsers]             = useState([]);
  const [unreadCount, setUnreadCount]             = useState(0);
  const [isTyping, setIsTyping]                   = useState(false);
  const [hasMoreMessages, setHasMoreMessages]     = useState(false);
  const [messagesPage, setMessagesPage]           = useState(1);
  const [soundEnabled, setSoundEnabled]           = useState(true);
  const [myFingerprint, setMyFingerprint]         = useState(null);
  const [serverSigningPublicKey, setServerSigningPublicKey] = useState(null);
  const [myCertificate, setMyCertificate]         = useState(null);
  const [otpkCount, setOtpkCount]                 = useState(0);
  const [showMITMPanel, setShowMITMPanel]         = useState(false);
  const [mitmActive, setMitmActive]               = useState(false);
  const [showGroupPanel, setShowGroupPanel]        = useState(false);

  // ── Session status — SOURCE UNIQUE DE VÉRITÉ ──
  // sessionStatusMap[userId] = 'pending' | 'established'
  const [sessionStatusMap, setSessionStatusMap] = useState({});

  // ── Refs ─────────────────────────────────
  const myIdentityKeyPairRef  = useRef(null);   // ECDH identity (ancienne méthode)
  const myIdentityPublicJWKRef = useRef(null);
  const x3dhIdentityRef       = useRef(null);   // X3DH identity (nouvelle méthode)
  const ratchetsRef           = useRef(new Map());
  const cryptoSessionsReady   = useRef(new Set());
  const myPrivateKeyRef       = useRef(null);
  const usersRef              = useRef([]);
  const toastIdRef            = useRef(0);
  const messagesEndRef        = useRef(null);
  const typingTimeoutRef      = useRef(null);
  const messagesContainerRef  = useRef(null);

  // ─────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────

  const getUserSessionStatus = useCallback((user) => {
    return sessionStatusMap[user.id] || 'none';
  }, [sessionStatusMap]);

  const markSession = useCallback((userId, status) => {
    setSessionStatusMap(prev => ({ ...prev, [userId]: status }));
  }, []);

  const removeSession = useCallback((userId) => {
    setSessionStatusMap(prev => { const s = { ...prev }; delete s[userId]; return s; });
  }, []);

  // ─────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────

  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { myPrivateKeyRef.current = myPrivateKey; }, [myPrivateKey]);

  useEffect(() => {
    const init = async () => {
      try {
        await storage.init();
        await idStorage.init();
        soundGenerator.init();
      } catch (e) { console.error('Init error:', e); }
    };
    init();

    const cleanup = setInterval(() => {
      cryptoEngine.cleanupExpiredSessions();
      storage.cleanupOldMessages();
    }, 60 * 60 * 1000);

    return () => clearInterval(cleanup);
  }, [cryptoEngine, storage, idStorage]);

  // ─────────────────────────────────────────
  // TOAST & SOUND
  // ─────────────────────────────────────────

  const showToast = useCallback((message, type = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const playSound = useCallback((soundType) => {
    if (!soundEnabled) return;
    if (soundType === 'newMessage') soundGenerator.playNotification();
    else if (soundType === 'sent')  soundGenerator.playSent();
    else if (soundType === 'error') soundGenerator.playError();
  }, [soundEnabled]);

  // ─────────────────────────────────────────
  // SESSION RSA (EnhancedCrypto — fallback)
  // ─────────────────────────────────────────

  const ensureSession = useCallback(async (userId, publicKeyStr) => {
    if (cryptoSessionsReady.current.has(userId)) return true;
    markSession(userId, 'pending');
    try {
      const pk = typeof publicKeyStr === 'string' ? JSON.parse(publicKeyStr) : publicKeyStr;
      await cryptoEngine.initSession(userId, pk);
      cryptoSessionsReady.current.add(userId);
      markSession(userId, 'established');
      return true;
    } catch (err) {
      console.error(`❌ Session RSA échouée pour ${userId}:`, err);
      removeSession(userId);
      return false;
    }
  }, [cryptoEngine, markSession, removeSession]);

  // ─────────────────────────────────────────
  // SOCKET
  // ─────────────────────────────────────────

  useEffect(() => {
   const sock = io('https://simulation-server-ocek.onrender.com', {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    sock.on('connect',    () => setConnected(true));
    sock.on('disconnect', () => setConnected(false));
    setSocket(sock);
    return () => sock.close();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('user-joined', async ({ user, users: newUsers }) => {
      setUsers(newUsers);
      if (user?.username === username && user.certificate) setMyCertificate(user.certificate);
      if (user.username !== username && user.publicKey) {
        const ok = await ensureSession(user.id, user.publicKey);
        showToast(ok
          ? `✅ Session E2EE établie avec ${user.username}`
          : `❌ Erreur session avec ${user.username}`,
          ok ? 'success' : 'error'
        );
      }
    });

    socket.on('room-state', async ({ messages: roomMessages, users: roomUsers, serverSigningPublicKey: sspk }) => {
      setMessages(roomMessages);
      setUsers(roomUsers);
      if (sspk) setServerSigningPublicKey(sspk);
      const me = roomUsers.find(u => u.username === username);
      if (me?.certificate) setMyCertificate(me.certificate);

      const results = await Promise.allSettled(
        roomUsers.filter(u => u.username !== username && u.publicKey)
          .map(u => ensureSession(u.id, u.publicKey))
      );
      const count = results.filter(r => r.value === true).length;
      if (count > 0) showToast(`✅ ${count} session(s) E2EE établie(s)`, 'success');

      for (const msg of roomMessages) await storage.saveMessage(roomId, msg).catch(console.error);
    });

    socket.on('new-message', async (message) => {
      setMessages(prev => [...prev, message]);
      if (message.to === username) {
        setUnreadCount(prev => prev + 1);
        playSound('newMessage');
      }
      await storage.saveMessage(roomId, message).catch(console.error);
      scrollToBottom();
    });

    socket.on('attack-launched', (attack) => {
      setAttacks(prev => [...prev, attack]);
      showToast(`⚠️ Attaque ${attack.type} lancée sur ${attack.target}`, 'warning');
    });

    socket.on('attack-stopped', (attack) => {
      setAttacks(prev => prev.map(a => a.id === attack.id ? attack : a));
      showToast('Attaque arrêtée', 'success');
    });

    socket.on('user-left', ({ username: leftUsername }) => {
      setUsers(prev => prev.filter(u => u.username !== leftUsername));
      const departed = usersRef.current.find(u => u.username === leftUsername);
      if (departed) {
        cryptoSessionsReady.current.delete(departed.id);
        removeSession(departed.id);
      }
      showToast(`${leftUsername} a quitté la room`, 'info');
    });

    socket.on('user-typing', ({ username: who }) => {
      if (who === username) return;
      setTypingUsers(prev => prev.includes(who) ? prev : [...prev, who]);
      setTimeout(() => setTypingUsers(prev => prev.filter(u => u !== who)), 3000);
    });

    socket.on('mitm-status', ({ active }) => {
      setMitmActive(active);
    });

    // Groupes : relayer les distributions de SenderKey
    socket.on('group-sender-key-distribution', (data) => {
      // Reçu du serveur, transmis au GroupPanel via socket
    });

    // X3DH : réception bundle demandé
    socket.on('prekeys-low', async ({ remaining }) => {
      if (!x3dhIdentityRef.current || !password) return;
      await x3dhIdentityRef.current.replenishOneTimePreKeys(50);
      await idStorage.updateIdentity(username, x3dhIdentityRef.current, password);
      const bundle = await x3dhIdentityRef.current.buildPreKeyBundle();
      socket.emit('publish-new-prekeys', { oneTimePreKeys: bundle.oneTimePreKeys });
      setOtpkCount(x3dhIdentityRef.current.getRemainingOneTimePreKeyCount());
      showToast(`✅ 50 nouvelles PreKeys publiées (${remaining} restaient)`, 'info');
    });

    return () => {
      socket.off('user-joined');
      socket.off('room-state');
      socket.off('new-message');
      socket.off('attack-launched');
      socket.off('attack-stopped');
      socket.off('user-left');
      socket.off('user-typing');
      socket.off('prekeys-low');
      socket.off('mitm-status');
    };
  }, [socket, username, roomId, ensureSession, storage, idStorage, showToast, playSound, removeSession, password]);

  // ─────────────────────────────────────────
  // GÉNÉRATION CLÉS (RSA + ECDH legacy)
  // ─────────────────────────────────────────

  const computeFingerprint = async (publicKeyJWK) => {
    const pk   = await window.crypto.subtle.importKey('jwk', publicKeyJWK, { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']);
    const spki = await window.crypto.subtle.exportKey('spki', pk);
    const hash = await window.crypto.subtle.digest('SHA-256', spki);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').match(/.{1,8}/g).join(' ');
  };

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

    // ECDH identity (legacy — utilisée si X3DH non dispo)
    const identityKP = await generateECDHKeyPair();
    myIdentityKeyPairRef.current = identityKP;
    const identityPublicJWK = await window.crypto.subtle.exportKey('jwk', identityKP.publicKey);
    myIdentityPublicJWKRef.current = identityPublicJWK;

    return { publicKeyJWK, fingerprint, identityPublicJWK };
  };

  // ─────────────────────────────────────────
  // REJOINDRE LA ROOM
  // ─────────────────────────────────────────

  const joinRoom = async () => {
    if (!socket || !roomId || !username) {
      showToast('Remplissez tous les champs !', 'warning');
      return;
    }
    if (!password) {
      showToast('Entrez un mot de passe pour sécuriser vos clés', 'warning');
      return;
    }
    try {
      // 1. Clés RSA legacy (pour EnhancedCrypto + SealedSender)
      const legacyKeys = await generateLegacyKeys();

      // 2. Identité X3DH — charger si existante, sinon créer
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

      // Rotation SPK si nécessaire
      const rotated = await x3dhId.rotateSignedPreKeyIfNeeded();
      if (rotated) await idStorage.saveIdentity(username, x3dhId, password);

      x3dhIdentityRef.current = x3dhId;
      setOtpkCount(x3dhId.getRemainingOneTimePreKeyCount());

      // 3. Publier le bundle X3DH
      const bundle = await x3dhId.buildPreKeyBundle();
      socket.emit('publish-prekey-bundle', { username, bundle });

      // 4. Rejoindre la room
      socket.emit('join-simulation', {
        roomId,
        username,
        publicKey: legacyKeys.publicKeyJWK,
        publicKeyFingerprint: legacyKeys.fingerprint,
        identityKey: legacyKeys.identityPublicJWK
      });

      setJoined(true);
      showToast('🔐 Connexion sécurisée à la room', 'info');

      const saved = await storage.loadMessages(roomId);
      if (saved.length > 0) setMessages(saved);

    } catch (err) {
      console.error('❌ joinRoom:', err);
      showToast('Erreur connexion : ' + err.message, 'error');
    }
  };

  // ─────────────────────────────────────────
  // DÉCHIFFREMENT
  // ─────────────────────────────────────────

  const toHex = (val) => {
    if (!val) return null;
    let bytes;
    if (val instanceof ArrayBuffer)  bytes = new Uint8Array(val);
    else if (Array.isArray(val))     bytes = new Uint8Array(val);
    else                             bytes = new Uint8Array(val);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  const handleDecrypt = async (msg) => {
    if (currentDecrypting === msg.id) return;
    setCurrentDecrypting(msg.id);
    setShowDecryptPanel(true);

    try {
      const privateKey = myPrivateKeyRef.current;
      if (!privateKey)            throw new Error('Clé privée RSA non disponible');
      if (!serverSigningPublicKey) throw new Error('Clé serveur manquante');

      // ── CAS 1 : Message Sealed Sender + Double Ratchet ──
      if (msg.sealed && msg.sealedMessage) {
        const unsealed = await SealedSenderEncryptor.unseal(msg.sealedMessage, privateKey, serverSigningPublicKey);
        const senderUsername = unsealed.senderId;
        const sender = usersRef.current.find(u => u.username === senderUsername);
        if (!sender) throw new Error('Expéditeur introuvable');

        const contactId = senderUsername;
        let ratchet = ratchetsRef.current.get(contactId);

        if (!ratchet) {
          // Essayer X3DH d'abord
          if (msg.x3dhInit && x3dhIdentityRef.current) {
            try {
              const { sessionKey } = await x3dhReceiverProcess(x3dhIdentityRef.current, msg.x3dhInit);
              await idStorage.updateIdentity(username, x3dhIdentityRef.current, password);
              setOtpkCount(x3dhIdentityRef.current.getRemainingOneTimePreKeyCount());

              const isInitiator = username.localeCompare(contactId) < 0;
              ratchet = new DHRatchet(sessionKey, isInitiator);
              const senderIdKey = await importPublicKey(msg.x3dhInit.senderIdentityKey);
              if (isInitiator) {
                const kp = await generateECDHKeyPair();
                await ratchet.initialize(kp, senderIdKey);
              } else {
                await ratchet.initialize(x3dhIdentityRef.current.identityKeyPair, null);
              }
              showToast('✅ Session X3DH établie', 'success');
            } catch (e) {
              console.warn('X3DH échoué, fallback ECDH:', e.message);
            }
          }

          // Fallback ECDH legacy
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
            if (isInitiator) {
              await ratchet.initialize(await generateECDHKeyPair(), senderIdKey);
            } else {
              await ratchet.initialize(myKP, null);
            }
          }

          ratchetsRef.current.set(contactId, ratchet);
          markSession(sender.id, 'established');
        }

        // Déchiffrer
        const innerBytes = new Uint8Array(unsealed.message);
        const encMsg     = JSON.parse(new TextDecoder().decode(innerBytes));
        const toBuf      = (arr) => new Uint8Array(arr).buffer;

        const decrypted = await ratchet.decrypt({
          ...encMsg,
          ciphertext: toBuf(encMsg.ciphertext),
          iv:         toBuf(encMsg.iv),
          mac:        toBuf(encMsg.mac),
          nonce:      toBuf(encMsg.nonce)
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
        showToast('✅ Message SEALED déchiffré (Double Ratchet)', 'success');
        return;
      }

      // ── CAS 2 : Message E2EE classique (EnhancedCrypto) ──
      const sender = usersRef.current.find(u => u.username === msg.from);
      if (!sender)                          throw new Error('Expéditeur introuvable');
      if (!msg.encryptedData?.ciphertext)   throw new Error('Données chiffrées manquantes');
      if (!msg.encryptedData?.encryptedSessionKey) throw new Error('Clé de session manquante');

      const plaintext = await cryptoEngine.decryptMessage(sender.id, msg.encryptedData, privateKey);
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
      showToast('✅ Message déchiffré avec succès', 'success');

    } catch (err) {
      console.error('❌ handleDecrypt:', err);
      showToast('Erreur : ' + err.message, 'error');
      playSound('error');
    } finally {
      setCurrentDecrypting(null);
    }
  };

  // ─────────────────────────────────────────
  // ENVOI DE MESSAGE
  // ─────────────────────────────────────────

  const sendMessage = async () => {
    if (!messageText.trim() || !selectedUser) {
      showToast('Sélectionnez un destinataire et écrivez un message !', 'warning');
      return;
    }
    try {
      if (!serverSigningPublicKey) throw new Error('Clé serveur manquante');
      if (!myCertificate)          throw new Error('Certificat expéditeur manquant');

      const contactId = selectedUser.username;
      let ratchet = ratchetsRef.current.get(contactId);
      let x3dhInitMsg = null;

      if (!ratchet) {
        markSession(selectedUser.id, 'pending');

        // Essayer X3DH (session hors-ligne)
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
              if (isInitiator) {
                await ratchet.initialize(await generateECDHKeyPair(), spkPub);
              } else {
                await ratchet.initialize(x3dhIdentityRef.current.identityKeyPair, null);
              }
              showToast(`✅ Session X3DH initiée avec ${contactId}`, 'success');
            }
          } catch (e) {
            console.warn('X3DH envoi échoué, fallback ECDH:', e.message);
          }
        }

        // Fallback ECDH legacy
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
          if (isInitiator) {
            await ratchet.initialize(await generateECDHKeyPair(), recipIdKey);
          } else {
            await ratchet.initialize(myKP, null);
          }
        }

        ratchetsRef.current.set(contactId, ratchet);
        markSession(selectedUser.id, 'established');
      }

      // Chiffrer avec Double Ratchet
      const encRatchet = await ratchet.encrypt(messageText);
      const toArr = (buf) => Array.from(new Uint8Array(buf));
      const payload = {
        ...encRatchet,
        ciphertext: toArr(encRatchet.ciphertext),
        iv:  toArr(encRatchet.iv),
        mac: toArr(encRatchet.mac),
        nonce: toArr(encRatchet.nonce)
      };
      const ratchetBytes = new TextEncoder().encode(JSON.stringify(payload));

      // Sceller avec Sealed Sender
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
        x3dhInit: x3dhInitMsg  // null si session déjà établie
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

  // ─────────────────────────────────────────
  // AUTRES ACTIONS
  // ─────────────────────────────────────────

  const launchAttack = (type, target) => {
    socket.emit('launch-attack', { roomId, attackType: type, target });
  };

  const handleSelectUser = (user) => {
    if (user.username === username) {
      showToast('Vous ne pouvez pas vous envoyer de messages !', 'warning');
      return;
    }
    setSelectedUser(user);
  };

  const handleTyping = (e) => {
    setMessageText(e.target.value);
    if (!isTyping) { setIsTyping(true); socket.emit('user-typing', { roomId, username }); }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('stop-typing', { roomId, username });
    }, 3000);
  };

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  const loadMoreMessages = useCallback(async () => {
    const newPage = messagesPage + 1;
    const all = await storage.loadMessages(roomId, newPage * 50);
    if (all.length > messages.length) {
      setMessages(all);
      setMessagesPage(newPage);
      setHasMoreMessages(all.length === newPage * 50);
    } else {
      setHasMoreMessages(false);
    }
  }, [messages.length, messagesPage, roomId, storage]);

  const handleScroll = useCallback(() => {
    const c = messagesContainerRef.current;
    if (c && c.scrollTop === 0 && hasMoreMessages) loadMoreMessages();
  }, [hasMoreMessages, loadMoreMessages]);

  useEffect(() => {
    const c = messagesContainerRef.current;
    if (c) { c.addEventListener('scroll', handleScroll); return () => c.removeEventListener('scroll', handleScroll); }
  }, [handleScroll]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  // ─────────────────────────────────────────
  // ÉCRAN DE CONNEXION
  // ─────────────────────────────────────────

  if (!joined) {
    return (
      <>
        <ToastContainer toasts={toasts} removeToast={removeToast} />
        <div className="min-h-screen bg-gradient-to-br from-blue-900 via-purple-900 to-pink-900 flex items-center justify-center p-4">
          <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20 shadow-2xl">
            <h1 className="text-3xl font-bold text-white mb-2 text-center">🌐 Simulation Multi-Utilisateurs</h1>
            <p className="text-center text-white/50 text-sm mb-6">E2EE · Double Ratchet · Sealed Sender · X3DH</p>

            <div className="space-y-4">
              <div className={`p-3 rounded-lg ${connected ? 'bg-green-500/20 border border-green-500/50' : 'bg-red-500/20 border border-red-500/50'}`}>
                <p className="text-white text-sm">{connected ? '✓ Connecté au serveur' : '✕ Déconnecté du serveur'}</p>
              </div>

              <div>
                <label className="block text-white text-sm font-medium mb-2">ID de la Room</label>
                <input
                  type="text" placeholder="Ex: room-demo-2025" value={roomId}
                  onChange={e => setRoomId(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-white/50 text-xs mt-1">💡 Même ID dans plusieurs onglets pour collaborer</p>
              </div>

              <div>
                <label className="block text-white text-sm font-medium mb-2">Votre Pseudo</label>
                <input
                  type="text" placeholder="Ex: Alice" value={username}
                  onChange={e => setUsername(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && joinRoom()}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-white text-sm font-medium mb-2">
                  Mot de passe <span className="text-white/40 font-normal">(chiffre vos clés localement)</span>
                </label>
                <input
                  type="password" placeholder="Mot de passe sécurisé" value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && joinRoom()}
                  className="w-full px-4 py-3 rounded-lg bg-white/10 border border-white/30 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-white/40 text-xs mt-1">🔑 Clés chiffrées AES-256 avec PBKDF2 (310 000 itérations)</p>
              </div>

              <button
                onClick={joinRoom}
                disabled={!connected || !roomId || !username || !password}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed text-white text-lg"
              >
                Rejoindre la simulation
              </button>

              <label className="flex items-center gap-2 cursor-pointer text-sm text-white/60">
                <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} className="w-4 h-4" />
                <span>Sons activés</span>
              </label>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ─────────────────────────────────────────
  // ÉCRAN PRINCIPAL
  // ─────────────────────────────────────────

  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />
      <div className="min-h-screen bg-gray-900 text-white p-4">

        {/* Header */}
        <div className="max-w-7xl mx-auto mb-6">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-6 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h1 className="text-2xl font-bold mb-1">🌐 Simulation Collaborative — Room: {roomId}</h1>
                <p className="text-blue-100 text-sm">
                  Connecté en tant que <strong>{username}</strong> · {users.length} participant(s)
                  {otpkCount > 0 && <span className="ml-2 text-blue-200">· 🔑 {otpkCount} PreKeys</span>}
                  {myFingerprint && <span className="ml-2 text-blue-200/70 text-xs font-mono">· {myFingerprint.substring(0, 17)}…</span>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setSoundEnabled(!soundEnabled)} className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-all">
                  {soundEnabled ? '🔊 Son ON' : '🔇 Son OFF'}
                </button>
                <button
                  onClick={() => setShowMITMPanel(!showMITMPanel)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    mitmActive
                      ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                      : showMITMPanel
                      ? 'bg-red-700 hover:bg-red-800'
                      : 'bg-red-900/40 hover:bg-red-900/60 border border-red-500/50'
                  }`}
                >
                  {mitmActive ? '🕵️ MITM ACTIF' : '🕵️ MITM'}
                </button>
                <button
                  onClick={() => setShowGroupPanel(!showGroupPanel)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    showGroupPanel
                      ? 'bg-teal-700 hover:bg-teal-800'
                      : 'bg-teal-900/40 hover:bg-teal-900/60 border border-teal-500/50'
                  }`}
                >
                  👥 Groupes
                </button>
                {unreadCount > 0 && (
                  <div className="px-4 py-2 bg-red-500 rounded-lg text-sm font-bold animate-pulse">
                    {unreadCount} nouveau(x)
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Badges protocoles */}
        <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { icon: '🔒', title: 'E2EE',          sub: 'RSA-OAEP + AES-256-GCM',  color: 'blue'   },
            { icon: '🔄', title: 'Double Ratchet', sub: 'Clé unique par message',  color: 'purple' },
            { icon: '👤', title: 'Sealed Sender',  sub: 'Expéditeur masqué',       color: 'green'  },
            { icon: '🗝️', title: 'X3DH',           sub: `${otpkCount} PreKeys`,    color: 'yellow' },
            { icon: '👥', title: 'Sender Key',     sub: 'Groupes — O(1)',          color: 'teal'   }
          ].map(p => (
            <div key={p.title} className={`bg-${p.color}-900/30 border-2 border-${p.color}-500/50 rounded-xl p-3 flex items-center gap-3`}>
              <span className="text-2xl">{p.icon}</span>
              <div>
                <p className={`font-bold text-${p.color}-400 text-sm`}>{p.title}</p>
                <p className="text-[10px] text-gray-400">{p.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Grille principale */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Participants ── */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
              <span>👥 Participants ({users.length})</span>
              {selectedUser && <span className="text-xs bg-blue-600 px-2 py-1 rounded">{selectedUser.username}</span>}
            </h2>

            <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600/50 rounded-lg text-sm">
              <p className="text-blue-300">💡 <strong>Cliquez</strong> sur un participant pour lui envoyer un message</p>
            </div>

            <div className="space-y-2">
              {users.map((user) => {
                const isMe       = user.username === username;
                const isSelected = selectedUser?.id === user.id;
                const userSessionStatus = getUserSessionStatus(user); // ← nom différent pour éviter le conflit

                return (
                  <div
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={`relative p-4 rounded-lg transition-all ${
                      isSelected  ? 'bg-blue-600 border-2 border-blue-400 shadow-lg scale-105 cursor-pointer'
                      : isMe      ? 'bg-green-600/20 border border-green-600/50 cursor-not-allowed'
                      :             'bg-gray-700 hover:bg-gray-600 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-lg flex items-center gap-2 flex-wrap">
                          {isSelected && <span>👉</span>}
                          {user.username}
                          {isMe && <span className="text-xs bg-green-600 px-2 py-0.5 rounded">(Vous)</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">ID: {user.id.substring(0, 8)}…</p>
                        {user.publicKeyFingerprint && (
                          <p className="text-[10px] text-gray-500 mt-0.5 font-mono truncate">{user.publicKeyFingerprint}</p>
                        )}
                        {!isMe && (
                          <div className="mt-2">
                            <SessionBadge status={userSessionStatus} />
                          </div>
                        )}
                      </div>
                      {!isMe && (
                        <button
                          onClick={e => { e.stopPropagation(); launchAttack('MITM', user.username); }}
                          className="ml-2 flex-shrink-0 px-3 py-1 bg-red-500 hover:bg-red-600 rounded text-xs font-semibold"
                        >
                          ⚠ MITM
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {users.length === 1 && (
              <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-600/50 rounded-lg text-sm">
                <p className="text-yellow-300">⚠ Vous êtes seul ! Ouvrez un nouvel onglet avec le même Room ID.</p>
              </div>
            )}
          </div>

          {/* ── Messages ── */}
          <div className={`bg-gray-800 rounded-xl p-6 border border-gray-700 ${showDecryptPanel ? 'lg:col-span-1' : 'lg:col-span-2'}`}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">💬 Messages chiffrés ({messages.length})</h2>
              {Object.keys(decryptedMessages).length > 0 && (
                <button onClick={() => setShowDecryptPanel(!showDecryptPanel)} className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm">
                  {showDecryptPanel ? '👁 Masquer' : '🔓 Déchiffrés'}
                </button>
              )}
            </div>

            <div ref={messagesContainerRef} className="h-96 overflow-y-auto bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
              {hasMoreMessages && (
                <button onClick={loadMoreMessages} className="w-full py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm">
                  ⬆ Charger plus
                </button>
              )}
              {messages.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Aucun message…</p>
              ) : (
                messages.map((msg) => {
                  const isFromMe   = msg.from === username;
                  const isToMe     = msg.to === username;
                  const isDecrypted = !!decryptedMessages[msg.id];
                  const msgKey     = messageKeys[msg.id];

                  return (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-lg transition-all ${
                        isFromMe ? 'bg-blue-600 ml-auto max-w-md'
                        : isToMe ? 'bg-green-600 mr-auto max-w-md'
                        :          'bg-gray-700'
                      } ${isDecrypted ? 'ring-2 ring-purple-400' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold flex items-center gap-2 flex-wrap">
                          {msg.from} → {msg.to}
                          {isDecrypted && (
                            <span className="bg-purple-500/30 border border-purple-400/50 text-purple-200 text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                              ✓ déchiffré
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-300">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                      </div>

                      {/* Aperçu chiffré */}
                      <div className="bg-black/30 p-2 rounded font-mono text-xs mb-2 overflow-x-auto">
                        {msg.sealed ? (
                          <div className="space-y-1">
                            <p className="text-purple-400 font-bold">🔐 [SEALED SENDER]</p>
                            <p className="text-gray-500">Expéditeur : <span className="text-red-400">??? (masqué)</span></p>
                            <p className="text-gray-500 text-[10px]">Enveloppe : {JSON.stringify(msg.sealedMessage).substring(0, 40)}…</p>
                            {msg.x3dhInit && <p className="text-yellow-400 text-[9px]">🗝️ X3DH Init inclus</p>}
                            <p className="text-[9px] text-purple-300">ℹ️ Le serveur ne voit pas l'expéditeur</p>
                          </div>
                        ) : (
                          msg.encryptedData?.ciphertext ? `${msg.encryptedData.ciphertext.substring(0, 60)}…` : '[message]'
                        )}
                      </div>

                      {/* Clés inline si déchiffré */}
                      {isDecrypted && msgKey && <div className="mb-2"><MessageKeyBadge keyInfo={msgKey} /></div>}

                      {/* Aperçu texte clair */}
                      {isDecrypted && decryptedMessages[msg.id] && (
                        <div className="mb-2 bg-white/10 px-2 py-1 rounded text-xs text-green-200 border-l-2 border-green-400">
                          💬 <span className="italic">{decryptedMessages[msg.id].plaintext}</span>
                        </div>
                      )}

                      {isToMe && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDecrypt(msg)}
                            disabled={currentDecrypting === msg.id}
                            className={`text-xs px-3 py-1 rounded disabled:opacity-50 flex items-center gap-1 transition-all ${
                              isDecrypted
                                ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-200 border border-purple-400/30'
                                : 'bg-white/20 hover:bg-white/30'
                            }`}
                          >
                            {currentDecrypting === msg.id ? '⏳ Déchiffrement…'
                              : isDecrypted ? '🔄 Re-déchiffrer'
                              : '🔓 Déchiffrer'}
                          </button>
                          {isDecrypted && <span className="text-xs text-purple-300">✓ Déchiffré</span>}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {typingUsers.length > 0 && <div className="mb-2"><TypingIndicator users={typingUsers} /></div>}

            {selectedUser ? (
              selectedUser.username === username ? (
                <div className="p-4 bg-yellow-900/30 border border-yellow-600/50 rounded-lg">
                  <p className="text-yellow-300 text-sm">⚠ Sélectionnez un autre participant.</p>
                </div>
              ) : (
                <div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder={`Message pour ${selectedUser.username}…`}
                      value={messageText}
                      onChange={handleTyping}
                      onKeyPress={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                      className="flex-1 px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={sendMessage}
                      disabled={!messageText.trim()}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <span>🔒</span><span>Envoyer</span>
                    </button>
                  </div>
                  <p className="text-xs text-gray-400">
                    Destinataire : <strong className="text-blue-400">{selectedUser.username}</strong>
                    {' · '}
                    {getUserSessionStatus(selectedUser) === 'established'
                      ? <span className="text-green-400">🔒 Session établie — E2EE actif</span>
                      : getUserSessionStatus(selectedUser) === 'pending'
                      ? <span className="text-yellow-400">⏳ Session en cours…</span>
                      : <span className="text-gray-500">⚪ Session sera créée au 1er message</span>}
                  </p>
                </div>
              )
            ) : (
              <div className="p-4 bg-gray-700 border border-gray-600 rounded-lg text-center">
                <p className="text-gray-400">👈 Sélectionnez un participant pour commencer</p>
              </div>
            )}
          </div>

          {/* ── Panneau Messages Déchiffrés ── */}
          {showDecryptPanel && (
            <div className="bg-gray-800 rounded-xl p-6 border border-purple-500 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-purple-400">🔓 Messages Déchiffrés</h2>
                <button onClick={() => setShowDecryptPanel(false)} className="text-gray-400 hover:text-white text-xl font-bold">✕</button>
              </div>

              <div className="h-96 overflow-y-auto space-y-3">
                {Object.keys(decryptedMessages).length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-500 text-sm">Aucun message déchiffré.</p>
                    <p className="text-gray-600 text-xs mt-2">Cliquez sur "🔓 Déchiffrer" dans les messages reçus</p>
                  </div>
                ) : (
                  Object.entries(decryptedMessages).reverse().map(([msgId, dec]) => (
                    <div
                      key={msgId}
                      className={`bg-gradient-to-br ${dec.compromised ? 'from-red-900/50 to-red-950/50' : 'from-purple-900/50 to-pink-900/50'} p-4 rounded-lg border ${dec.compromised ? 'border-red-500/50' : 'border-purple-500/30'}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-purple-300">{dec.from} → {dec.to}</span>
                        <span className="text-xs text-gray-400">{new Date(dec.timestamp).toLocaleTimeString()}</span>
                      </div>

                      {/* Message en clair */}
                      <div className="bg-white/5 p-3 rounded-lg mb-3">
                        <p className="text-sm font-semibold text-green-400 mb-1">💬 Message en clair :</p>
                        <p className={`font-medium ${dec.compromised ? 'text-red-300' : 'text-white'}`}>{dec.plaintext}</p>
                      </div>

                      {/* Clés de chiffrement */}
                      {dec.keyInfo && (
                        <div className={`p-3 rounded-lg mb-2 border ${dec.compromised ? 'bg-red-950/30 border-red-500/30' : 'bg-blue-950/30 border-blue-500/30'}`}>
                          <p className="text-xs font-bold text-blue-300 mb-2 flex items-center gap-1">
                            {dec.compromised ? '🔓' : '🔑'} Clés de chiffrement (Double Ratchet)
                            {dec.keyInfo.isReal && (
                              <span className="ml-auto text-[9px] bg-green-900/50 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded">
                                ✓ vraies valeurs
                              </span>
                            )}
                          </p>
                          <div className="space-y-1.5 text-[10px] font-mono">
                            {[
                              { label: 'Message #', value: `${dec.keyInfo.messageNumber}${dec.keyInfo.sequenceNumber && dec.keyInfo.sequenceNumber !== '—' ? ` (seq:${dec.keyInfo.sequenceNumber})` : ''}`, color: 'blue' },
                              { label: 'AES IV',    value: dec.keyInfo.aesIV || dec.keyInfo.aesKey, color: 'green' },
                              { label: 'MAC',       value: dec.keyInfo.mac,   color: 'yellow' },
                              { label: 'Nonce',     value: dec.keyInfo.nonce, color: 'purple' }
                            ].map(row => (
                              <div key={row.label} className="flex justify-between items-center">
                                <span className="text-gray-400">{row.label}:</span>
                                <span className={`px-1.5 py-0.5 rounded font-mono ${dec.compromised ? 'bg-red-900/50 text-red-300' : `bg-${row.color}-900/50 text-${row.color}-300`}`}>
                                  {row.value || 'N/A'}
                                </span>
                              </div>
                            ))}
                            {dec.keyInfo.timestamp && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-400">Horodatage:</span>
                                <span className="text-gray-400">{new Date(dec.keyInfo.timestamp).toLocaleTimeString()}</span>
                              </div>
                            )}
                          </div>
                          <p className="text-[9px] text-gray-500 mt-2">
                            {dec.compromised
                              ? '⚠️ Clé compromise — ce message est exposé'
                              : dec.keyInfo.isReal
                              ? 'ℹ️ AES IV + MAC + Nonce extraits du vrai message Double Ratchet'
                              : 'ℹ️ Valeurs simulées'}
                          </p>
                        </div>
                      )}

                      {/* Démo PFS */}
                      {!dec.compromised && (
                        <button
                          onClick={() => {
                            setDecryptedMessages(prev => ({ ...prev, [msgId]: { ...prev[msgId], compromised: true } }));
                            showToast('⚠️ Clé compromise ! Les autres messages restent protégés (PFS)', 'warning');
                          }}
                          className="w-full mt-2 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded text-red-400 text-xs font-bold transition-all flex items-center justify-center gap-1"
                        >
                          ⚠️ Attaquer ce message (démo PFS)
                        </button>
                      )}
                      {dec.compromised && (
                        <div className="mt-2 bg-red-950/50 p-2 rounded border-l-2 border-red-500">
                          <p className="text-[10px] text-red-300">
                            <strong>🔓 Clé compromise !</strong> Avec PFS, seul CE message est exposé. Les {Object.keys(decryptedMessages).length - 1} autres restent protégés.
                          </p>
                        </div>
                      )}

                      <details className="text-xs mt-2">
                        <summary className="cursor-pointer text-gray-400 hover:text-gray-300">🔒 Voir le texte chiffré</summary>
                        <div className="mt-2 bg-black/30 p-2 rounded font-mono text-[10px] break-all text-gray-500">{dec.ciphertext}</div>
                      </details>
                    </div>
                  ))
                )}
              </div>

              {Object.keys(decryptedMessages).length > 0 && (
                <div className="mt-4 p-3 bg-purple-900/30 border border-purple-600/50 rounded-lg">
                  <p className="text-xs text-purple-300 text-center">
                    📊 {Object.keys(decryptedMessages).length} message(s) déchiffré(s)
                    {Object.values(decryptedMessages).some(m => m.compromised) && (
                      <span className="text-red-400 ml-2">· {Object.values(decryptedMessages).filter(m => m.compromised).length} compromis</span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Attaques */}
        {attacks.length > 0 && (
          <div className="max-w-7xl mx-auto mt-6">
            <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6">
              <h2 className="text-xl font-bold mb-4 text-red-400">⚠ Attaques détectées ({attacks.length})</h2>
              <div className="space-y-2">
                {attacks.map(attack => (
                  <div key={attack.id} className="bg-red-900/50 p-3 rounded-lg flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{attack.type}</span>
                      <span className="text-gray-400 text-sm ml-2">→ Cible: {attack.target}</span>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs ${attack.status === 'active' ? 'bg-red-500' : 'bg-gray-500'}`}>
                      {attack.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Panneau MITM */}
        {showMITMPanel && (
          <div className="max-w-7xl mx-auto mt-6">
            <MITMPanel
              socket={socket}
              users={users}
              username={username}
              roomId={roomId}
            />
          </div>
        )}

        {/* Panneau Groupes */}
        {showGroupPanel && (
          <div className="max-w-7xl mx-auto mt-6">
            <GroupPanel
              socket={socket}
              users={users}
              username={username}
              myPrivateKey={myPrivateKey}
              roomId={roomId}
              showToast={showToast}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes slide-in { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .animate-slide-in { animation: slide-in 0.3s ease-out; }
        @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        .animate-bounce { animation: bounce 1s infinite; }
      `}</style>
    </>
  );
}

export default MultiUserSimulation;