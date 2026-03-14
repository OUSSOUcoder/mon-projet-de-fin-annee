import { useEffect } from 'react';

export function useMultiUserSocket({
  socket,
  username,
  roomId,
  password,
  ensureSession,
  storage,
  idStorage,
  showToast,
  playSound,
  removeSession,
  markSession,
  scrollToBottom,
  x3dhIdentityRef,
  usersRef,
  cryptoSessionsReady,
  setUsers,
  setMessages,
  setAttacks,
  setReadReceipts,
  setTypingUsers,
  setUnreadCount,
  setMitmActive,
  setMyCertificate,
  setServerSigningPublicKey,
  setOtpkCount,
  savedContactKeys,
  setSavedContactKeys,
  setVerifiedContacts,
}) {
  useEffect(() => {
    if (!socket) return;

    socket.on('user-joined', async ({ user, users: newUsers }) => {
      setUsers(newUsers);
      if (user?.username === username && user.certificate) setMyCertificate(user.certificate);
      if (user.username !== username && user.publicKey) {
        const ok = await ensureSession(user.id, user.publicKey);
        setVerifiedContacts(prev => {
          if (!prev.has(user.id)) return prev;
          const oldKey = savedContactKeys[user.id];
          if (oldKey && JSON.stringify(oldKey) !== JSON.stringify(user.publicKey)) {
            showToast(`🚨 Clé de ${user.username} a changé ! Re-vérifiez le Safety Number !`, 'warning');
            const s = new Set(prev);
            s.delete(user.id);
            return s;
          }
          return prev;
        });
        if (user.publicKey) {
          setSavedContactKeys(prev => ({ ...prev, [user.id]: user.publicKey }));
        }
        showToast(
          ok ? `✅ Session E2EE établie avec ${user.username}` : `❌ Erreur session avec ${user.username}`,
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
        socket.emit('message-received', { messageId: message.id, roomId, from: message.from });
      }
      await storage.saveMessage(roomId, message).catch(console.error);
      scrollToBottom();
    });

    socket.on('message-delivered', ({ messageId }) => {
      setReadReceipts(prev => ({ ...prev, [messageId]: 'delivered' }));
    });

    socket.on('message-read', ({ messageId }) => {
      setReadReceipts(prev => ({ ...prev, [messageId]: 'read' }));
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

    socket.on('mitm-status', ({ active }) => { setMitmActive(active); });

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
      socket.off('message-delivered');
      socket.off('message-read');
      socket.off('attack-launched');
      socket.off('attack-stopped');
      socket.off('user-left');
      socket.off('user-typing');
      socket.off('prekeys-low');
      socket.off('mitm-status');
    };
  }, [
    socket, username, roomId, password,
    ensureSession, storage, idStorage,
    showToast, playSound, removeSession,
    markSession, scrollToBottom,
    x3dhIdentityRef, usersRef, cryptoSessionsReady,
    setUsers, setMessages, setAttacks,
    setReadReceipts, setTypingUsers,
    setUnreadCount, setMitmActive,
    setMyCertificate, setServerSigningPublicKey,
    setOtpkCount, savedContactKeys,
    setSavedContactKeys, setVerifiedContacts,
  ]);
}
