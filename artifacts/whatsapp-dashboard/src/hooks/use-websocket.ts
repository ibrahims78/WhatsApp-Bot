import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getListSessionsQueryKey, getGetSessionQueryKey, getGetSessionMessagesQueryKey } from '@workspace/api-client-react';

interface WsEvents {
  qr: { sessionId: string; qr: string };
  status: { sessionId: string; status: string };
  message: { sessionId: string; message: any };
}

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // Connect to the same host under /ws path
    const socket = io('/', {
      path: '/ws',
      transports: ['websocket'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('status', (data: WsEvents['status']) => {
      // Invalidate list and specific session
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(data.sessionId) });
    });

    socket.on('qr', (data: WsEvents['qr']) => {
      // We can update a local state or let components listen directly, 
      // but TanStack query invalidation on the QR endpoint is safer for complex structures
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${data.sessionId}/qr`] });
    });

    socket.on('message', (data: WsEvents['message']) => {
      queryClient.invalidateQueries({ queryKey: getGetSessionMessagesQueryKey(data.sessionId) });
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  return { connected, socket: socketRef.current };
}
