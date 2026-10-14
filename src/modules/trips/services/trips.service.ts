import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  FindOptionsWhere,
  In,
  LessThan,
  LessThanOrEqual,
  Like,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Paginated } from '../../../common/dto/paginated-response.dto';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { MediaType } from '../../media/entities/media.entity';
import { MediaService } from '../../media/media.service';
import { PlacesService } from '../../places/places.service';
import { escapeLike, toUserSummary } from '../../users/dto/search-users.dto';
import { UserRole } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { TripAccessService } from '../access/trip-access.service';
import { InviteLinkDto } from '../dto/member.dto';
import {
  BrowseTripsDto,
  CopyTripDto,
  MyTripsQueryDto,
  ProfileTripDto,
  PublicTripDto,
  ShareInfoDto,
  TRIP_WHEN,
  UserProfileDto,
  UserTripsQueryDto,
} from '../dto/sharing.dto';
import { ShareDetailsDto } from '../dto/share-details.dto';
import { CreateTripDto, UpdateTripDto } from '../dto/trip.dto';
import { ACTIVITY_DETAIL_FIELDS } from '../entities/activity-details';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripIdea } from '../entities/trip-idea.entity';
import { TripExpense } from '../entities/trip-expense.entity';
import { TripMember } from '../entities/trip-member.entity';
import { TripTip } from '../entities/trip-tip.entity';
import { Trip } from '../entities/trip.entity';
import { IdeaStatus, TripMemberRole, TripVisibility } from '../trip.enums';
import { addDays, assertValidDateRange, generateInviteCode, roundMoney } from '../trip.utils';
import { assertCoordinatePair } from './activity-validation';
import { TripGalleryService } from './trip-gallery.service';

const REQUIRED_FIELDS = ['name', 'startDate', 'endDate', 'travelersCount'] as const;

