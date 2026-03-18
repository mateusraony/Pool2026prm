/**
 * usePoolWebSocket — inscreve-se na room de uma pool específica.
 * Faz join ao montar, leave ao desmontar. Retorna dados live em tempo real.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket } from './useWebSocket';
import type { UnifiedPool } from '@/api/client';

type PositionAlert = 'in_range' | 'out_of_range' | 'near_edge';

interface PoolWsPayload {
  pool: UnifiedPool;
  updatedAt: string;
  positionAlert?: PositionAlert;
}

interface PoolWsState {
  liveData: UnifiedPool | null;
  lastUpdated: Date | null;
  isConnected: boolean;
  positionAlert: PositionAlert | undefined;
}

export function usePoolWebSocket(chain: string | undefined, address: string | undefined): PoolWsState {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PoolWsState>({
    liveData: null,
    lastUpdated: null,
    isConnected: false,
    positionAlert: undefined,
  });
  const chainRef = useRef(chain);
  const addressRef = useRef(address);
  chainRef.current = chain;
  addressRef.current = address;

  useEffect(() => {
    if (!chain || !address) return;

    const socket = getSocket();

    socket.emit('pool:subscribe', { chain, address });

    const onConnect = () => setState(s => ({ ...s, isConnected: true }));
    const onDisconnect = () => setState(s => ({ ...s, isConnected: false }));

    const onPoolUpdated = (data: PoolWsPayload) => {
      // Só processa eventos da pool que estamos observando
      if (
        data.pool.chain !== chainRef.current ||
        data.pool.poolAddress?.toLowerCase() !== addressRef.current?.toLowerCase()
      ) return;

      setState(s => ({
        ...s,
        liveData: data.pool,
        lastUpdated: new Date(data.updatedAt),
        positionAlert: data.positionAlert,
      }));

      queryClient.invalidateQueries({ queryKey: ['scout-pool-detail', chain, address] });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('pool:updated', onPoolUpdated);

    if (socket.connected) {
      setState(s => ({ ...s, isConnected: true }));
    }

    return () => {
      socket.emit('pool:unsubscribe', { chain, address });
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('pool:updated', onPoolUpdated);
    };
  }, [chain, address, queryClient]);

  return state;
}
