import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Media, MediaType } from '../media/entities/media.entity';
import { PlacesService } from '../places/places.service';
import { TripAccessService } from '../trips/access/trip-access.service';
import { TripActivity } from '../trips/entities/trip-activity.entity';
import { Trip } from '../trips/entities/trip.entity';
import { UserRole } from '../users/entities/user.entity';
import { Favorite, FavoriteType } from './entities/favorite.entity';
import { FavoritesService } from './favorites.service';

const me = { id: 1, email: 'me@x.com', role: UserRole.USER };

const trip = (extra: Partial<Trip> = {}) =>
  Object.assign(new Trip(), {
    id: 10,
    name: 'Lisbon weekend',
    city: 'Lisbon',
    startDate: '2026-11-01',
    endDate: '2026-11-03',
    coverMediaId: null,
    ...extra,
  });
const activity = (extra: Partial<TripActivity> = {}) =>
  Object.assign(new TripActivity(), {
    id: 5,
    tripId: 10,
    name: 'Tram 28',
    dayNumber: 2,
    startTime: '09:30:00',
    placeName: 'Martim Moniz',
    ...extra,
  });
const fav = (extra: Partial<Favorite> = {}) =>
  Object.assign(new Favorite(), {
    id: 1,
    userId: 1,
    type: FavoriteType.TRIP,
    targetId: '10',
    title: 'Old title',
    subtitle: null,
    imageUrl: null,
    createdAt: new Date('2026-10-14'),
    ...extra,
  });

