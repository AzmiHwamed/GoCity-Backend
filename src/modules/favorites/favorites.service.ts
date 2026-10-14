import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { Media, MediaType } from '../media/entities/media.entity';
import { PlacesService } from '../places/places.service';
import { TripAccessService } from '../trips/access/trip-access.service';
import { TripActivity } from '../trips/entities/trip-activity.entity';
import { Trip } from '../trips/entities/trip.entity';
import {
  AddFavoriteDto,
  FavoriteCountsDto,
  FavoritePageDto,
  FavoriteQueryDto,
  FavoriteViewDto,
} from './dto';
import { Favorite, FavoriteType } from './entities/favorite.entity';

type Snapshot = Pick<Favorite, 'title' | 'subtitle' | 'imageUrl'>;

const numericId = (targetId: string, what: string) => {
  if (!/^\d+$/.test(targetId)) throw new NotFoundException(`${what} not found`);
  return Number(targetId);
};
const mapsUrl = (placeId: string) => `https://www.google.com/maps/place/?q=place_id:${placeId}`;
const days = (t: Trip) => `${t.durationDays} day${t.durationDays === 1 ? '' : 's'}`;

/**
 * A user's favorites, by type. Trips and activities are checked against what the user may
 * see (members, public, link-shared); hotels and places come from Google Places.
 */
