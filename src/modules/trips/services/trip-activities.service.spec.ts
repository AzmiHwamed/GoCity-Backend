import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../../users/entities/user.entity';
import { TripAccessService } from '../access/trip-access.service';
import { TripActivity } from '../entities/trip-activity.entity';
import { Trip } from '../entities/trip.entity';
import { ActivityKind, TripMemberRole, Transportation } from '../trip.enums';
import { TripActivitiesService } from './trip-activities.service';

describe('TripActivitiesService.copyTo', () => {
  let service: TripActivitiesService;
  const me = { id: 1, email: 'me@x.com', role: UserRole.USER };
  const source = Object.assign(new TripActivity(), {
    id: 5,
    tripId: 10,
    kind: ActivityKind.ACTIVITY,
    name: 'Sunset cruise',
    description: null,
    dayNumber: 4,
    startTime: '18:00:00',
    endTime: '20:00:00',
    placeName: 'Pier',
    placeLatitude: 1,
    placeLongitude: 2,
    meetingPointText: null,
    meetingLatitude: null,
    meetingLongitude: null,
    transportation: Transportation.WALK,
    expense: 40,
    createdById: 7,
  });
  const activities = {
    findOne: jest.fn(async () => source),
    create: jest.fn((d: Partial<TripActivity>) => Object.assign(new TripActivity(), d)),
    save: jest.fn(async (a: TripActivity) => ({ ...a, id: 50 })),
  };
  const trips = {
    findOne: jest.fn(async () =>
      Object.assign(new Trip(), { id: 20, startDate: '2027-01-01', endDate: '2027-01-05' }),
    ),
  };
  const access = { assertCanView: jest.fn(), assertRole: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripActivitiesService,
        { provide: getRepositoryToken(TripActivity), useValue: activities },
        { provide: getRepositoryToken(Trip), useValue: trips },
        { provide: TripAccessService, useValue: access },
      ],
    }).compile();
    service = moduleRef.get(TripActivitiesService);
  });

  it('copies everything into my trip, on the same day by default', async () => {
    const copy = await service.copyTo(10, 5, me, { targetTripId: 20, shareCode: 'abc' });
    expect(access.assertCanView).toHaveBeenCalledWith(10, me, 'abc');
    expect(access.assertRole).toHaveBeenCalledWith(20, me, TripMemberRole.EDITOR);
    expect(copy).toMatchObject({
      id: 50,
      tripId: 20,
      dayNumber: 4,
      name: 'Sunset cruise',
      placeName: 'Pier',
      transportation: Transportation.WALK,
      expense: 40,
      createdById: 1,
    });
  });

  it('can put it on another day', async () => {
    await expect(
      service.copyTo(10, 5, me, { targetTripId: 20, dayNumber: 2 }),
    ).resolves.toMatchObject({ dayNumber: 2 });
  });

  it("rejects a day that doesn't exist in the target trip", async () => {
    trips.findOne.mockResolvedValueOnce(
      Object.assign(new Trip(), { id: 20, startDate: '2027-01-01', endDate: '2027-01-02' }),
    );
    await expect(service.copyTo(10, 5, me, { targetTripId: 20 })).rejects.toThrow(
      'dayNumber must be between 1 and 2',
    );
    expect(activities.save).not.toHaveBeenCalled();
  });

  it('needs view access to the source and editor rights on the target', async () => {
    access.assertCanView.mockRejectedValueOnce(new NotFoundException());
    await expect(service.copyTo(10, 5, me, { targetTripId: 20 })).rejects.toBeInstanceOf(
      NotFoundException,
    );

    access.assertRole.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.copyTo(10, 5, me, { targetTripId: 20 })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(activities.save).not.toHaveBeenCalled();
  });
});
