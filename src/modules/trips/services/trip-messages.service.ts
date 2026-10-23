import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TripChatRead } from '../entities/trip-chat-read.entity';
import { TripMember } from '../entities/trip-member.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { TripMessage } from '../entities/trip-message.entity';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripIdea } from '../entities/trip-idea.entity';

@Injectable()
export class TripMessagesService {
  constructor(
    @InjectRepository(TripMessage) private readonly messages: Repository<TripMessage>,
    @InjectRepository(TripChatRead) private readonly reads: Repository<TripChatRead>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(TripActivity) private readonly activities: Repository<TripActivity>,
    @InjectRepository(TripIdea) private readonly ideas: Repository<TripIdea>,
    private readonly notifications: NotificationsService,
  ) {}

  async findRecent(tripId: number, limit = 50): Promise<TripMessage[]> {
    const rows = await this.messages.find({
      where: { tripId },
      relations: { author: true, sharedTrip: true, sharedActivity: true, sharedIdea: true },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    return rows.reverse();
  }

  async findBySharedIdea(tripId: number, ideaId: number): Promise<TripMessage[]> {
    return this.messages.find({
      where: { tripId, sharedIdeaId: ideaId },
      relations: { author: true, sharedTrip: true, sharedActivity: true, sharedIdea: true },
    });
  }

  async create(tripId: number, authorId: number, content?: string, sharedTripId?: number, sharedActivityId?: number, sharedIdeaId?: number): Promise<TripMessage> {
    if (!content?.trim() && !sharedTripId && !sharedActivityId && !sharedIdeaId) throw new BadRequestException('Write a message or choose a trip, activity, or idea to share');
    if (sharedActivityId) {
      const activity = await this.activities.findOne({ where: { id: sharedActivityId, tripId } });
      if (!activity) throw new BadRequestException('The suggested activity must belong to this trip');
    }
    if (sharedIdeaId && !(await this.ideas.findOne({ where: { id: sharedIdeaId, tripId } }))) throw new BadRequestException('The shared idea must belong to this trip');
    const message = await this.messages.save(
      this.messages.create({ tripId, authorId, content: content?.trim() || '', sharedTripId: sharedTripId ?? null, sharedActivityId: sharedActivityId ?? null, sharedIdeaId: sharedIdeaId ?? null }),
    );
    const saved = (await this.messages.findOne({ where: { id: message.id }, relations: { author: true, sharedTrip: true, sharedActivity: true, sharedIdea: true } }))!;
    const members = await this.members.find({ where: { tripId }, select: { userId: true } });
    await Promise.all(members.filter((member) => member.userId !== authorId).map((member) => this.notifications.create(member.userId, {
      type: 'trip_message', title: `New message in your trip`, body: `${saved.author?.firstName || 'A trip member'}: ${saved.content || `suggested ${saved.sharedIdea?.name || saved.sharedActivity?.name || saved.sharedTrip?.name || 'a trip'}`}`.slice(0, 150),
      data: { tripId: String(tripId), url: `/trips/${tripId}` },
    })));
    return saved;
  }

  async readState(tripId: number, userId: number) {
    const row = await this.reads.findOne({ where: { tripId, userId } });
    const query = this.messages.createQueryBuilder('message').where('message.trip_id = :tripId AND message.author_id <> :userId', { tripId, userId });
    if (row) query.andWhere('message.created_at > :readAt', { readAt: row.readAt });
    return { unreadCount: await query.getCount(), readAt: row?.readAt ?? null };
  }

  async markRead(tripId: number, userId: number) {
    const now = new Date(); const row = await this.reads.findOne({ where: { tripId, userId } });
    await this.reads.save(row ? { ...row, readAt: now } : this.reads.create({ tripId, userId, readAt: now }));
    return { unreadCount: 0, readAt: now };
  }
}
