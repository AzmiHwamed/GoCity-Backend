import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

@WebSocketGateway({ namespace: '/notifications', cors: { origin: process.env.CORS_ORIGIN || '*' } })
export class NotificationsGateway {
  private readonly logger = new Logger(NotificationsGateway.name);
  @WebSocketServer() server: Server;
  constructor(private readonly jwt: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const raw = String(client.handshake.auth?.token || client.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = await this.jwt.verifyAsync<{ sub: number }>(raw);
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`);
    } catch { client.disconnect(true); }
  }

  emitToUser(userId: number, notification: unknown) { this.server?.to(`user:${userId}`).emit('notification:new', notification); }
  @SubscribeMessage('notifications:ping') ping(@ConnectedSocket() client: Socket) { return { event: 'notifications:pong', data: { connected: !!client.data.userId } }; }
}
