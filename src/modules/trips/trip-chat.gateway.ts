import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { TripAccessService } from './access/trip-access.service';
import { TripMessage } from './entities/trip-message.entity';
import { TripMemberRole } from './trip.enums';
import { UserRole } from '../users/entities/user.entity';

@WebSocketGateway({ namespace: '/trips', cors: { origin: process.env.CORS_ORIGIN || '*' } })
export class TripChatGateway {
  private readonly logger = new Logger(TripChatGateway.name);
  @WebSocketServer() server: Server;
  constructor(private readonly jwt: JwtService, private readonly access: TripAccessService) {}

  async handleConnection(client: Socket) {
    try {
      const raw = String(client.handshake.auth?.token || client.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const payload = await this.jwt.verifyAsync<{ sub: number; email: string; role: UserRole }>(raw);
      client.data.user = { id: payload.sub, email: payload.email, role: payload.role };
    } catch { client.disconnect(true); }
  }

  @SubscribeMessage('trip:join')
  async join(@MessageBody() payload: { tripId?: number }, @ConnectedSocket() client: Socket) {
    const tripId = Number(payload?.tripId);
    if (!client.data.user || !Number.isInteger(tripId) || tripId < 1) return { ok: false };
    try {
      await this.access.assertRole(tripId, client.data.user, TripMemberRole.VIEWER);
      await client.join(`trip:${tripId}`);
      return { ok: true };
    } catch (error) {
      this.logger.warn(`Rejected chat room join for user ${client.data.user.id}, trip ${tripId}`);
      return { ok: false };
    }
  }

  emitMessage(tripId: number, message: TripMessage) {
    this.server?.to(`trip:${tripId}`).emit('trip:message', message);
  }
}
