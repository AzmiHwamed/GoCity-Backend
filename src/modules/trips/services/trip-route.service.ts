import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { PlacesService } from '../../places/places.service';
import { LegResult, RouteMode, RoutesService } from '../../places/routes.service';
import { TripAccessService } from '../access/trip-access.service';
import { DayRouteDto, DayRouteQueryDto, RouteLegDto, RouteStopDto } from '../dto/route.dto';
import { TripActivity } from '../entities/trip-activity.entity';
import { Trip } from '../entities/trip.entity';
import { Transportation } from '../trip.enums';

const MODES: Record<Transportation, RouteMode> = {
  [Transportation.WALK]: 'WALK',
  [Transportation.PUBLIC_TRANSPORT]: 'TRANSIT',
  [Transportation.DRIVE]: 'DRIVE',
};
const DAY_MS = 24 * 60 * 60 * 1000;
const minutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (time: string) => time.slice(0, 5);
const located = (lat: number | null, lng: number | null) => lat != null && lng != null;

type Stop = RouteStopDto & { activity?: TripActivity };

/**
 * A day of a trip as a route: the activities in start-time order (optionally starting and
 * ending at the hotel), with a real Google route between each pair, using the travel mode of
 * the activity you're going to.
 */
@Injectable()
export class TripRouteService {
  constructor(
    @InjectRepository(TripActivity) private readonly activities: Repository<TripActivity>,
    private readonly access: TripAccessService,
    private readonly routes: RoutesService,
    private readonly places: PlacesService,
  ) {}