/** First ~200 characters of a story, cut at a word boundary. */
function excerpt(story: string | null, max = 200): string | null {
  if (!story) return null;
  if (story.length <= max) return story;
  const cut = story.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max).trimEnd()}…`;
}

/** Trip-level filter for "upcoming" (not ended yet) or "past" (already ended). */
function whenFilter(when?: (typeof TRIP_WHEN)[number]): FindOptionsWhere<Trip> {
  const today = new Date().toISOString().slice(0, 10);
  if (when === 'upcoming') return { endDate: MoreThanOrEqual(today) };
  if (when === 'past') return { endDate: LessThan(today) };
  return {};
}

@Injectable()
export class TripsService {
  private readonly appUrl: string;

  constructor(
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(TripActivity) private readonly activities: Repository<TripActivity>,
    @InjectRepository(TripIdea) private readonly ideas: Repository<TripIdea>,
    @InjectRepository(TripTip) private readonly tips: Repository<TripTip>,
    private readonly dataSource: DataSource,
    private readonly gallery: TripGalleryService,
    private readonly places: PlacesService,
    @InjectRepository(TripExpense) private readonly tripExpenses: Repository<TripExpense>,
    private readonly mediaService: MediaService,
    private readonly usersService: UsersService,
    private readonly access: TripAccessService,
    config: ConfigService,
  ) {
    this.appUrl = config.get<string>('app.appUrl', 'http://localhost:3000').replace(/\/$/, '');
  }

  // ── My trips ──────────────────────────────────────────────

  /** Creates the trip and makes the creator its owner. */
  async create(userId: number, dto: CreateTripDto): Promise<Trip> {
    assertValidDateRange(dto.startDate, dto.endDate);
    assertCoordinatePair(dto.hotelLatitude, dto.hotelLongitude, 'hotel');
    const city = await this.resolveCity(dto);
    const inviteCode = await this.uniqueCode('inviteCode');

    const tripId = await this.dataSource.transaction(async (em) => {
      const trip = await em.save(
        em.create(Trip, {
          ...dto,
          ...city,
          travelersCount: dto.travelersCount ?? 1,
          ownerId: userId,
          inviteCode,
        }),
      );
      await em.save(em.create(TripMember, { tripId: trip.id, userId, role: TripMemberRole.OWNER }));
      return trip.id;
    });
    return this.findOne(tripId, TripMemberRole.OWNER);
  }

  /** Trips I own or am a member of, with my role. Filter by role and upcoming/past. */
  async findMine(userId: number, query: MyTripsQueryDto): Promise<Paginated<Trip>> {
    const [memberships, total] = await this.members.findAndCount({
      where: {
        userId,
        ...(query.role ? { role: query.role } : {}),
        ...(query.when ? { trip: whenFilter(query.when) } : {}),
      },
      relations: { trip: true },
      order: { trip: { startDate: 'DESC' } },
      skip: query.skip,
      take: query.limit,
    });
    const trips = memberships
      .filter((m) => m.trip)
      .map((m) => Object.assign(m.trip as Trip, { myRole: m.role }));
    await this.attachStats(trips);
    await this.attachShareDetails(trips, false);
    return new Paginated(trips, total, query.page, query.limit);
  }

  async findOne(tripId: number, myRole?: TripMemberRole): Promise<Trip> {
    const trip = await this.trips.findOne({ where: { id: tripId }, relations: { owner: true } });
    if (!trip) throw new NotFoundException(`Trip #${tripId} not found`);
    trip.myRole = myRole;
    await this.attachStats([trip]);
    await this.attachShareDetails([trip], true);
    return trip;
  }

  /**
   * The owner's story, actual spend per person and tips (the tips list replaces the old one),
   * optionally with new gallery images in the same request. Everything is checked before
   * anything is saved.
   */
  async updateShareDetails(
    tripId: number,
    userId: number,
    dto: ShareDetailsDto,
    images: Express.Multer.File[] = [],
  ): Promise<Trip> {
    const trip = await this.getTrip(tripId);
    if (images.length) await this.gallery.assertCanAdd(tripId, images);

    await this.dataSource.transaction(async (em) => {
      const changes: Partial<Trip> = {};
      if (dto.story !== undefined) changes.story = dto.story?.trim() || null;
      if (dto.actualSpentPerPerson !== undefined) {
        changes.actualSpentPerPerson = dto.actualSpentPerPerson;
      }
      if (Object.keys(changes).length) await em.update(Trip, { id: trip.id }, changes);

      if (dto.tips !== undefined) {
        await em.delete(TripTip, { tripId: trip.id });
        if (dto.tips.length) {
          await em.save(
            dto.tips.map((text, position) =>
              em.create(TripTip, { tripId: trip.id, text: text.trim(), position }),
            ),
          );
        }
      }
    });

    if (images.length) await this.gallery.add(tripId, userId, images);
    return this.findOne(tripId, TripMemberRole.OWNER);
  }

  async update(tripId: number, dto: UpdateTripDto, myRole?: TripMemberRole): Promise<Trip> {
    const trip = await this.getTrip(tripId);
    for (const key of REQUIRED_FIELDS) {
      if (dto[key] === null) throw new BadRequestException(`${key} cannot be empty`);
    }
    Object.assign(trip, dto, await this.resolveCity(dto));
    assertValidDateRange(trip.startDate, trip.endDate);
    assertCoordinatePair(trip.hotelLatitude, trip.hotelLongitude, 'hotel');

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      const lastDay = await this.lastPlannedDay(tripId);
      if (lastDay > trip.durationDays) {
        throw new BadRequestException(
          `With these dates the trip is ${trip.durationDays} day(s) long, but something is planned on day ${lastDay}. Move or delete it first.`,
        );
      }
    }
    await this.trips.save(trip);
    return this.findOne(tripId, myRole);
  }

  /** Deletes the trip with its members, invitations, activities, ideas and trip images. */
  async remove(tripId: number): Promise<void> {
    await this.getTrip(tripId);
    await this.trips.delete(tripId);
    await this.mediaService.removeByEntity(MediaType.TRIP, tripId);
  }

  // ── Invite link (joins as editor) ─────────────────────────

  async getInviteLink(tripId: number): Promise<InviteLinkDto> {
    const trip = await this.getTrip(tripId);
    return this.toInviteLink(trip.inviteCode);
  }

  /** New code; the old link stops working. */
  async regenerateInviteLink(tripId: number): Promise<InviteLinkDto> {
    const trip = await this.getTrip(tripId);
    trip.inviteCode = await this.uniqueCode('inviteCode');
    await this.trips.save(trip);
    return this.toInviteLink(trip.inviteCode);
  }

  // ── Visibility and share link (read-only) ─────────────────

  async setVisibility(tripId: number, visibility: TripVisibility): Promise<ShareInfoDto> {
    const trip = await this.getTrip(tripId);
    trip.visibility = visibility;
    if (visibility !== TripVisibility.PRIVATE && !trip.shareCode) {
      trip.shareCode = await this.uniqueCode('shareCode');
    }
    await this.trips.save(trip);
    return this.toShareInfo(trip);
  }

  async getShareInfo(tripId: number): Promise<ShareInfoDto> {
    return this.toShareInfo(await this.getTrip(tripId));
  }

  /** New share code; the old share link stops working. */
  async regenerateShareCode(tripId: number): Promise<ShareInfoDto> {
    const trip = await this.getTrip(tripId);
    trip.shareCode = await this.uniqueCode('shareCode');
    await this.trips.save(trip);
    return this.toShareInfo(trip);
  }

  // ── Viewing other people's trips ──────────────────────────

  /** Public trips, newest first (or by start date), with name and date filters. */
  async browsePublic(query: BrowseTripsDto, viewer: AuthUser): Promise<Paginated<PublicTripDto>> {
    const base: FindOptionsWhere<Trip> = { visibility: TripVisibility.PUBLIC };
    if (query.cityPlaceId) base.cityPlaceId = query.cityPlaceId;
    if (query.from) base.startDate = MoreThanOrEqual(query.from);
    if (query.to) base.endDate = LessThanOrEqual(query.to);
    // Free text matches the trip name or its city ("lisb" finds trips in Lisbon).
    const text = query.q?.trim() ? Like(`%${escapeLike(query.q.trim())}%`) : undefined;
    const where = text
      ? [
          { ...base, name: text },
          { ...base, city: text },
        ]
      : base;

    const [trips, total] = await this.trips.findAndCount({
      where,
      relations: { owner: true },
      order: query.sort === 'start_date' ? { startDate: 'ASC' } : { createdAt: 'DESC' },
      skip: query.skip,
      take: query.limit,
    });
    const items = await this.toPublicViews(trips, viewer);
    return new Paginated(items, total, query.page, query.limit);
  }

  /** Read-only view of a trip the user may see (public, or one they belong to). */
  async viewPublic(tripId: number, viewer: AuthUser): Promise<PublicTripDto> {
    await this.access.assertCanView(tripId, viewer);
    const trip = await this.trips.findOne({ where: { id: tripId }, relations: { owner: true } });
    const [view] = await this.toPublicViews([trip as Trip], viewer, true);
    return view;
  }

  /** Read-only view through a share link. Stops working when the trip is set back to private. */
  async viewShared(shareCode: string, viewer: AuthUser): Promise<PublicTripDto> {
    const trip = await this.trips.findOne({
      where: { shareCode, visibility: In([TripVisibility.LINK, TripVisibility.PUBLIC]) },
      relations: { owner: true },
    });
    if (!trip) throw new NotFoundException('This share link is invalid or no longer active');
    const [view] = await this.toPublicViews([trip], viewer, true);
    return view;
  }

  /**
   * Copies a trip the user can view into a new private trip they own: details, hotel and all
   * activities/plans. Members, invitations, ideas and images are not copied.
   */
  async copy(sourceTripId: number, viewer: AuthUser, dto: CopyTripDto): Promise<Trip> {
    const source = await this.access.assertCanView(sourceTripId, viewer, dto.shareCode);
    const startDate = dto.startDate ?? source.startDate;
    const endDate = addDays(startDate, source.durationDays - 1);
    const [activities, inviteCode] = await Promise.all([
      this.activities.find({ where: { tripId: source.id } }),
      this.uniqueCode('inviteCode'),
    ]);

    const tripId = await this.dataSource.transaction(async (em) => {
      const trip = await em.save(
        em.create(Trip, {
          name: dto.name ?? `${source.name.slice(0, 143)} (copy)`,
          startDate,
          endDate,
          travelersCount: source.travelersCount,
          budgetPerPerson: source.budgetPerPerson,
          hotelName: source.hotelName,
          hotelLatitude: source.hotelLatitude,
          hotelLongitude: source.hotelLongitude,
          hotelPlaceId: source.hotelPlaceId,
          hotelAddress: source.hotelAddress,
          city: source.city,
          cityPlaceId: source.cityPlaceId,
          country: source.country,
          cityLatitude: source.cityLatitude,
          cityLongitude: source.cityLongitude,
          ownerId: viewer.id,
          inviteCode,
          visibility: TripVisibility.PRIVATE,
          shareCode: null,
          copiedFromTripId: source.id,
        }),
      );
      await em.save(
        em.create(TripMember, { tripId: trip.id, userId: viewer.id, role: TripMemberRole.OWNER }),
      );
      if (activities.length) {
        await em.save(
          activities.map((a) =>
            em.create(TripActivity, {
              ...Object.fromEntries(ACTIVITY_DETAIL_FIELDS.map((f) => [f, a[f]])),
              tripId: trip.id,
              createdById: viewer.id,
            }),
          ),
        );
      }
      return trip.id;
    });
    return this.findOne(tripId, TripMemberRole.OWNER);
  }

  // ── Profiles ──────────────────────────────────────────────

  /** Public profile; email, phone and the full trip count only for yourself and admins. */
  async userProfile(userId: number, viewer: AuthUser): Promise<UserProfileDto> {
    const user = await this.getVisibleUser(userId, viewer);
    const full = viewer.id === userId || viewer.role === UserRole.ADMIN;
    const publicTripCount = await this.members.count({
      where: { userId, trip: { visibility: TripVisibility.PUBLIC } },
    });
    const profile: UserProfileDto = {
      ...toUserSummary(user),
      createdAt: user.createdAt,
      publicTripCount,
    };
    if (full) {
      Object.assign(profile, {
        email: user.email,
        phone: user.phone,
        isActive: user.isActive,
        tripCount: await this.members.count({ where: { userId } }),
      });
    }
    return profile;
  }

  /**
   * A user's trips as the viewer may see them: everything for yourself and admins,
   * otherwise only public trips they own or belong to.
   */
  async userTrips(
    userId: number,
    viewer: AuthUser,
    query: UserTripsQueryDto,
  ): Promise<Paginated<ProfileTripDto>> {
    await this.getVisibleUser(userId, viewer);
    const full = viewer.id === userId || viewer.role === UserRole.ADMIN;
    const [memberships, total] = await this.members.findAndCount({
      where: {
        userId,
        trip: {
          ...(full ? {} : { visibility: TripVisibility.PUBLIC }),
          ...whenFilter(query.when),
        },
      },
      relations: { trip: { owner: true } },
      order: { trip: { startDate: 'DESC' } },
      skip: query.skip,
      take: query.limit,
    });
    const withTrips = memberships.filter((m) => m.trip);
    const views = await this.toPublicViews(
      withTrips.map((m) => m.trip as Trip),
      viewer,
    );
    const items = views.map((v, i) => ({ ...v, role: withTrips[i].role }));
    return new Paginated(items, total, query.page, query.limit);
  }

  // ──────────────────────────────────────────────────────────

  async getTrip(tripId: number): Promise<Trip> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip #${tripId} not found`);
    return trip;
  }

  private async getVisibleUser(userId: number, viewer: AuthUser) {
    const user = await this.usersService.findById(userId);
    if (!user || (!user.isActive && viewer.role !== UserRole.ADMIN)) {
      throw new NotFoundException(`User #${userId} not found`);
    }
    return user;
  }

  /** Builds the outsider-safe view of trips (stats, owner card, viewer's role, activities). */
  private async toPublicViews(
    trips: Trip[],
    viewer: AuthUser,
    withActivities = false,
  ): Promise<PublicTripDto[]> {
    if (!trips.length) return [];
    await this.attachStats(trips);
    await this.attachShareDetails(trips, withActivities);
    const ids = trips.map((t) => t.id);
    const [mine, activities] = await Promise.all([
      this.members.find({ where: { userId: viewer.id, tripId: In(ids) } }),
      withActivities
        ? this.activities.find({
            where: { tripId: In(ids) },
            order: { dayNumber: 'ASC', startTime: 'ASC' },
          })
        : Promise.resolve([] as TripActivity[]),
    ]);

    return trips.map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.startDate,
      endDate: t.endDate,
      durationDays: t.durationDays,
      travelersCount: t.travelersCount,
      budgetPerPerson: t.budgetPerPerson,
      totalBudget: t.totalBudget,
      hotelName: t.hotelName,
      hotelLatitude: t.hotelLatitude,
      hotelLongitude: t.hotelLongitude,
      hotelAddress: t.hotelAddress,
      hotelPlaceId: t.hotelPlaceId,
      city: t.city,
      country: t.country,
      cityPlaceId: t.cityPlaceId,
      visibility: t.visibility,
      totalExpenses: t.totalExpenses ?? 0,
      totalExpensesPerPerson: t.totalExpensesPerPerson ?? 0,
      memberCount: t.memberCount ?? 0,
      owner: t.owner ? toUserSummary(t.owner) : null,
      myRole: mine.find((m) => m.tripId === t.id)?.role ?? null,
      createdAt: t.createdAt,
      actualSpentPerPerson: t.actualSpentPerPerson,
      spendDifferencePerPerson: t.spendDifferencePerPerson,
      coverUrl: t.coverUrl ?? null,
      // Lists get a short excerpt; a single trip gets the whole story, tips and gallery.
      ...(withActivities
        ? {
            story: t.story,
            tips: t.tips ?? [],
            gallery: t.gallery ?? [],
            activities: activities.filter((a) => a.tripId === t.id),
          }
        : { storyExcerpt: excerpt(t.story) }),
    }));
  }

  /**
   * Adds tips, cover url and (optionally) the full gallery to each trip. Tips and the gallery
   * are only loaded for a single trip; lists get just the cover.
   */
  private async attachShareDetails(trips: Trip[], full: boolean): Promise<void> {
    if (!trips.length) return;
    const ids = trips.map((t) => t.id);
    const [tips, images] = await Promise.all([
      full
        ? this.tips.find({ where: { tripId: In(ids) }, order: { position: 'ASC' } })
        : Promise.resolve([] as TripTip[]),
      this.gallery.findForTrips(ids),
    ]);
    for (const trip of trips) {
      const gallery = images.filter((m) => m.entityId === trip.id);
      trip.coverUrl = TripGalleryService.coverUrl(trip, gallery);
      if (full) {
        trip.tips = tips.filter((t) => t.tripId === trip.id).map((t) => t.text);
        trip.gallery = gallery;
      }
    }
  }

  private toInviteLink(code: string): InviteLinkDto {
    return { code, url: `${this.appUrl}/invite/${code}`, role: TripMemberRole.EDITOR };
  }

  private toShareInfo(trip: Trip): ShareInfoDto {
    const active = trip.visibility !== TripVisibility.PRIVATE && !!trip.shareCode;
    return {
      visibility: trip.visibility,
      shareCode: trip.shareCode,
      shareUrl: active ? `${this.appUrl}/trips/shared/${trip.shareCode}` : null,
    };
  }

  private async uniqueCode(field: 'inviteCode' | 'shareCode'): Promise<string> {
    for (let i = 0; i < 5; i++) {
      const code = generateInviteCode();
      if (!(await this.trips.exists({ where: { [field]: code } }))) return code;
    }
    throw new Error(`Could not generate a unique ${field}`);
  }

  /** Highest day used by an activity or an open idea (0 if none). */
  private async lastPlannedDay(tripId: number): Promise<number> {
    const [activityMax, ideaMax] = await Promise.all([
      this.activities.maximum('dayNumber', { tripId }),
      this.ideas.maximum('dayNumber', { tripId, status: IdeaStatus.OPEN }),
    ]);
    return Math.max(activityMax ?? 0, ideaMax ?? 0);
  }

  /** Adds memberCount and totalExpenses to each trip (two grouped queries). */
  /**
   * With a cityPlaceId, fills city, country and coordinates from Google Places. A city name
   * on its own is stored as given. Clearing the city clears everything.
   */
  private async resolveCity(dto: {
    city?: string | null;
    cityPlaceId?: string | null;
  }): Promise<Partial<Trip>> {
    if (dto.cityPlaceId === null || (dto.city === null && dto.cityPlaceId === undefined)) {
      return {
        city: null,
        cityPlaceId: null,
        country: null,
        cityLatitude: null,
        cityLongitude: null,
      };
    }
    if (!dto.cityPlaceId) {
      return dto.city !== undefined
        ? {
            city: dto.city,
            cityPlaceId: null,
            country: null,
            cityLatitude: null,
            cityLongitude: null,
          }
        : {};
    }
    try {
      const c = await this.places.getCity(dto.cityPlaceId);
      return {
        city: dto.city ?? c.name,
        cityPlaceId: c.placeId,
        country: c.country,
        cityLatitude: c.latitude,
        cityLongitude: c.longitude,
      };
    } catch (err) {
      // Without Google (no key / outage) we can still keep a city name the client sent.
      if (dto.city) return { city: dto.city, cityPlaceId: dto.cityPlaceId };
      throw err;
    }
  }

  private async attachStats(trips: Trip[]): Promise<void> {
    if (!trips.length) return;
    const ids = trips.map((t) => t.id);
    const [counts, expenses, listed] = await Promise.all([
      this.members
        .createQueryBuilder('m')
        .select('m.tripId', 'tripId')
        .addSelect('COUNT(*)', 'count')
        .where({ tripId: In(ids) })
        .groupBy('m.tripId')
        .getRawMany<{ tripId: number; count: string }>(),
      this.activities
        .createQueryBuilder('a')
        .select('a.tripId', 'tripId')
        .addSelect('COALESCE(SUM(a.expense), 0)', 'total')
        .where({ tripId: In(ids) })
        .groupBy('a.tripId')
        .getRawMany<{ tripId: number; total: string }>(),
      this.tripExpenses
        .createQueryBuilder('x')
        .select('x.tripId', 'tripId')
        .addSelect('COALESCE(SUM(x.amount), 0)', 'total')
        .where({ tripId: In(ids) })
        .groupBy('x.tripId')
        .getRawMany<{ tripId: number; total: string }>(),
    ]);
    const sumFor = (rows: { tripId: number; total: string }[], id: number) =>
      Number(rows.find((r) => Number(r.tripId) === id)?.total ?? 0);
    for (const trip of trips) {
      trip.memberCount = Number(counts.find((c) => Number(c.tripId) === trip.id)?.count ?? 0);
      trip.totalExpenses = roundMoney(sumFor(expenses, trip.id) + sumFor(listed, trip.id));
      trip.totalExpensesPerPerson = roundMoney(
        trip.totalExpenses / Math.max(trip.travelersCount ?? 1, 1),
      );
    }
  }
}