describe('FavoritesService', () => {
  let service: FavoritesService;
  const raw = { getRawMany: jest.fn(async (): Promise<unknown[]> => []) };
  const qb = { select: () => qb, addSelect: () => qb, where: () => qb, groupBy: () => raw };
  const favoritesRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    create: jest.fn((d: Partial<Favorite>) => fav({ ...d, id: 7 })),
    save: jest.fn(async (f: Favorite) => f),
    delete: jest.fn(),
    createQueryBuilder: () => qb,
  };
  const tripsRepo = { find: jest.fn(async (): Promise<Trip[]> => []) };
  const activitiesRepo = {
    findOne: jest.fn(),
    find: jest.fn(async (): Promise<TripActivity[]> => []),
  };
  const mediaRepo = { find: jest.fn(async (): Promise<Media[]> => []) };
  const access = {
    assertCanView: jest.fn(),
    canView: jest.fn<Promise<boolean>, [Trip]>(async () => true),
  };
  const places = { getHotel: jest.fn(), getCity: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    favoritesRepo.findOne.mockResolvedValue(null);
    access.canView.mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        FavoritesService,
        { provide: getRepositoryToken(Favorite), useValue: favoritesRepo },
        { provide: getRepositoryToken(Trip), useValue: tripsRepo },
        { provide: getRepositoryToken(TripActivity), useValue: activitiesRepo },
        { provide: getRepositoryToken(Media), useValue: mediaRepo },
        { provide: TripAccessService, useValue: access },
        { provide: PlacesService, useValue: places },
      ],
    }).compile();
    service = moduleRef.get(FavoritesService);
  });

  describe('add', () => {
    it('saves a trip the user can see, with a snapshot and the cover', async () => {
      access.assertCanView.mockResolvedValue(trip());
      tripsRepo.find.mockResolvedValue([trip()]);
      mediaRepo.find.mockResolvedValue([
        Object.assign(new Media(), {
          id: 3,
          type: MediaType.TRIP,
          entityId: 10,
          mimeType: 'image/jpeg',
          filename: 'a.jpg',
        }),
      ]);
      const view = await service.add(me, { type: FavoriteType.TRIP, targetId: '10' });
      expect(access.assertCanView).toHaveBeenCalledWith(10, me);
      expect(favoritesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          type: FavoriteType.TRIP,
          targetId: '10',
          title: 'Lisbon weekend',
          subtitle: 'Lisbon · 3 days',
        }),
      );
      expect(view).toEqual(
        expect.objectContaining({ available: true, tripId: 10, imageUrl: '/files/a.jpg' }),
      );
    });

    it("refuses trips the user can't see", async () => {
      access.assertCanView.mockRejectedValue(new ForbiddenException());
      await expect(
        service.add(me, { type: FavoriteType.TRIP, targetId: '10' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(favoritesRepo.save).not.toHaveBeenCalled();
    });

    it('rejects non-numeric trip/activity ids as not found', async () => {
      await expect(
        service.add(me, { type: FavoriteType.ACTIVITY, targetId: 'abc' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is idempotent: adding twice returns the existing favorite', async () => {
      favoritesRepo.findOne.mockResolvedValue(fav());
      tripsRepo.find.mockResolvedValue([trip()]);
      await service.add(me, { type: FavoriteType.TRIP, targetId: '10' });
      expect(favoritesRepo.save).not.toHaveBeenCalled();
      expect(access.assertCanView).not.toHaveBeenCalled();
    });

    it('saves an activity after checking its trip', async () => {
      activitiesRepo.findOne.mockResolvedValue(activity());
      access.assertCanView.mockResolvedValue(trip());
      await service.add(me, { type: FavoriteType.ACTIVITY, targetId: '5' });
      expect(access.assertCanView).toHaveBeenCalledWith(10, me);
      expect(favoritesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Tram 28',
          subtitle: 'Lisbon weekend · Day 2 · 09:30 · Martim Moniz',
        }),
      );
    });

    it('saves a hotel from Google Places', async () => {
      places.getHotel.mockResolvedValue({
        name: 'Avenida Palace',
        address: 'Rua 1, Lisbon',
        photoUrl: '/places/photo?name=x',
      });
      const view = await service.add(me, { type: FavoriteType.HOTEL, targetId: 'ChIJabc' });
      expect(view).toEqual(
        expect.objectContaining({
          title: 'Avenida Palace',
          subtitle: 'Rua 1, Lisbon',
          mapsUrl: expect.stringContaining('ChIJabc'),
        }),
      );
    });

    it("falls back to the client's title when Google is unavailable", async () => {
      places.getCity.mockRejectedValue(new ServiceUnavailableException());
      await service.add(me, { type: FavoriteType.PLACE, targetId: 'ChIJx', title: ' Porto ' });
      expect(favoritesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Porto', subtitle: null }),
      );
      await expect(
        service.add(me, { type: FavoriteType.PLACE, targetId: 'ChIJx' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does not save unknown places', async () => {
      places.getCity.mockRejectedValue(new NotFoundException());
      await expect(
        service.add(me, { type: FavoriteType.PLACE, targetId: 'nope', title: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns counts per type and marks deleted or private items unavailable', async () => {
      raw.getRawMany.mockResolvedValueOnce([
        { type: 'trip', count: '2' },
        { type: 'activity', count: '1' },
        { type: 'hotel', count: '1' },
      ]);
      favoritesRepo.findAndCount.mockResolvedValue([
        [
          fav({ id: 1, targetId: '10' }),
          fav({ id: 2, targetId: '11', title: 'Gone trip' }),
          fav({ id: 3, type: FavoriteType.ACTIVITY, targetId: '5' }),
          fav({ id: 4, type: FavoriteType.HOTEL, targetId: 'ChIJh', title: 'Hotel' }),
        ],
        4,
      ]);
      activitiesRepo.find.mockResolvedValue([activity({ tripId: 12 })]);
      tripsRepo.find.mockResolvedValue([trip(), trip({ id: 12, name: 'Now private' })]);
      access.canView.mockImplementation(async (t: Trip) => t.id !== 12);

      const page = await service.list(me, { page: 1, limit: 50 });
      expect(page.counts).toEqual({ all: 4, trip: 2, activity: 1, hotel: 1, place: 0 });
      expect(page.total).toBe(4);
      const [live, deleted, hidden, hotel] = page.items;
      expect(live).toEqual(
        expect.objectContaining({ available: true, title: 'Lisbon weekend', tripId: 10 }),
      );
      expect(deleted).toEqual(expect.objectContaining({ available: false, title: 'Gone trip' }));
      expect(hidden).toEqual(expect.objectContaining({ available: false, tripId: null }));
      expect(hotel).toEqual(
        expect.objectContaining({ available: true, mapsUrl: expect.stringContaining('ChIJh') }),
      );
    });

    it('filters by type', async () => {
      favoritesRepo.findAndCount.mockResolvedValue([[], 0]);
      await service.list(me, { type: FavoriteType.HOTEL, page: 2, limit: 10 });
      expect(favoritesRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, type: FavoriteType.HOTEL },
          skip: 10,
          take: 10,
        }),
      );
    });
  });

  it('check returns the saved ids only', async () => {
    favoritesRepo.find.mockResolvedValue([{ targetId: '3' }]);
    expect(await service.check(me, FavoriteType.TRIP, ['3', '4'])).toEqual(['3']);
    expect(await service.check(me, FavoriteType.TRIP, [])).toEqual([]);
  });

  it('remove only touches my own favorite', async () => {
    await service.remove(me, FavoriteType.HOTEL, 'ChIJh');
    expect(favoritesRepo.delete).toHaveBeenCalledWith({
      userId: 1,
      type: FavoriteType.HOTEL,
      targetId: 'ChIJh',
    });
  });
});
