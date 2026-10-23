import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { TripAccessService } from '../access/trip-access.service';
import { ActivityDetailsDto, UpdateActivityDto } from '../dto/activity.dto';
import { CopyActivityDto } from '../dto/sharing.dto';
import { ACTIVITY_DETAIL_FIELDS } from '../entities/activity-details';
import { TripActivity } from '../entities/trip-activity.entity';
import { Trip } from '../entities/trip.entity';
import { ActivityKind, TripMemberRole } from '../trip.enums';
import { assertHasLocation, hasLocation, validateActivityDetails } from './activity-validation';

@Injectable()
export class TripActivitiesService {
  constructor(
    @InjectRepository(TripActivity) private readonly activities: Repository<TripActivity>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    private readonly access: TripAccessService,
  ) {}

  /** Sorted by day, then start time. */
  findAll(tripId: number, day?: number): Promise<TripActivity[]> {
    return this.activities.find({
      where: { tripId, ...(day ? { dayNumber: day } : {}) },
      order: { dayNumber: 'ASC', startTime: 'ASC' },
    });
  }

  async findOne(tripId: number, activityId: number): Promise<TripActivity> {
    const activity = await this.activities.findOne({ where: { id: activityId, tripId } });
    if (!activity) throw new NotFoundException(`Activity #${activityId} not found`);
    return activity;
  }

  async create(tripId: number, userId: number, dto: ActivityDetailsDto): Promise<TripActivity> {
    const trip = await this.getTrip(tripId);
    const activity = this.activities.create({
      kind: ActivityKind.ACTIVITY,
      expense: 0,
      ...dto,
      tripId,
      createdById: userId,
    });
    validateActivityDetails(activity, trip.durationDays);
    assertHasLocation(activity);
    return this.activities.save(activity);
  }

  async update(tripId: number, activityId: number, dto: UpdateActivityDto): Promise<TripActivity> {
    const [trip, activity] = await Promise.all([
      this.getTrip(tripId),
      this.findOne(tripId, activityId),
    ]);
    const hadLocation = hasLocation(activity);
    Object.assign(activity, dto);
    validateActivityDetails(activity, trip.durationDays);
    // Older activities without a location can still be edited, but one can't lose its location.
    if (hadLocation) assertHasLocation(activity);
    return this.activities.save(activity);
  }

  /**
   * Copies an activity from a trip the user can view (member, public, or shared link) into
   * one of their own trips where they are editor or owner.
   */
  async copyTo(
    sourceTripId: number,
    activityId: number,
    viewer: AuthUser,
    dto: CopyActivityDto,
  ): Promise<TripActivity> {
    await this.access.assertCanView(sourceTripId, viewer, dto.shareCode);
    const source = await this.findOne(sourceTripId, activityId);
    await this.access.assertRole(dto.targetTripId, viewer, TripMemberRole.EDITOR);
    const target = await this.getTrip(dto.targetTripId);

    const copy = this.activities.create({
      ...Object.fromEntries(ACTIVITY_DETAIL_FIELDS.map((f) => [f, source[f]])),
      dayNumber: dto.dayNumber ?? source.dayNumber,
      tripId: target.id,
      createdById: viewer.id,
    });
    validateActivityDetails(copy, target.durationDays);
    return this.activities.save(copy);
  }

  async remove(tripId: number, activityId: number): Promise<void> {
    const activity = await this.findOne(tripId, activityId);
    await this.activities.delete(activity.id);
  }

  private async getTrip(tripId: number): Promise<Trip> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip #${tripId} not found`);
    return trip;
  }
}
