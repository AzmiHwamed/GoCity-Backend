import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TripAccessService } from '../access/trip-access.service';
import { TripActivity } from '../entities/trip-activity.entity';
import { Trip } from '../entities/trip.entity';
import { hasLocation } from './activity-validation';
import { TripActivitiesService } from './trip-activities.service';

/** New activities need coordinates so they can be shown on the map and routed. */
describe('Activity locations', () => {
  let service: TripActivitiesService;
  const existing = { current: new TripActivity() };
  const activities = {
    findOne: jest.fn(async () => existing.current),
    create: jest.fn((d: Partial<TripActivity>) => Object.assign(new TripActivity(), d)),
    save: jest.fn(async (a: TripActivity) => a),
  };
  const trips = {
    findOne: jest.fn(async () =>
      Object.assign(new Trip(), { id: 10, startDate: '2026-12-01', endDate: '2026-12-03' }),
    ),
  };
  const base = { name: 'Lunch', dayNumber: 1, startTime: '12:00', endTime: '13:00' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripActivitiesService,
        { provide: getRepositoryToken(TripActivity), useValue: activities },
        { provide: getRepositoryToken(Trip), useValue: trips },
        { provide: TripAccessService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(TripActivitiesService);
  });

  it('hasLocation: a place or a meeting point with both coordinates', () => {
    expect(
      hasLocation({
        placeLatitude: 1,
        placeLongitude: 2,
        meetingLatitude: null,
        meetingLongitude: null,
      }),
    ).toBe(true);
    expect(
      hasLocation({
        placeLatitude: null,
        placeLongitude: null,
        meetingLatitude: 0,
        meetingLongitude: 0,
      }),
    ).toBe(true);
    expect(
      hasLocation({
        placeLatitude: 1,
        placeLongitude: null,
        meetingLatitude: null,
        meetingLongitude: null,
      }),
    ).toBe(false);
  });

  it('refuses a new activity without coordinates', async () => {
    await expect(service.create(10, 1, { ...base, placeName: 'Somewhere' })).rejects.toThrow(
      'Pick the place from the search',
    );
    expect(activities.save).not.toHaveBeenCalled();
  });

  it('accepts a picked place or a meeting point with coordinates', async () => {
    await service.create(10, 1, {
      ...base,
      placeName: 'Time Out Market',
      placeId: 'ChIJx',
      placeLatitude: 38.7,
      placeLongitude: -9.1,
    });
    await service.create(10, 1, {
      ...base,
      meetingPointText: 'Hotel lobby',
      meetingLatitude: 38.7,
      meetingLongitude: -9.1,
    });
    expect(activities.save).toHaveBeenCalledTimes(2);
  });

  it('older activities without coordinates can still be edited', async () => {
    existing.current = Object.assign(new TripActivity(), {
      ...base,
      kind: 'activity',
      expense: 0,
      startTime: '12:00:00',
      endTime: '13:00:00',
    });
    await service.update(10, 5, { name: 'Late lunch' });
    expect(activities.save).toHaveBeenCalled();
  });

  it("but an activity can't lose its location", async () => {
    existing.current = Object.assign(new TripActivity(), {
      ...base,
      kind: 'activity',
      expense: 0,
      startTime: '12:00:00',
      endTime: '13:00:00',
      placeLatitude: 1,
      placeLongitude: 2,
    });
    await expect(
      service.update(10, 5, { placeLatitude: null, placeLongitude: null }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
