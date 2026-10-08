import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../utils/api.js';

/**
 * Owns the authenticated Socket.IO connection. Reconnects whenever the session token changes.
 * `onUnauthorized` fires when the server rejects the token (e.g. expired session).
 */
export function useSocket(token, onUnauthorized) {
  const [socket, setSocket] = useState(null);
  const [onlineCount, setOnlineCount] = useState(0);
  const onUnauthorizedRef = useRef(onUnauthorized);
  onUnauthorizedRef.current = onUnauthorized;

  useEffect(() => {
    if (!token) return;

    const s = io(BACKEND_URL, { auth: { token } });

    s.on('online_count', setOnlineCount);
    s.on('connect_error', (err) => {
      console.error('[VibeLoop Socket] Connection error:', err.message);
      if (err.message === 'unauthorized') {
        onUnauthorizedRef.current?.();
      }
    });

    setSocket(s);

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [token]);

  return { socket, onlineCount };
}
