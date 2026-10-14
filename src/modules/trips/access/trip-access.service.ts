import { timingSafeEqual } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { UserRole } from '../../users/entities/user.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { TRIP_ROLE_RANK, TripMemberRole, TripVisibility } from '../trip.enums';

/**
 * Answers "what can this user do in this trip?". Used by TripRoleGuard and by any
 * module that hangs off a trip (activities, ideas, and later chat).
 */
@Injectable()
export class TripAccessService {
  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
  ) {}

  static hasRole(role: TripMemberRole | null | undefined, min: TripMemberRole): boolean {
    return !!role && TRIP_ROLE_RANK[role] >= TRIP_ROLE_RANK[min];
  }

  /** The user's role in the trip, or null if they aren't a member. */
  async getRole(tripId: number, userId: number): Promise<TripMemberRole | null> {
    const member = await this.members.findOne({ where: { tripId, userId } });
    return member?.role ?? null;
  }

  /**
   * Read-only access: members, anyone for PUBLIC trips, anyone with the share code for LINK
   * trips, and site admins. A PRIVATE trip is never viewable through a share code.
   */
  async canView(trip: Trip, user: AuthUser, shareCode?: string): Promise<boolean> {
    if (user.role === UserRole.ADMIN) return true;
    if (trip.visibility === TripVisibility.PUBLIC) return true;
    if (
      trip.visibility === TripVisibility.LINK &&
      shareCode &&
      trip.shareCode &&
      safeEqual(shareCode, trip.shareCode)
    ) {
      return true;
    }
    return !!(await this.getRole(trip.id, user.id));
  }

  /** Loads the trip if the user may view it; 404 otherwise (same as a missing trip). */
  async assertCanView(tripId: number, user: AuthUser, shareCode?: string): Promise<Trip> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip || !(await this.canView(trip, user, shareCode))) {
      throw new NotFoundException(`Trip #${tripId} not found`);
    }
    return trip;
  }

  /**
   * Throws unless the user has at least `min` in the trip. Non-members get 404 so trip ids
   * can't be probed. Site admins are treated as owners (for moderation).
   */
  async assertRole(tripId: number, user: AuthUser, min: TripMemberRole): Promise<TripMemberRole> {
    if (!(await this.trips.exists({ where: { id: tripId } }))) {
      throw new NotFoundException(`Trip #${tripId} not found`);
    }
    if (user.role === UserRole.ADMIN) return TripMemberRole.OWNER;

    const role = await this.getRole(tripId, user.id);
    if (!role) throw new NotFoundException(`Trip #${tripId} not found`);
    if (!TripAccessService.hasRole(role, min)) {
      throw new ForbiddenException(`This action needs the ${min} role in this trip`);
    }
    return role;
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
