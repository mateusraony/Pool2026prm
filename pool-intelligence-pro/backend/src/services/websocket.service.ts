/**
 * WebSocket Service — Socket.io real-time updates
 * Emite eventos de atualização de pools, preços e scores para clientes conectados.
 * Suporte a rooms por pool via pool:subscribe / pool:unsubscribe.
 */

import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { logService } from './log.service.js';
import type { UnifiedPool } from '../types/index.js';
import { rangeMonitorService } from './range.service.js';
import { config } from '../config/index.js';

type WsEvent = 'pools:updated' | 'score:updated' | 'price:updated' | 'system:status' | 'pool:updated';

class WebSocketService {
  private io: Server | null = null;
  private poolBroadcastThrottle = new Map<string, number>(); // poolKey → timestamp ms

  init(httpServer: HttpServer) {
    const wsOrigin: string | string[] | boolean = (() => {
      if (config.nodeEnv === 'production') {
        const allowedOrigins = [
          process.env.RENDER_EXTERNAL_URL,
          process.env.APP_URL,
          process.env.CORS_ORIGIN,
        ].filter(Boolean) as string[];
        return allowedOrigins.length > 0 ? allowedOrigins : false;
      }
      return true;
    })();

    this.io = new Server(httpServer, {
      path: '/ws',
      cors: {
        origin: wsOrigin,
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', (socket: Socket) => {
      logService.info('SYSTEM', 'Client connected: ' + socket.id + ' | total: ' + this.connectedClients);

      // Client pode se inscrever em rooms específicas (ex: pools, alerts)
      socket.on('subscribe', (room: string) => {
        if (typeof room === 'string' && room.length < 64) {
          socket.join(room);
          logService.info('SYSTEM', 'Client ' + socket.id + ' joined room: ' + room);
        }
      });

      socket.on('unsubscribe', (room: string) => {
        socket.leave(room);
      });

      // Rooms por pool — subscribe/unsubscribe direcionado
      socket.on('pool:subscribe', (data: unknown) => {
        if (data && typeof data === 'object' && 'chain' in data && 'address' in data) {
          const { chain, address } = data as { chain: string; address: string };
          if (typeof chain === 'string' && typeof address === 'string') {
            socket.join(`pool:${chain}:${address}`);
          }
        }
      });

      socket.on('pool:unsubscribe', (data: unknown) => {
        if (data && typeof data === 'object' && 'chain' in data && 'address' in data) {
          const { chain, address } = data as { chain: string; address: string };
          if (typeof chain === 'string' && typeof address === 'string') {
            socket.leave(`pool:${chain}:${address}`);
          }
        }
      });

      socket.on('disconnect', () => {
        logService.info('SYSTEM', 'Client disconnected: ' + socket.id);
      });

      // Envia status imediato ao conectar
      socket.emit('system:status', { connected: true, timestamp: new Date().toISOString() });
    });

    logService.info('SYSTEM', 'WebSocket server initialized at path /ws');
  }

  /** Emite para todos os clientes conectados */
  emit(event: WsEvent, data: unknown) {
    this.io?.emit(event, data);
  }

  /** Emite para uma room específica */
  emitToRoom(room: string, event: WsEvent, data: unknown) {
    this.io?.to(room).emit(event, data);
  }

  /** Número de clientes conectados */
  get connectedClients(): number {
    return this.io?.sockets.sockets.size ?? 0;
  }

  /** Notifica clientes que os pools foram atualizados */
  broadcastPoolsUpdated(count: number) {
    this.emit('pools:updated', {
      count,
      timestamp: new Date().toISOString(),
    });
  }

  /** Notifica atualização de score de um pool */
  broadcastScoreUpdated(poolId: string, score: number) {
    this.emit('score:updated', {
      poolId,
      score,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast de update para clientes inscritos na room de uma pool específica.
   * Throttle: mínimo 10s entre broadcasts por pool.
   */
  broadcastPoolUpdate(pool: UnifiedPool) {
    if (!this.io) return;

    const poolKey = `${pool.chain}:${pool.poolAddress}`;
    const now = Date.now();
    const last = this.poolBroadcastThrottle.get(poolKey) ?? 0;

    if (now - last < 10_000) return;
    this.poolBroadcastThrottle.set(poolKey, now);

    const positionAlert = this.calcPositionAlert(pool);

    this.io.to(`pool:${pool.chain}:${pool.poolAddress}`).emit('pool:updated', {
      pool,
      updatedAt: new Date().toISOString(),
      ...(positionAlert !== undefined && { positionAlert }),
    });
  }

  private calcPositionAlert(pool: UnifiedPool): 'in_range' | 'out_of_range' | 'near_edge' | undefined {
    const positions = rangeMonitorService.getPositions();
    const pos = positions.find(
      p => p.poolAddress.toLowerCase() === pool.poolAddress.toLowerCase() && p.chain === pool.chain
    );
    if (!pos) return undefined;

    const price = pool.price ?? pos.entryPrice;
    const { rangeLower, rangeUpper } = pos;

    if (price < rangeLower || price > rangeUpper) return 'out_of_range';

    // near_edge: dentro de 5% da borda em relação ao preço atual
    const distToEdgePct = Math.min(
      Math.abs(price - rangeLower) / price,
      Math.abs(rangeUpper - price) / price
    );
    if (distToEdgePct < 0.05) return 'near_edge';

    return 'in_range';
  }
}

export const wsService = new WebSocketService();
