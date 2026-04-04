/**
 * useWebSocket — hook para real-time updates via Socket.io
 * Escuta eventos do backend e invalida queries React Query automaticamente.
 */

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';

interface WsStatus {
  connected: boolean;
  lastUpdate: Date | null;
  poolsUpdatedCount: number;
}

let sharedSocket: Socket | null = null;
let refCount = 0;

export function getSocket(): Socket {
  if (!sharedSocket) {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    sharedSocket = io(origin, {
      path: '/ws',
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
  }
  return sharedSocket;
}

export function useWebSocket() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<WsStatus>({
    connected: false,
    lastUpdate: null,
    poolsUpdatedCount: 0,
  });
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    const socket = getSocket();
    refCount++;

    const onConnect = () => {
      setStatus(s => ({ ...s, connected: true }));
    };

    const onDisconnect = () => {
      setStatus(s => ({ ...s, connected: false }));
    };

    const onPoolsUpdated = (data: { count: number; timestamp: string }) => {
      // Invalida queries de pools para forçar refetch
      queryClient.invalidateQueries({ queryKey: ['pools'] });
      queryClient.invalidateQueries({ queryKey: ['recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['scout-pools'] });
      setStatus(s => ({
        ...s,
        lastUpdate: new Date(data.timestamp),
        poolsUpdatedCount: s.poolsUpdatedCount + 1,
      }));
    };

    const onScoreUpdated = (data: { poolId: string; score: number }) => {
      queryClient.invalidateQueries({ queryKey: ['pool', data.poolId] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('pools:updated', onPoolsUpdated);
    socket.on('score:updated', onScoreUpdated);

    // Sync initial connected state
    if (socket.connected) {
      setStatus(s => ({ ...s, connected: true }));
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('pools:updated', onPoolsUpdated);
      socket.off('score:updated', onScoreUpdated);

      refCount--;
      // Desconecta apenas quando não há mais consumidores
      if (refCount === 0 && sharedSocket) {
        sharedSocket.disconnect();
        sharedSocket = null;
      }
    };
  }, [queryClient]);

  return status;
}
