import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, IsNull, Repository } from 'typeorm';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { MailService } from '../../mail/mail.service';
import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { CreateInvitationDto, JoinResultDto } from '../dto/member.dto';
import { TripInvitation } from '../entities/trip-invitation.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { InvitationStatus, TripMemberRole } from '../trip.enums';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class TripInvitationsService {
  private readonly logger = new Logger(TripInvitationsService.name);
  private readonly appUrl: string;

  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(TripInvitation) private readonly invitations: Repository<TripInvitation>,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly notificationsService: NotificationsService,
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('app.appUrl', 'http://localhost:3000').replace(/\/$/, '');
  }

  /**
   * Invites by user id or by email. An email without an account is kept on the invitation
   * and matched when someone signs up with it.
   */
  async send(tripId: number, inviter: AuthUser, dto: CreateInvitationDto): Promise<TripInvitation> {
    if ((dto.email === undefined) === (dto.userId === undefined)) {
      throw new BadRequestException('Give either email or userId');
    }
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip #${tripId} not found`);

    let invitee: User | null;
    if (dto.userId !== undefined) {
      invitee = await this.usersService.findById(dto.userId);
      if (!invitee || !invitee.isActive)
        throw new NotFoundException(`User #${dto.userId} not found`);
    } else {
      invitee = await this.usersService.findByEmail(dto.email as string);
    }
    const email = invitee?.email ?? (dto.email as string);

    if (invitee?.id === inviter.id || email === inviter.email) {
      throw new BadRequestException("You can't invite yourself");
    }
    if (invitee && (await this.members.exists({ where: { tripId, userId: invitee.id } }))) {
      throw new ConflictException('This person is already a member of the trip');
    }
    const pending: FindOptionsWhere<TripInvitation>[] = [
      { tripId, inviteeEmail: email, status: InvitationStatus.PENDING },
    ];
    if (invitee)
      pending.push({ tripId, inviteeUserId: invitee.id, status: InvitationStatus.PENDING });
    if (await this.invitations.exists({ where: pending })) {
      throw new ConflictException('This person already has a pending invitation to this trip');
    }

    const invitation = await this.invitations.save(
      this.invitations.create({
        tripId,
        invitedById: inviter.id,
        inviteeUserId: invitee?.id ?? null,
        inviteeEmail: email,
        role: dto.role ?? TripMemberRole.VIEWER,
        status: InvitationStatus.PENDING,
      }),
    );

    const sender = await this.usersService.findById(inviter.id);
    if (invitee) {
      await this.notificationsService.create(invitee.id, {
        type: 'trip_invitation',
        title: 'You have a trip invitation',
        body: `${sender ? `${sender.firstName} ${sender.lastName}` : 'A traveller'} invited you to ${trip.name}.`,
        data: { invitationId: String(invitation.id), tripId: String(trip.id), url: '/notifications' },
      });
    }
    try {
      await this.mailService.sendTripInvitation({
        to: email,
        inviterName: sender ? `${sender.firstName} ${sender.lastName}` : 'Someone',
        tripName: trip.name,
        role: invitation.role,
        hasAccount: !!invitee,
        appUrl: this.appUrl,
      });
    } catch (err) {
      // The invitation still shows up in the invitee's list; don't fail the request.
      this.logger.error(`Failed to email invitation #${invitation.id}`, (err as Error).stack);
    }
    return invitation;
  }

  findForTrip(tripId: number, status?: InvitationStatus): Promise<TripInvitation[]> {
    return this.invitations.find({
      where: { tripId, ...(status ? { status } : {}) },
      relations: { inviteeUser: true },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(tripId: number, invitationId: number): Promise<void> {
    const invitation = await this.invitations.findOne({ where: { id: invitationId, tripId } });
    if (!invitation) throw new NotFoundException(`Invitation #${invitationId} not found`);
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException(`This invitation was already ${invitation.status}`);
    }
    await this.invitations.update(invitation.id, {
      status: InvitationStatus.REVOKED,
      respondedAt: new Date(),
    });
  }

  /** My pending invitations, including ones sent to my email before I had an account. */
  findMine(user: AuthUser): Promise<TripInvitation[]> {
    return this.invitations.find({
      where: this.mineWhere(user),
      relations: { trip: true, invitedBy: true },
      order: { createdAt: 'DESC' },
    });
  }

  async accept(invitationId: number, user: AuthUser): Promise<JoinResultDto> {
    const invitation = await this.getMine(invitationId, user);

    return this.dataSource.transaction(async (em) => {
      const existing = await em.findOne(TripMember, {
        where: { tripId: invitation.tripId, userId: user.id },
      });
      if (!existing) {
        await em.save(
          em.create(TripMember, {
            tripId: invitation.tripId,
            userId: user.id,
            role: invitation.role,
          }),
        );
      }
      await em.update(TripInvitation, invitation.id, {
        status: InvitationStatus.ACCEPTED,
        inviteeUserId: user.id,
        respondedAt: new Date(),
      });
      return {
        tripId: invitation.tripId,
        role: existing?.role ?? invitation.role,
        alreadyMember: !!existing,
      };
    });
  }

  async decline(invitationId: number, user: AuthUser): Promise<void> {
    const invitation = await this.getMine(invitationId, user);
    await this.invitations.update(invitation.id, {
      status: InvitationStatus.DECLINED,
      inviteeUserId: user.id,
      respondedAt: new Date(),
    });
  }

  // ──────────────────────────────────────────────────────────

  private mineWhere(user: AuthUser): FindOptionsWhere<TripInvitation>[] {
    return [
      { inviteeUserId: user.id, status: InvitationStatus.PENDING },
      { inviteeUserId: IsNull(), inviteeEmail: user.email, status: InvitationStatus.PENDING },
    ];
  }

  /** A pending invitation addressed to this user (by id or by email); 404 otherwise. */
  private async getMine(invitationId: number, user: AuthUser): Promise<TripInvitation> {
    const invitation = await this.invitations.findOne({
      where: this.mineWhere(user).map((w) => ({ ...w, id: invitationId })),
    });
    if (!invitation) throw new NotFoundException(`Invitation #${invitationId} not found`);
    return invitation;
  }
}
