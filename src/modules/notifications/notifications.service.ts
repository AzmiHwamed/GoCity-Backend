import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { In, Repository } from 'typeorm';
import { createHash } from 'crypto';
import { NotificationsGateway } from './notifications.gateway';
import { CreateNotificationDto } from './dto/notification.dto';
import { DeviceToken } from './entities/device-token.entity';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly fcmEnabled: boolean;
  constructor(@InjectRepository(Notification) private readonly notifications: Repository<Notification>, @InjectRepository(DeviceToken) private readonly tokens: Repository<DeviceToken>, private readonly gateway: NotificationsGateway, config: ConfigService) {
    const raw = config.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');
    this.fcmEnabled = !!raw;
    if (raw) try { if (!getApps().length) initializeApp({ credential: cert(JSON.parse(raw)) }); this.logger.log('Firebase Admin initialized; FCM push is enabled.'); } catch (error) { this.fcmEnabled = false; this.logger.error('Firebase Admin was not initialized; push is disabled.', (error as Error).message); } else this.logger.warn('Firebase Admin is not configured; in-app notifications remain enabled, but FCM push is disabled.');
  }
  async create(userId: number, dto: CreateNotificationDto) {
    const notification = await this.notifications.save(this.notifications.create({ userId, ...dto }));
    this.gateway.emitToUser(userId, notification);
    void this.push(userId, notification);
    return notification;
  }
  list(userId: number) { return this.notifications.find({ where: { userId }, order: { createdAt: 'DESC' }, take: 100 }); }
  async markRead(userId: number, id: number) { await this.notifications.update({ id, userId }, { readAt: new Date() }); }
  async markAllRead(userId: number) { await this.notifications.createQueryBuilder().update().set({ readAt: new Date() }).where('user_id = :userId AND read_at IS NULL', { userId }).execute(); }
  async registerToken(userId: number, token: string, platform = 'web') { const tokenHash = this.hash(token); const old = await this.tokens.findOne({ where: { tokenHash } }); if (old) return this.tokens.save({ ...old, userId, token, platform, tokenHash }); return this.tokens.save(this.tokens.create({ userId, token, tokenHash, platform })); }
  async removeToken(userId: number, token: string) { await this.tokens.delete({ userId, tokenHash: this.hash(token) }); }
  private async push(userId: number, notification: Notification) {
    if (!this.fcmEnabled) return;
    const rows = await this.tokens.find({ where: { userId } }); if (!rows.length) return;
    try { const result = await getMessaging().sendEachForMulticast({ tokens: rows.map((row) => row.token), notification: { title: notification.title, body: notification.body }, data: { notificationId: String(notification.id), type: notification.type, ...(notification.data || {}) }, webpush: { fcmOptions: { link: notification.data?.url || '/' } } }); const expired = result.responses.flatMap((response, index) => !response.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(response.error?.code || '') ? [rows[index].token] : []); if (expired.length) await this.tokens.delete({ token: In(expired) }); } catch (error) { this.logger.error('Could not deliver FCM push.', (error as Error).message); }
  }
  private hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
}