@Injectable()
export class FavoritesService {
  constructor(
    @InjectRepository(Favorite) private readonly favorites: Repository<Favorite>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripActivity) private readonly activities: Repository<TripActivity>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
    private readonly access: TripAccessService,
    private readonly places: PlacesService,
  ) {}

  /** Saves a favorite. Saving something already saved just returns it. */
  async add(user: AuthUser, dto: AddFavoriteDto): Promise<FavoriteViewDto> {
    const key = { userId: user.id, type: dto.type, targetId: dto.targetId };
    let favorite = await this.favorites.findOne({ where: key });
    if (!favorite) {
      const snapshot = await this.snapshot(user, dto);
      favorite = await this.favorites.save(this.favorites.create({ ...key, ...snapshot }));
    }
    const [view] = await this.toViews([favorite], user);
    return view;
  }

  /** Removes a favorite (no error if it wasn't saved). */
  async remove(user: AuthUser, type: FavoriteType, targetId: string): Promise<void> {
    await this.favorites.delete({ userId: user.id, type, targetId });
  }

  async list(user: AuthUser, query: FavoriteQueryDto): Promise<FavoritePageDto> {
    const where = { userId: user.id, ...(query.type ? { type: query.type } : {}) };
    const [rows, total] = await this.favorites.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return {
      items: await this.toViews(rows, user),
      counts: await this.counts(user.id),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  /** Which of these targetIds the user has saved (for heart buttons on lists). */
  async check(user: AuthUser, type: FavoriteType, ids: string[]): Promise<string[]> {
    if (!ids.length) return [];
    const rows = await this.favorites.find({
      where: { userId: user.id, type, targetId: In(ids) },
      select: { targetId: true },
    });
    return rows.map((r) => r.targetId);
  }

  async counts(userId: number): Promise<FavoriteCountsDto> {
    const rows = await this.favorites
      .createQueryBuilder('f')
      .select('f.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('f.userId = :userId', { userId })
      .groupBy('f.type')
      .getRawMany<{ type: FavoriteType; count: string }>();
    const counts: FavoriteCountsDto = { all: 0, trip: 0, activity: 0, hotel: 0, place: 0 };
    for (const r of rows) {
      counts[r.type] = Number(r.count);
      counts.all += Number(r.count);
    }
    return counts;
  }

  // ──────────────────────────────────────────────────────────

  /** Checks access and builds what we store for display. */
  private async snapshot(user: AuthUser, dto: AddFavoriteDto): Promise<Snapshot> {
    switch (dto.type) {
      case FavoriteType.TRIP: {
        const trip = await this.access.assertCanView(numericId(dto.targetId, 'Trip'), user);
        return { title: trip.name, subtitle: this.tripSubtitle(trip), imageUrl: null };
      }
      case FavoriteType.ACTIVITY: {
        const activity = await this.activities.findOne({
          where: { id: numericId(dto.targetId, 'Activity') },
        });
        if (!activity) throw new NotFoundException('Activity not found');
        const trip = await this.access.assertCanView(activity.tripId, user);
        return {
          title: activity.name,
          subtitle: this.activitySubtitle(activity, trip),
          imageUrl: null,
        };
      }
      case FavoriteType.HOTEL:
        return this.fromGoogle(dto, async () => {
          const h = await this.places.getHotel(dto.targetId);
          return { title: h.name, subtitle: h.address, imageUrl: h.photoUrl };
        });
      case FavoriteType.PLACE:
        return this.fromGoogle(dto, async () => {
          const c = await this.places.getCity(dto.targetId);
          return { title: c.name, subtitle: c.country ?? c.address, imageUrl: null };
        });
    }
  }

  /** Google details; if Google is down/unconfigured, fall back to the title the client sent. */
  private async fromGoogle(dto: AddFavoriteDto, load: () => Promise<Snapshot>): Promise<Snapshot> {
    try {
      const s = await load();
      return {
        title: s.title.slice(0, 200),
        subtitle: s.subtitle?.slice(0, 300) ?? null,
        imageUrl: s.imageUrl,
      };
    } catch (err) {
      const status = err instanceof HttpException ? err.getStatus() : 500;
      if (status === 404) throw new NotFoundException('Place not found');
      if (!dto.title?.trim()) {
        throw new BadRequestException(
          'Google Places is unavailable; send a title to save this place',
        );
      }
      return { title: dto.title.trim(), subtitle: null, imageUrl: null };
    }
  }

  /** Adds live data: trips/activities are re-checked (deleted or now private → available=false). */
  private async toViews(rows: Favorite[], user: AuthUser): Promise<FavoriteViewDto[]> {
    const ids = (type: FavoriteType) =>
      rows
        .filter((r) => r.type === type)
        .map((r) => Number(r.targetId))
        .filter(Number.isFinite);
    const activityIds = ids(FavoriteType.ACTIVITY);
    const activities = activityIds.length
      ? await this.activities.find({ where: { id: In(activityIds) } })
      : [];
    const tripIds = [...new Set([...ids(FavoriteType.TRIP), ...activities.map((a) => a.tripId)])];
    const trips = tripIds.length ? await this.trips.find({ where: { id: In(tripIds) } }) : [];

    const visible = new Set<number>();
    for (const t of trips) if (await this.access.canView(t, user)) visible.add(t.id);
    const covers = await this.covers(trips.filter((t) => visible.has(t.id)));

    return rows.map((f) => {
      const base: FavoriteViewDto = {
        id: f.id,
        type: f.type,
        targetId: f.targetId,
        title: f.title,
        subtitle: f.subtitle,
        imageUrl: f.imageUrl,
        available: true,
        tripId: null,
        mapsUrl: null,
        createdAt: f.createdAt,
      };
      if (f.type === FavoriteType.TRIP) {
        const trip = trips.find((t) => t.id === Number(f.targetId));
        if (!trip || !visible.has(trip.id)) return { ...base, available: false };
        return {
          ...base,
          title: trip.name,
          subtitle: this.tripSubtitle(trip),
          imageUrl: covers.get(trip.id) ?? null,
          tripId: trip.id,
        };
      }
      if (f.type === FavoriteType.ACTIVITY) {
        const activity = activities.find((a) => a.id === Number(f.targetId));
        const trip = activity && trips.find((t) => t.id === activity.tripId);
        if (!activity || !trip || !visible.has(trip.id)) return { ...base, available: false };
        return {
          ...base,
          title: activity.name,
          subtitle: this.activitySubtitle(activity, trip),
          imageUrl: covers.get(trip.id) ?? null,
          tripId: trip.id,
        };
      }
      return { ...base, mapsUrl: mapsUrl(f.targetId) };
    });
  }

  /** Cover url per trip: the chosen cover, else the first gallery photo. */
  private async covers(trips: Trip[]): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    if (!trips.length) return result;
    const items = await this.media.find({
      where: { type: MediaType.TRIP, entityId: In(trips.map((t) => t.id)) },
      order: { position: 'ASC', id: 'ASC' },
    });
    for (const t of trips) {
      const own = items.filter((m) => m.entityId === t.id && m.mimeType.startsWith('image/'));
      const cover = own.find((m) => m.id === t.coverMediaId) ?? own[0];
      if (cover) result.set(t.id, cover.url);
    }
    return result;
  }

  private tripSubtitle(trip: Trip): string {
    return [trip.city, days(trip)].filter(Boolean).join(' · ');
  }

  private activitySubtitle(activity: TripActivity, trip: Trip): string {
    return [
      trip.name,
      `Day ${activity.dayNumber}`,
      activity.startTime.slice(0, 5),
      activity.placeName,
    ]
      .filter(Boolean)
      .join(' · ');
  }
}