  async dayRoute(tripId: number, user: AuthUser, query: DayRouteQueryDto): Promise<DayRouteDto> {
    const trip = await this.access.assertCanView(tripId, user, query.shareCode);
    if (query.day > trip.durationDays) {
      throw new BadRequestException(`day must be between 1 and ${trip.durationDays}`);
    }
    const date = new Date(Date.parse(`${trip.startDate}T00:00:00Z`) + (query.day - 1) * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const all = await this.activities.find({
      where: { tripId, dayNumber: query.day },
      order: { startTime: 'ASC', id: 'ASC' },
    });

    const stops: Stop[] = [];
    const missing: DayRouteDto['missing'] = [];
    for (const a of all) {
      const meeting = located(a.meetingLatitude, a.meetingLongitude);
      if (!meeting && !located(a.placeLatitude, a.placeLongitude)) {
        missing.push({ id: a.id, name: a.name, startTime: hhmm(a.startTime) });
        continue;
      }
      stops.push({
        index: 0,
        kind: 'activity',
        activityId: a.id,
        name: a.name,
        place: meeting ? a.meetingPointText || 'Meeting point' : a.placeName,
        startTime: hhmm(a.startTime),
        endTime: hhmm(a.endTime),
        latitude: Number(meeting ? a.meetingLatitude : a.placeLatitude),
        longitude: Number(meeting ? a.meetingLongitude : a.placeLongitude),
        activity: a,
      });
    }

    const warnings: string[] = [];
    const hotelLocated = located(trip.hotelLatitude, trip.hotelLongitude);
    const includeHotel = !!query.includeHotel && hotelLocated && stops.length > 0;
    if (query.includeHotel && !hotelLocated) {
      warnings.push('The hotel has no location yet, so the day does not start or end there.');
    }
    if (includeHotel) {
      const hotel = (): Stop => ({
        index: 0,
        kind: 'hotel',
        activityId: null,
        name: trip.hotelName || 'Hotel',
        place: trip.hotelAddress,
        startTime: null,
        endTime: null,
        latitude: Number(trip.hotelLatitude),
        longitude: Number(trip.hotelLongitude),
      });
      stops.unshift(hotel());
      stops.push(hotel());
    }
    stops.forEach((s, i) => (s.index = i));
    if (missing.length) {
      warnings.push(
        `${missing.length} ${missing.length === 1 ? 'activity has' : 'activities have'} no location and ${missing.length === 1 ? 'is' : 'are'} not on the route.`,
      );
    }

    const offset = await this.utcOffset(trip);
    let routingError: string | null = null;
    const legs = await Promise.all(
      stops.slice(1).map(async (to, i): Promise<RouteLegDto> => {
        const from = stops[i];
        // The mode of the activity you're going to; back to the hotel: how you got to the last one.
        const mode = (to.activity ?? from.activity)?.transportation ?? Transportation.WALK;
        const gapMinutes =
          from.endTime && to.startTime ? minutes(to.startTime) - minutes(from.endTime) : null;
        const base = { from: from.index, to: to.index, mode, gapMinutes };
        let leg: LegResult | null;
        try {
          leg = await this.routes.computeLeg({
            from: { lat: from.latitude, lng: from.longitude },
            to: { lat: to.latitude, lng: to.longitude },
            mode: MODES[mode],
            arrivalTime: to.startTime ? this.instant(date, to.startTime, offset) : undefined,
          });
        } catch (err) {
          if (err instanceof HttpException && err.getStatus() === 503) routingError = err.message;
          return {
            ...base,
            status: 'failed',
            distanceMeters: null,
            durationSeconds: null,
            polyline: null,
            transit: null,
            late: false,
          };
        }
        if (!leg) {
          return {
            ...base,
            status: 'no_route',
            distanceMeters: null,
            durationSeconds: null,
            polyline: null,
            transit: null,
            late: false,
          };
        }
        const late = gapMinutes != null && leg.durationSeconds > Math.max(gapMinutes, 0) * 60;
        return {
          ...base,
          status: 'ok',
          distanceMeters: leg.distanceMeters,
          durationSeconds: leg.durationSeconds,
          polyline: leg.polyline,
          transit: leg.transitSummary,
          late,
        };
      }),
    );

    for (const leg of legs) {
      const from = stops[leg.from];
      const to = stops[leg.to];
      if (leg.late && leg.durationSeconds != null && leg.gapMinutes != null) {
        const travel = Math.round(leg.durationSeconds / 60);
        warnings.push(
          leg.gapMinutes < 0
            ? `"${to.name}" starts before "${from.name}" ends.`
            : `Getting from "${from.name}" to "${to.name}" takes about ${travel} min, but there are only ${leg.gapMinutes} min between them.`,
        );
      } else if (leg.status === 'no_route') {
        warnings.push(
          `No ${leg.mode === Transportation.PUBLIC_TRANSPORT ? 'public transport ' : ''}route found from "${from.name}" to "${to.name}".`,
        );
      }
    }
    if (routingError) warnings.unshift(routingError);
    else if (legs.some((l) => l.status === 'failed')) {
      warnings.unshift(
        'Some routes could not be loaded right now; they are shown as straight lines.',
      );
    }

    const ok = legs.filter((l) => l.status === 'ok');
    return {
      day: query.day,
      date,
      includeHotel,
      stops: stops.map(
        ({ index, kind, activityId, name, place, startTime, endTime, latitude, longitude }) => ({
          index,
          kind,
          activityId,
          name,
          place,
          startTime,
          endTime,
          latitude,
          longitude,
        }),
      ),
      legs,
      missing,
      totalDistanceMeters: ok.reduce((sum, l) => sum + (l.distanceMeters ?? 0), 0),
      totalDurationSeconds: ok.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0),
      routingAvailable: !routingError,
      warnings,
    };
  }

  /** The city's UTC offset in minutes (0 when unknown), for transit times. */
  private async utcOffset(trip: Trip): Promise<number> {
    if (!trip.cityPlaceId) return 0;
    try {
      return (await this.places.getUtcOffsetMinutes(trip.cityPlaceId)) ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * When to arrive, for transit. Google only knows timetables around now, so a trip date in the
   * past or far ahead is moved to the next same weekday.
   */
  private instant(date: string, time: string, offsetMinutes: number): Date {
    const now = Date.now();
    let day = Date.parse(`${date}T00:00:00Z`);
    if (day < now - DAY_MS || day > now + 28 * DAY_MS) {
      const weekday = new Date(day).getUTCDay();
      day = Date.parse(new Date(now + DAY_MS).toISOString().slice(0, 10) + 'T00:00:00Z');
      while (new Date(day).getUTCDay() !== weekday) day += DAY_MS;
    }
    return new Date(day + (minutes(time) - offsetMinutes) * 60 * 1000);
  }
}
