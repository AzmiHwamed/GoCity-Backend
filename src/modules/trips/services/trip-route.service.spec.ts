import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PlacesService } from '../../places/places.service';
import { LegRequest, RoutesService } from '../../places/routes.service';
import { UserRole } from '../../users/entities/user.entity';
import { TripAccessService } from '../access/trip-access.service';
import { TripActivity } from '../entities/trip-activity.entity';
import { Trip } from '../entities/trip.entity';
import { Transportation } from '../trip.enums';
import { TripRouteService } from './trip-route.service';

const me = { id: 1, email: 'me@x.com', role: UserRole.USER };
const trip = (extra: Partial<Trip> = {}) =>
  Object.assign(new Trip(), {
    id: 10,
    name: 'Lisbon',
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    cityPlaceId: 'ChIJlisbon',
    hotelName: 'Baixa House',
    hotelAddress: 'Rua 1',
    hotelLatitude: 38.71,
    hotelLongitude: -9.14,
    ...extra,
  });
const act = (id: number, extra: Partial<TripActivity>) =>
  Object.assign(new TripActivity(), {
    id,
    tripId: 10,
    name: `A${id}`,
    dayNumber: 1,
    startTime: '10:00:00',
    endTime: '11:00:00',
    placeName: `Place ${id}`,
    placeLatitude: null,
    placeLongitude: null,
    meetingPointText: null,
    meetingLatitude: null,
    meetingLongitude: null,
    transportation: Transportation.WALK,
    ...extra,
  });

