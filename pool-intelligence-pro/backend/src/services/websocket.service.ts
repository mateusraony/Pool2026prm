/**
 * WebSocket Service — Socket.io real-time updates
 * Emite eventos de atualização de pools, preços e scores para clientes conectados.
 */

import { Server, type Socket } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { logService } from './log.service.js';

type WsEvent = 'pools:updated' | 'score:updated' | 'price:updated' | 'system:status';

class WebSocketService {
  private io: Server | null = null;

  init(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      path: '/ws',
      cors: {
        origin: '*',
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
}

export const wsService = new WebSocketService();
