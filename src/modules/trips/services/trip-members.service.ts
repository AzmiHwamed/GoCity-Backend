import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InvitePreviewDto, JoinResultDto } from '../dto/member.dto';
import { TripInvitation } from '../entities/trip-invitation.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { InvitableRole, InvitationStatus, TripMemberRole } from '../trip.enums';
import { TripIdeasService } from './trip-ideas.service';

@Injectable()
export class TripMembersService {
  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(TripInvitation) private readonly invitations: Repository<TripInvitation>,
    private readonly ideas: TripIdeasService,
    private readonly dataSource: DataSource,
  ) {}

  findAll(tripId: number): Promise<TripMember[]> {
    return this.members.find({
      where: { tripId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async updateRole(tripId: number, userId: number, role: InvitableRole): Promise<TripMember> {
    const member = await this.getMember(tripId, userId);
    if (member.role === TripMemberRole.OWNER) {
      throw new BadRequestException(
        "The owner's role can't be changed; transfer ownership instead",
      );
    }
    member.role = role;
    await this.members.save(member);
    return this.getMember(tripId, userId);
  }

  async remove(tripId: number, userId: number): Promise<void> {
    const member = await this.getMember(tripId, userId);
    if (member.role === TripMemberRole.OWNER) {
      throw new BadRequestException("The owner can't be removed; transfer ownership first");
    }
    await this.members.delete(member.id);
    await this.ideas.onMemberLeft(tripId, userId);
  }

  async leave(tripId: number, userId: number): Promise<void> {
    const member = await this.getMember(tripId, userId);
    if (member.role === TripMemberRole.OWNER) {
      throw new BadRequestException('Transfer ownership to another member before leaving');
    }
    await this.members.delete(member.id);
    await this.ideas.onMemberLeft(tripId, userId);
  }

  /** The new owner must already be a member; the previous owner becomes an editor. */
  async transferOwnership(tripId: number, newOwnerId: number): Promise<TripMember[]> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip #${tripId} not found`);
    const target = await this.getMember(tripId, newOwnerId);
    if (target.role === TripMemberRole.OWNER) {
      throw new BadRequestException('This member is already the owner');
    }

    await this.dataSource.transaction(async (em) => {
      await em.update(
        TripMember,
        { tripId, userId: trip.ownerId },
        { role: TripMemberRole.EDITOR },
      );
      await em.update(TripMember, { id: target.id }, { role: TripMemberRole.OWNER });
      await em.update(Trip, { id: tripId }, { ownerId: newOwnerId });
    });
    return this.findAll(tripId);
  }

  // ── Invite link ───────────────────────────────────────────

  async preview(code: string, userId: number): Promise<InvitePreviewDto> {
    const trip = await this.getTripByCode(code);
    const [memberCount, alreadyMember] = await Promise.all([
      this.members.count({ where: { tripId: trip.id } }),
      this.members.exists({ where: { tripId: trip.id, userId } }),
    ]);
    return {
      tripId: trip.id,
      name: trip.name,
      startDate: trip.startDate,
      endDate: trip.endDate,
      durationDays: trip.durationDays,
      ownerName: trip.owner ? `${trip.owner.firstName} ${trip.owner.lastName}` : '',
      memberCount,
      alreadyMember,
    };
  }

  /** Joining by link makes you an editor. If you're already a member nothing changes. */
  async joinByCode(code: string, userId: number): Promise<JoinResultDto> {
    const trip = await this.getTripByCode(code);
    const existing = await this.members.findOne({ where: { tripId: trip.id, userId } });
    if (existing) return { tripId: trip.id, role: existing.role, alreadyMember: true };

    await this.members.save(
      this.members.create({ tripId: trip.id, userId, role: TripMemberRole.EDITOR }),
    );
    // Any pending invitation to this trip is now settled.
    await this.invitations.update(
      { tripId: trip.id, inviteeUserId: userId, status: InvitationStatus.PENDING },
      { status: InvitationStatus.ACCEPTED, respondedAt: new Date() },
    );
    return { tripId: trip.id, role: TripMemberRole.EDITOR, alreadyMember: false };
  }

  // ──────────────────────────────────────────────────────────

  private async getMember(tripId: number, userId: number): Promise<TripMember> {
    const member = await this.members.findOne({
      where: { tripId, userId },
      relations: { user: true },
    });
    if (!member) throw new NotFoundException(`User #${userId} is not a member of this trip`);
    return member;
  }

  private async getTripByCode(code: string): Promise<Trip> {
    const trip = await this.trips.findOne({
      where: { inviteCode: code },
      relations: { owner: true },
    });
    if (!trip) throw new NotFoundException('This invite link is invalid or has been reset');
    return trip;
  }
}
