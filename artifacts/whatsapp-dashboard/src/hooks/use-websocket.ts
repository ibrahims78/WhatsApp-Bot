import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { getListSessionsQueryKey, getGetSessionQueryKey, getGetSessionMessagesQueryKey } from '@workspace/api-client-react';

interface WsEvents {
  qr: { sessionId: string; qr: string };
  status: { sessionId: string; status: string };
  message: { sessionId: string; message: any };
}

type QrListener = (data: WsEvents['qr']) => void;

const qrListeners = new Set<QrListener>();

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const socket = io('/', {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('status', (data: WsEvents['status']) => {
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey(data.sessionId) });
    });

    socket.on('qr', (data: WsEvents['qr']) => {
      queryClient.invalidateQueries({ queryKey: [`/api/sessions/${data.sessionId}/qr`] });
      qrListeners.forEach(fn => fn(data));
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

export function useQrEvent(sessionId: string, onQr: (qr: string) => void) {
  const onQrRef = useRef(onQr);
  onQrRef.current = onQr;

  useEffect(() => {
    const handler: QrListener = (data) => {
      if (data.sessionId === sessionId) {
        onQrRef.current(data.qr);
      }
    };
    qrListeners.add(handler);
    return () => {
      qrListeners.delete(handler);
    };
  }, [sessionId]);
}
