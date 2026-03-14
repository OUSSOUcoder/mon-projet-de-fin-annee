// ─── MultiUserSimulation.jsx ──────────────────────────────────
// Point d'entrée principal — orchestre les hooks et les panneaux.
// Ce fichier ne contient QUE la logique de câblage, pas d'UI directe.

import { useEffect, useCallback } from 'react';
import soundGenerator from '../utils/SoundGenerator';

// ── Hooks ─────────────────────────────────────────────────────
import { useSocket }          from './MultiUser/hooks/useSocket';
import { useMultiUserState }  from './MultiUser/hooks/useMultiUserState';
import { useMultiUserSocket } from './MultiUser/hooks/useMultiUserSocket';
import { useMultiUserCrypto } from './MultiUser/hooks/useMultiUserCrypto';

// ── UI screens / panels ───────────────────────────────────────
import { LoginScreen }      from './MultiUser/ui/LoginScreen';
import { DashboardHeader }  from './MultiUser/ui/DashboardHeader';
import { ProtocolBadges }   from './MultiUser/ui/ProtocolBadges';
import { ParticipantsPanel } from './MultiUser/panels/ParticipantsPanel';
import { MessagesPanel }    from './MultiUser/panels/MessagesPanel';
import { DecryptedPanel }   from './MultiUser/panels/DecryptedPanel';
import { AttacksPanel }     from './MultiUser/panels/AttacksPanel';

// ── External panels (unchanged) ───────────────────────────────
import { ToastContainer }               from './MultiUser/ui/ToastContainer';
import { MITMPanel }                    from './MultiUser/interception/InterceptMonitor';
import { GroupPanel }                   from './MultiUser/panels/GroupPanel';
import { SafetyNumber }                 from './MultiUser/Messages/SafetyNumber';

