import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const [socket, setSocket]       = useState(null);
  const [connected, setConnected] = useState(false);

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

  return { socket, connected };
}
 