describe('TripRouteService', () => {
  let service: TripRouteService;
  const activities = { find: jest.fn(async (): Promise<TripActivity[]> => []) };
  const access = { assertCanView: jest.fn(async () => trip()) };
  const routes = {
    computeLeg: jest.fn(async (req: LegRequest) => ({
      distanceMeters: 1000,
      durationSeconds: 15 * 60,
      polyline: `${req.mode}-line`,
      transitSummary: req.mode === 'TRANSIT' ? 'Tram 15E (6 stops)' : null,
    })),
  };
  const places = { getUtcOffsetMinutes: jest.fn(async () => 0) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripRouteService,
        { provide: getRepositoryToken(TripActivity), useValue: activities },
        { provide: TripAccessService, useValue: access },
        { provide: RoutesService, useValue: routes },
        { provide: PlacesService, useValue: places },
      ],
    }).compile();
    service = moduleRef.get(TripRouteService);
  });

  const day = [
    act(1, { startTime: '09:00:00', endTime: '10:00:00', placeLatitude: 1, placeLongitude: 1 }),
    act(2, {
      startTime: '10:30:00',
      endTime: '12:00:00',
      placeLatitude: 2,
      placeLongitude: 2,
      meetingLatitude: 2.5,
      meetingLongitude: 2.5,
      meetingPointText: 'Tram stop',
      transportation: Transportation.PUBLIC_TRANSPORT,
    }),
    act(3, { startTime: '13:00:00', endTime: '14:00:00' }), // no location
    act(4, {
      startTime: '12:05:00',
      endTime: '15:00:00',
      placeLatitude: 4,
      placeLongitude: 4,
      transportation: Transportation.DRIVE,
    }),
  ].sort((a, b) => a.startTime.localeCompare(b.startTime));

  it('routes between the day’s activities, using the mode of the activity you go to', async () => {
    activities.find.mockResolvedValueOnce(day);
    const r = await service.dayRoute(10, me, { day: 1 });
    expect(access.assertCanView).toHaveBeenCalledWith(10, me, undefined);
    expect(r.date).toBe('2026-12-01');
    expect(r.stops.map((s) => [s.index, s.activityId, s.latitude])).toEqual([
      [0, 1, 1],
      [1, 2, 2.5], // meeting point wins
      [2, 4, 4],
    ]);
    expect(r.stops[1].place).toBe('Tram stop');
    expect(r.missing).toEqual([{ id: 3, name: 'A3', startTime: '13:00' }]);
    expect(routes.computeLeg.mock.calls.map(([req]) => req.mode)).toEqual(['TRANSIT', 'DRIVE']);
    expect(r.legs[0]).toMatchObject({
      from: 0,
      to: 1,
      mode: 'public_transport',
      status: 'ok',
      transit: 'Tram 15E (6 stops)',
      gapMinutes: 30,
      late: false,
    });
    expect(r.legs[1]).toMatchObject({ from: 1, to: 2, mode: 'drive', gapMinutes: 5, late: true });
    expect(r.totalDistanceMeters).toBe(2000);
    expect(r.totalDurationSeconds).toBe(1800);
    expect(r.includeHotel).toBe(false);
    expect(r.routingAvailable).toBe(true);
    expect(r.warnings).toEqual([
      '1 activity has no location and is not on the route.',
      'Getting from "A2" to "A4" takes about 15 min, but there are only 5 min between them.',
    ]);
  });

  it('asks transit to arrive at the next activity’s start, in the city’s time zone', async () => {
    places.getUtcOffsetMinutes.mockResolvedValueOnce(60);
    activities.find.mockResolvedValueOnce(day);
    jest.useFakeTimers({
      now: new Date('2026-11-20T08:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    try {
      await service.dayRoute(10, me, { day: 1 });
    } finally {
      jest.useRealTimers();
    }
    // 10:30 in Lisbon (UTC+1) on 2026-12-01 = 09:30 UTC
    expect(routes.computeLeg.mock.calls[0][0].arrivalTime?.toISOString()).toBe(
      '2026-12-01T09:30:00.000Z',
    );
  });

  it('moves past dates to the next same weekday (Google only knows current timetables)', async () => {
    access.assertCanView.mockResolvedValueOnce(
      trip({ startDate: '2025-01-07', endDate: '2025-01-08' }),
    ); // a Tuesday
    activities.find.mockResolvedValueOnce(day);
    jest.useFakeTimers({
      now: new Date('2026-10-15T08:00:00Z'),
      doNotFake: ['nextTick', 'setImmediate'],
    }); // Thursday
    try {
      await service.dayRoute(10, me, { day: 1 });
    } finally {
      jest.useRealTimers();
    }
    expect(routes.computeLeg.mock.calls[0][0].arrivalTime?.toISOString()).toBe(
      '2026-10-20T10:30:00.000Z',
    );
  });

  it('can start and end the day at the hotel', async () => {
    activities.find.mockResolvedValueOnce(day);
    const r = await service.dayRoute(10, me, { day: 1, includeHotel: true });
    expect(r.stops.map((s) => s.kind)).toEqual([
      'hotel',
      'activity',
      'activity',
      'activity',
      'hotel',
    ]);
    expect(r.legs).toHaveLength(4);
    expect(r.legs[0]).toMatchObject({ mode: 'walk', gapMinutes: null, late: false }); // to the first activity
    expect(r.legs[3]).toMatchObject({ mode: 'drive' }); // back the way you came to the last one
  });

  it('skips the hotel when it has no location, and says so', async () => {
    access.assertCanView.mockResolvedValueOnce(trip({ hotelLatitude: null, hotelLongitude: null }));
    activities.find.mockResolvedValueOnce(day);
    const r = await service.dayRoute(10, me, { day: 1, includeHotel: true });
    expect(r.includeHotel).toBe(false);
    expect(r.warnings[0]).toContain('The hotel has no location');
  });

  it('keeps the stops when Google Routes is not enabled, with a clear message', async () => {
    routes.computeLeg.mockRejectedValue(
      new ServiceUnavailableException('The Google Routes API is not enabled for this API key.'),
    );
    activities.find.mockResolvedValueOnce(day);
    const r = await service.dayRoute(10, me, { day: 1 });
    routes.computeLeg.mockReset();
    expect(r.routingAvailable).toBe(false);
    expect(r.stops).toHaveLength(3);
    expect(r.legs.every((l) => l.status === 'failed' && l.polyline === null)).toBe(true);
    expect(r.warnings[0]).toBe('The Google Routes API is not enabled for this API key.');
  });

  it('reports legs with no route', async () => {
    routes.computeLeg.mockResolvedValueOnce(null as never);
    activities.find.mockResolvedValueOnce(day.slice(0, 2));
    const r = await service.dayRoute(10, me, { day: 1 });
    expect(r.legs[0].status).toBe('no_route');
    expect(r.warnings).toContain('No public transport route found from "A1" to "A2".');
  });

  it('rejects a day outside the trip', async () => {
    await expect(service.dayRoute(10, me, { day: 9 })).rejects.toBeInstanceOf(BadRequestException);
  });
});