function MultiUserSimulation() {
  const { socket, connected } = useSocket();

  // ── All state in one hook ──────────────────────────────────
  const state = useMultiUserState();
  const {
    roomId, setRoomId, username, setUsername, password, setPassword,
    joined, setJoined, savedContactKeys, setSavedContactKeys,
    pendingSend, setPendingSend,
    users, setUsers, messages, setMessages, attacks, setAttacks,
    selectedUser, setSelectedUser, messageText, setMessageText,
    cryptoEngine, storage, idStorage,
    myPrivateKey, setMyPrivateKey,
    decryptedMessages, setDecryptedMessages,
    messageKeys, setMessageKeys,
    showDecryptPanel, setShowDecryptPanel,
    currentDecrypting, setCurrentDecrypting,
    toasts, setToasts,
    typingUsers, setTypingUsers,
    unreadCount, setUnreadCount,
    isTyping, setIsTyping,
    hasMoreMessages, setHasMoreMessages,
    messagesPage, setMessagesPage,
    soundEnabled, setSoundEnabled,
    myFingerprint, setMyFingerprint,
    serverSigningPublicKey, setServerSigningPublicKey,
    myCertificate, setMyCertificate,
    otpkCount, setOtpkCount,
    showMITMPanel, setShowMITMPanel,
    mitmActive, setMitmActive,
    showGroupPanel, setShowGroupPanel,
    readReceipts, setReadReceipts,
    safetyNumberTarget, setSafetyNumberTarget,
    verifiedContacts, setVerifiedContacts,
    sessionStatusMap, setSessionStatusMap,
    myIdentityKeyPairRef, myIdentityPublicJWKRef,
    x3dhIdentityRef, ratchetsRef, cryptoSessionsReady,
    myPrivateKeyRef, usersRef, toastIdRef,
    messagesEndRef, typingTimeoutRef, messagesContainerRef,
  } = state;

  // ── Sync refs ─────────────────────────────────────────────
  useEffect(() => { usersRef.current = users; },       [users]);
  useEffect(() => { myPrivateKeyRef.current = myPrivateKey; }, [myPrivateKey]);

  // ── Init storage + sound ───────────────────────────────────
  useEffect(() => {
    const init = async () => {
      try {
        await storage.init();
        await idStorage.init();
        soundGenerator.init();
      } catch (e) { console.error('Init error:', e); }
    };
    init();
    const interval = setInterval(() => {
      cryptoEngine.cleanupExpiredSessions();
      storage.cleanupOldMessages();
    }, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, [cryptoEngine, storage, idStorage]);

  // ── Toast helpers ──────────────────────────────────────────
  const showToast = useCallback((message, type = 'info') => {
    const id = toastIdRef.current++;
    setToasts(prev => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Sound helper ───────────────────────────────────────────
  const playSound = useCallback((soundType) => {
    if (!soundEnabled) return;
    if (soundType === 'newMessage') soundGenerator.playNotification();
    else if (soundType === 'sent')  soundGenerator.playSent();
    else if (soundType === 'error') soundGenerator.playError();
  }, [soundEnabled]);

  // ── Session helpers ────────────────────────────────────────
  const getUserSessionStatus = useCallback(
    (user) => sessionStatusMap[user.id] || 'none',
    [sessionStatusMap],
  );

  const markSession = useCallback((userId, status) => {
    setSessionStatusMap(prev => ({ ...prev, [userId]: status }));
  }, []);

  const removeSession = useCallback((userId) => {
    setSessionStatusMap(prev => { const s = { ...prev }; delete s[userId]; return s; });
  }, []);

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

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  // ── Socket events ──────────────────────────────────────────
  useMultiUserSocket({
    socket, username, roomId, password,
    ensureSession, storage, idStorage,
    showToast, playSound, removeSession, markSession, scrollToBottom,
    x3dhIdentityRef, usersRef, cryptoSessionsReady,
    setUsers, setMessages, setAttacks, setReadReceipts,
    setTypingUsers, setUnreadCount, setMitmActive,
    setMyCertificate, setServerSigningPublicKey, setOtpkCount,
    savedContactKeys, setSavedContactKeys, setVerifiedContacts,
  });

  // ── Crypto actions ─────────────────────────────────────────
  const { joinRoom, sendMessage, handleDecrypt } = useMultiUserCrypto({
    socket, username, roomId, password,
    cryptoEngine, storage, idStorage,
    showToast, playSound, markSession,
    cryptoSessionsReady, ratchetsRef,
    x3dhIdentityRef, myIdentityKeyPairRef, myIdentityPublicJWKRef, myPrivateKeyRef, usersRef,
    serverSigningPublicKey, myCertificate, selectedUser, messageText,
    verifiedContacts, pendingSend,
    setMyPrivateKey, setMyFingerprint, setOtpkCount, setJoined, setMessages,
    setMessageText, setIsTyping, setUnreadCount,
    setDecryptedMessages, setMessageKeys, setCurrentDecrypting, setPendingSend,
    setVerifiedContacts,
  });

  // ── Misc actions ───────────────────────────────────────────
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

  // ── Pagination ─────────────────────────────────────────────
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

  // ══════════════════════════════════════════════════════════
  // RENDER : LOGIN
  // ══════════════════════════════════════════════════════════
  if (!joined) {
    return (
      <LoginScreen
        connected={connected}
        roomId={roomId}       setRoomId={setRoomId}
        username={username}   setUsername={setUsername}
        password={password}   setPassword={setPassword}
        soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}
        joinRoom={joinRoom}
        toasts={toasts}       removeToast={removeToast}
      />
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER : DASHBOARD
  // ══════════════════════════════════════════════════════════
  return (
    <>
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      <div className="min-h-screen bg-gray-900 text-white p-4">

        {/* ── Top bar ── */}
        <DashboardHeader
          roomId={roomId} username={username} users={users}
          otpkCount={otpkCount} myFingerprint={myFingerprint}
          soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}
          showMITMPanel={showMITMPanel} setShowMITMPanel={setShowMITMPanel} mitmActive={mitmActive}
          showGroupPanel={showGroupPanel} setShowGroupPanel={setShowGroupPanel}
          unreadCount={unreadCount}
        />

        {/* ── Protocol badges row ── */}
        <ProtocolBadges otpkCount={otpkCount} />

        {/* ── Main 3-column grid ── */}
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">

          <ParticipantsPanel
            users={users} username={username} selectedUser={selectedUser}
            getUserSessionStatus={getUserSessionStatus}
            verifiedContacts={verifiedContacts}
            handleSelectUser={handleSelectUser}
            launchAttack={launchAttack}
            setSafetyNumberTarget={setSafetyNumberTarget}
          />

          <MessagesPanel
            messages={messages} username={username}
            decryptedMessages={decryptedMessages} messageKeys={messageKeys}
            readReceipts={readReceipts} currentDecrypting={currentDecrypting}
            hasMoreMessages={hasMoreMessages} loadMoreMessages={loadMoreMessages}
            typingUsers={typingUsers} selectedUser={selectedUser}
            messageText={messageText} getUserSessionStatus={getUserSessionStatus}
            showDecryptPanel={showDecryptPanel} setShowDecryptPanel={setShowDecryptPanel}
            messagesContainerRef={messagesContainerRef} messagesEndRef={messagesEndRef}
            handleTyping={handleTyping} sendMessage={sendMessage} handleDecrypt={handleDecrypt}
          />

          {showDecryptPanel && (
            <DecryptedPanel
              decryptedMessages={decryptedMessages}
              setDecryptedMessages={setDecryptedMessages}
              showToast={showToast}
              setShowDecryptPanel={setShowDecryptPanel}
            />
          )}
        </div>

        {/* ── Attacks ── */}
        <AttacksPanel attacks={attacks} />

        {/* ── Optional panels ── */}
        {showMITMPanel && (
          <div className="max-w-7xl mx-auto mt-6">
            <MITMPanel socket={socket} users={users} username={username} roomId={roomId} />
          </div>
        )}

        {showGroupPanel && (
          <div className="max-w-7xl mx-auto mt-6">
            <GroupPanel
              socket={socket} users={users} username={username}
              myPrivateKey={myPrivateKey} roomId={roomId} showToast={showToast}
            />
          </div>
        )}

        {safetyNumberTarget && (
          <SafetyNumber
            myPublicKeyJWK={myIdentityPublicJWKRef.current}
            theirPublicKeyJWK={safetyNumberTarget.publicKey}
            theirUsername={safetyNumberTarget.username}
            onClose={() => {
              setVerifiedContacts(prev => new Set([...prev, safetyNumberTarget.id]));
              setSafetyNumberTarget(null);
            }}
          />
        )}
      </div>
    </>
  );
}

export default MultiUserSimulation;