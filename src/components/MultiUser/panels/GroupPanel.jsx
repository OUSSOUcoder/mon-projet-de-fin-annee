import { useState, useEffect, useRef, useCallback } from 'react';
import { SenderKeyStore, GroupManager } from '../../../crypto/SenderKeyProtocol';

export function GroupPanel({ socket, users, username, myPrivateKey, roomId, showToast }) {
  const [groups, setGroups]               = useState([]);
  const [activeGroup, setActiveGroup]     = useState(null);
  const [groupName, setGroupName]         = useState('');
  const [groupMessage, setGroupMessage]   = useState('');
  const [groupMessages, setGroupMessages] = useState({});
  const [groupKeys, setGroupKeys]         = useState({});
  const [activeTab, setActiveTab]         = useState('groups');
  const [usersECDH, setUsersECDH]         = useState({});

  const groupManagerRef   = useRef(new GroupManager());
  const senderKeyStoreRef = useRef(new Map());
  const myECDHKeyPairRef  = useRef(null);
  const myECDHPubRef      = useRef(null);

  // ── Init ECDH ──────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const initECDH = async () => {
      const kp = await window.crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey', 'deriveBits']
      );
      myECDHKeyPairRef.current = kp;
      const raw = await window.crypto.subtle.exportKey('raw', kp.publicKey);
      myECDHPubRef.current = Array.from(new Uint8Array(raw));
      socket.emit('publish-ecdh-key', { roomId, username, ecdhPublicKey: myECDHPubRef.current });
    };

    initECDH();

    socket.on('ecdh-key-published', ({ username: who, ecdhPublicKey }) => {
      if (who === username) return;
      setUsersECDH(prev => ({ ...prev, [who]: ecdhPublicKey }));
    });

    return () => { socket.off('ecdh-key-published'); };
  }, [socket, roomId, username]);

  // ── Injecter ECDH dans un store ────────────
  const _injectECDHIntoStore = useCallback(async (store) => {
    if (!myECDHKeyPairRef.current) return;
    store.myECDHPublicKeyRaw = myECDHPubRef.current;
    return new Promise((resolve) => {
      const req = indexedDB.open('SenderKeySecureStore', 1);
      req.onupgradeneeded = (e) => e.target.result.createObjectStore('ecdhKeyPairs');
      req.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction('ecdhKeyPairs', 'readwrite');
        tx.objectStore('ecdhKeyPairs').put(
          { publicKey: myECDHKeyPairRef.current.publicKey, privateKey: myECDHKeyPairRef.current.privateKey },
          store.ownerId
        );
        tx.oncomplete = resolve;
      };
    });
  }, []);

  // ── BUG FIX : distributeMyKey en useCallback ──
  const distributeMyKey = useCallback(async (groupId, specificMembers = null, specificUsername = null) => {
    const store = senderKeyStoreRef.current.get(groupId);
    const group = groupManagerRef.current.getGroup(groupId);
    if (!store || !group) return;

    if (!store.mySenderKey) {
      if (myECDHKeyPairRef.current) await _injectECDHIntoStore(store);
      await store.initialize();
    }

    let targets;
    if (specificUsername) {
      const targetUser = users.find(u => u.username === specificUsername);
      if (!targetUser) return;
      targets = [{ ...targetUser, ecdhPublicKey: usersECDH[specificUsername] || null }];
    } else if (specificMembers) {
      targets = specificMembers;
    } else {
      targets = groupManagerRef.current
        .getMembersExcept(groupId, username)
        .map(m => ({ ...m, ecdhPublicKey: usersECDH[m.username] || null }));
    }

    if (targets.length === 0) return;

    const distributionMsg = await store.buildDistributionMessage(groupId, targets);

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
      [groupId]: { members: targets.map(m => m.username), keyVersion: distributionMsg.keyVersion, updatedAt: Date.now() }
    }));
  }, [socket, roomId, username, users, usersECDH, _injectECDHIntoStore]);

  // ── BUG FIX : deps correctes dans useEffect ──
  useEffect(() => {
    if (!socket) return;

    socket.on('group-sender-key-distribution', async ({
      groupId, groupName: gName, from, encryptedKey, members, keyVersion
    }) => {
      if (!myPrivateKey && !myECDHKeyPairRef.current) return;
      const gm = groupManagerRef.current;

      if (!gm.hasGroup(groupId)) {
        gm.createGroup(groupId, gName, from);
        members.forEach(m => gm.addMember(groupId, m));
        setGroups(gm.getAllGroups());
        showToast(`👥 Groupe "${gName}" rejoint !`, 'success');
      }

      if (!senderKeyStoreRef.current.has(groupId)) {
        const store = new SenderKeyStore(`${username}_${groupId}`);
        if (myECDHKeyPairRef.current) {
          store.myECDHPublicKeyRaw = myECDHPubRef.current;
          await new Promise((resolve) => {
            const req = indexedDB.open('SenderKeySecureStore', 1);
            req.onupgradeneeded = (e) => e.target.result.createObjectStore('ecdhKeyPairs');
            req.onsuccess = (e) => {
              const db = e.target.result;
              const tx = db.transaction('ecdhKeyPairs', 'readwrite');
              tx.objectStore('ecdhKeyPairs').put(
                { publicKey: myECDHKeyPairRef.current.publicKey, privateKey: myECDHKeyPairRef.current.privateKey },
                store.ownerId
              );
              tx.oncomplete = resolve;
            };
          });
        }
        senderKeyStoreRef.current.set(groupId, store);
      }

      const store = senderKeyStoreRef.current.get(groupId);
      const ok = await store.receiveSenderKey(from, encryptedKey, myPrivateKey);

      if (ok) {
        showToast(`🔑 Clé de groupe reçue de ${from}`, 'success');
        setGroupKeys(prev => ({ ...prev, [groupId]: { members, keyVersion, updatedAt: Date.now() } }));
        if (!store.mySenderKey) await distributeMyKey(groupId);
      }
    });

    socket.on('group-message', async ({ groupId, from, encryptedMsg, timestamp }) => {
      const store = senderKeyStoreRef.current.get(groupId);
      if (!store) return;
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
        showToast(`Clé manquante pour ${from}`, 'warning');
        socket.emit('request-sender-key', { roomId, groupId, from });
      }
    });

    socket.on('group-key-rotation', ({ groupId, leftUsername }) => {
      showToast(`🔄 Rotation des clés (${leftUsername} a quitté)`, 'warning');
      distributeMyKey(groupId);
    });

    socket.on('sender-key-requested', ({ groupId, requestedBy }) => {
      distributeMyKey(groupId, null, requestedBy);
    });

    return () => {
      socket.off('group-sender-key-distribution');
      socket.off('group-message');
      socket.off('group-key-rotation');
      socket.off('sender-key-requested');
    };
    // BUG FIX : distributeMyKey maintenant stable grâce à useCallback
  }, [socket, myPrivateKey, username, roomId, showToast, distributeMyKey]);

  // ── Créer un groupe ─────────────────────────
  const createGroup = async () => {
    if (!groupName.trim()) return;
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const gm      = groupManagerRef.current;

    const enrichedUsers = users
      .filter(u => u.username !== username)
      .map(u => ({ ...u, ecdhPublicKey: usersECDH[u.username] || null }));

    gm.createGroup(groupId, groupName, username);
    enrichedUsers.forEach(u => gm.addMember(groupId, u));
    gm.addMember(groupId, { username, ecdhPublicKey: myECDHPubRef.current });
    setGroups(gm.getAllGroups());
    setActiveGroup(groupId);

    const store = new SenderKeyStore(`${username}_${groupId}`);
    if (myECDHKeyPairRef.current) await _injectECDHIntoStore(store);
    senderKeyStoreRef.current.set(groupId, store);

    await distributeMyKey(groupId);
    setGroupName('');
    showToast(`✅ Groupe "${groupName}" créé`, 'success');
  };

  // ── Envoyer un message ──────────────────────
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
      socket.emit('send-group-message', { roomId, groupId: activeGroup, encryptedMsg });
      setGroupMessages(prev => ({
        ...prev,
        [activeGroup]: [...(prev[activeGroup] || []), {
          id: `gm_${Date.now()}`, from: username,
          plaintext: groupMessage, timestamp: Date.now(),
          groupId: activeGroup, isMine: true
        }]
      }));
      setGroupMessage('');
      showToast('✅ Message groupe envoyé', 'success');
    } catch (e) {
      showToast('Erreur : ' + e.message, 'error');
    }
  };

  const currentGroup = activeGroup ? groupManagerRef.current.getGroup(activeGroup) : null;
  const currentMsgs  = activeGroup ? (groupMessages[activeGroup] || []) : [];
  const store        = activeGroup ? senderKeyStoreRef.current.get(activeGroup) : null;

  return (
    <div className="bg-gray-800 rounded-xl border border-teal-500/50 overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-teal-900/20 border-b border-teal-500/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👥</span>
            <div>
              <h2 className="font-bold text-teal-400">Messagerie de Groupe</h2>
              <p className="text-[10px] text-gray-400">Sender Key Protocol — ECDH P-256 + Chain Key Ratchet</p>
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
        {/* ── Groupes ── */}
        {activeTab === 'groups' && (
          <div className="space-y-4">
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
              <p className="text-xs text-gray-400 font-semibold mb-2">Créer un nouveau groupe</p>
              <div className="flex gap-2">
                <input type="text" placeholder="Nom du groupe..." value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && createGroup()}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                <button onClick={createGroup} disabled={!groupName.trim() || users.length < 2}
                  className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded text-xs font-bold text-white">
                  Créer
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {users.filter(u => u.username !== username).map(u => (
                  <span key={u.username}
                    className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                      usersECDH[u.username]
                        ? 'bg-green-900/40 border-green-500/40 text-green-400'
                        : 'bg-yellow-900/40 border-yellow-500/40 text-yellow-400'
                    }`}>
                    {u.username}: {usersECDH[u.username] ? '✓ ECDH' : '⏳'}
                  </span>
                ))}
              </div>
            </div>
            {groups.length === 0 ? (
              <p className="text-gray-600 text-sm text-center py-6">Aucun groupe</p>
            ) : (
              <div className="space-y-2">
                {groups.map(g => {
                  const gStore = senderKeyStoreRef.current.get(g.id);
                  return (
                    <div key={g.id}
                      onClick={() => { setActiveGroup(g.id); setActiveTab('chat'); }}
                      className={`p-3 rounded-lg cursor-pointer transition-all border ${
                        activeGroup === g.id
                          ? 'bg-teal-900/30 border-teal-500/50'
                          : 'bg-gray-700/50 border-gray-600 hover:border-teal-500/30'
                      }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-sm text-white">{g.name}</p>
                          <p className="text-[10px] text-gray-400">{g.members.length} membres · {g.creator}</p>
                        </div>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${
                          gStore?.mySenderKey
                            ? 'bg-green-900/50 border-green-500/40 text-green-400'
                            : 'bg-yellow-900/50 border-yellow-500/40 text-yellow-400'
                        }`}>
                          {gStore?.mySenderKey ? '🔑 Prêt' : '⏳'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Chat ── */}
        {activeTab === 'chat' && (
          <div className="space-y-3">
            {!activeGroup ? (
              <p className="text-gray-500 text-sm text-center py-8">Sélectionnez un groupe</p>
            ) : (
              <>
                <div className="bg-teal-950/30 border border-teal-500/20 rounded p-2 flex items-center justify-between">
                  <div>
                    <p className="text-teal-400 text-xs font-bold">{currentGroup?.name}</p>
                    <p className="text-gray-500 text-[10px]">{currentGroup?.members.length} membres</p>
                  </div>
                  <span className="text-[9px] bg-green-900/50 border border-green-500/40 text-green-400 px-1.5 py-0.5 rounded font-bold">
                    1 chiffrement → {currentGroup?.members.length || 0} membres
                  </span>
                </div>
                <div className="h-64 overflow-y-auto bg-gray-900 rounded-lg p-3 space-y-2">
                  {currentMsgs.length === 0 ? (
                    <p className="text-gray-600 text-xs text-center py-8">Aucun message</p>
                  ) : (
                    currentMsgs.map(msg => (
                      <div key={msg.id} className={`flex ${msg.isMine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-xs p-2 rounded-lg ${msg.isMine ? 'bg-teal-600' : 'bg-gray-700'}`}>
                          {!msg.isMine && <p className="text-[10px] font-bold text-teal-300 mb-1">{msg.from}</p>}
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
                  <input type="text" placeholder={`Message dans ${currentGroup?.name}...`}
                    value={groupMessage} onChange={e => setGroupMessage(e.target.value)}
                    onKeyPress={e => e.key === 'Enter' && sendGroupMessage()}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-xs text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                  <button onClick={sendGroupMessage} disabled={!groupMessage.trim()}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded text-xs font-bold text-white">
                    👥
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Clés ── */}
        {activeTab === 'keys' && (
          <div className="space-y-3">
            {!activeGroup ? (
              <p className="text-gray-500 text-xs text-center py-4">Sélectionnez un groupe</p>
            ) : (
              <>
                <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs font-bold text-white mb-2">🔑 Ma SenderKey</p>
                  {store?.mySenderKey ? (
                    <div className="space-y-1 text-[10px]">
                      <div className="flex justify-between">
                        <span className="text-gray-500">ECDH pub:</span>
                        <span className="text-green-400 font-mono">
                          {store.myECDHPublicKeyRaw?.slice(0, 8).map(b => b.toString(16).padStart(2,'0')).join('') + '…'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Messages envoyés:</span>
                        <span className="text-blue-400">{store.myMessageNumber}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Clés reçues:</span>
                        <span className="text-purple-400">{store.getMemberCount()} / {(currentGroup?.members.length || 1) - 1}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-yellow-400 text-[10px]">⏳ Clé pas encore initialisée</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => distributeMyKey(activeGroup)}
                    className="flex-1 py-2 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-500/30 rounded text-xs text-yellow-400 font-semibold">
                    🔄 Re-distribuer
                  </button>
                  <button onClick={async () => {
                    if (store) { await store.rotateMySenderKey(); await distributeMyKey(activeGroup); showToast('🔄 Rotation complète', 'success'); }
                  }}
                    className="flex-1 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 rounded text-xs text-red-400 font-semibold">
                    ⚡ Rotation
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Explication ── */}
        {activeTab === 'explain' && (
          <div className="space-y-3 text-[11px]">
            <div className="bg-gray-900 rounded-lg p-3">
              <p className="text-white font-bold mb-2">📊 O(1) vs O(N)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-red-950/30 border border-red-500/20 rounded p-2">
                  <p className="text-red-400 font-bold text-[10px] mb-1">❌ Sans Sender Key</p>
                  <p className="text-gray-400 text-[10px]">N membres = N chiffrements</p>
                </div>
                <div className="bg-green-950/30 border border-green-500/20 rounded p-2">
                  <p className="text-green-400 font-bold text-[10px] mb-1">✅ Sender Key</p>
                  <p className="text-gray-400 text-[10px]">N membres = 1 chiffrement</p>
                </div>
              </div>
            </div>
            <div className="bg-blue-950/30 border border-blue-500/20 rounded-lg p-3">
              <p className="text-blue-400 font-bold mb-1">🔐 ECDH P-256 + Chain Key</p>
              <p className="text-gray-400">Chaque message utilise une clé dérivée unique. PFS par membre.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GroupPanel;