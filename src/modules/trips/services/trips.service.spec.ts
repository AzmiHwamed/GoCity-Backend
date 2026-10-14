import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator } from 'typeorm';
import { Media } from '../../media/entities/media.entity';
import { MediaService } from '../../media/media.service';
import { User, UserRole } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { TripAccessService } from '../access/trip-access.service';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripIdea } from '../entities/trip-idea.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { ActivityKind, TripMemberRole, TripVisibility } from '../trip.enums';
import { TripTip } from '../entities/trip-tip.entity';
import { TripGalleryService } from './trip-gallery.service';
import { TripsService } from './trips.service';
import { PlacesService } from '../../places/places.service';
import { TripExpense } from '../entities/trip-expense.entity';
import { ServiceUnavailableException } from '@nestjs/common';

const me = { id: 1, email: 'me@x.com', role: UserRole.USER };
const other = { id: 9, email: 'o@x.com', role: UserRole.USER };

describe('TripsService', () => {
  let service: TripsService;
  const trip = (extra: Partial<Trip> = {}) =>
    Object.assign(new Trip(), {
      id: 10,
      name: 'Lisbon',
      startDate: '2026-11-01',
      endDate: '2026-11-05',
      travelersCount: 2,
      budgetPerPerson: 300,
      hotelName: 'Avenida',
      hotelLatitude: 38.7,
      hotelLongitude: -9.1,
      inviteCode: 'inv',
      shareCode: null,
      visibility: TripVisibility.PRIVATE,
      ...extra,
    });
  const raw = { getRawMany: jest.fn(async (): Promise<unknown[]> => []) };
  const qb = { select: () => qb, addSelect: () => qb, where: () => qb, groupBy: () => raw };
  const tripsRepo = {
    findOne: jest.fn(),
    exists: jest.fn(async () => false),
    save: jest.fn(async (t: Trip) => t),
  };
  const membersRepo = {
    createQueryBuilder: () => qb,
    find: jest.fn(async () => []),
    findAndCount: jest.fn(),
    count: jest.fn(async () => 3),
  };
  const activitiesRepo = {
    maximum: jest.fn(),
    find: jest.fn(async () => []),
    createQueryBuilder: () => qb,
  };
  const ideasRepo = { maximum: jest.fn() };
  const saved: Record<string, unknown>[] = [];
  const em = {
    create: jest.fn((entity: unknown, d: object) => ({ __entity: entity, ...d })),
    save: jest.fn(async (d: object | object[]) => {
      const list = Array.isArray(d) ? d : [d];
      saved.push(...(list as Record<string, unknown>[]));
      return Array.isArray(d) ? d : { ...d, id: 99 };
    }),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const access = { assertCanView: jest.fn() };
  const tipsRepo = { find: jest.fn(async () => []) };
  const places = { getCity: jest.fn() };
  const gallery = {
    findForTrips: jest.fn(async () => []),
    assertCanAdd: jest.fn(),
    add: jest.fn(),
  };
  const usersService = { findById: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    saved.length = 0;
    tripsRepo.findOne.mockImplementation(async () => trip());
    activitiesRepo.maximum.mockResolvedValue(null);
    ideasRepo.maximum.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getRepositoryToken(Trip), useValue: tripsRepo },
        { provide: getRepositoryToken(TripMember), useValue: membersRepo },
        { provide: getRepositoryToken(TripActivity), useValue: activitiesRepo },
        { provide: getRepositoryToken(TripIdea), useValue: ideasRepo },
        {
          provide: DataSource,
          useValue: { transaction: (cb: (m: typeof em) => unknown) => cb(em) },
        },
        { provide: MediaService, useValue: { removeByEntity: jest.fn() } },
        { provide: getRepositoryToken(TripTip), useValue: tipsRepo },
        { provide: TripGalleryService, useValue: gallery },
        { provide: PlacesService, useValue: places },
        { provide: getRepositoryToken(TripExpense), useValue: { createQueryBuilder: () => qb } },
        { provide: UsersService, useValue: usersService },
        { provide: TripAccessService, useValue: access },
        { provide: ConfigService, useValue: { get: () => 'https://app.example.com/' } },
      ],
    }).compile();
    service = moduleRef.get(TripsService);
  });

  describe('create / update', () => {
    it('makes the creator the owner', async () => {
      await service.create(1, { name: 'Lisbon', startDate: '2026-11-01', endDate: '2026-11-03' });
      expect(saved).toContainEqual(
        expect.objectContaining({ ownerId: 1, travelersCount: 1, inviteCode: expect.any(String) }),
      );
      expect(saved).toContainEqual(
        expect.objectContaining({ tripId: 99, userId: 1, role: TripMemberRole.OWNER }),
      );
    });

    it('rejects end before start and half a hotel position', async () => {
      await expect(
        service.create(1, { name: 'x', startDate: '2026-11-03', endDate: '2026-11-01' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.create(1, {
          name: 'x',
          startDate: '2026-11-01',
          endDate: '2026-11-01',
          hotelLatitude: 1,
        }),
      ).rejects.toThrow('hotelLatitude and hotelLongitude must be given together');
    });

    it("won't shorten a trip below a planned day (activities or open ideas)", async () => {
      activitiesRepo.maximum.mockResolvedValue(5);
      await expect(service.update(10, { endDate: '2026-11-03' })).rejects.toThrow(
        'something is planned on day 5',
      );
      activitiesRepo.maximum.mockResolvedValue(null);
      ideasRepo.maximum.mockResolvedValue(4);
      await expect(service.update(10, { endDate: '2026-11-03' })).rejects.toThrow('day 4');
      expect(tripsRepo.save).not.toHaveBeenCalled();
    });

    it('allows shortening when nothing is planned on the removed days', async () => {
      activitiesRepo.maximum.mockResolvedValue(3);
      await service.update(10, { endDate: '2026-11-03' });
      expect(tripsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ endDate: '2026-11-03' }),
      );
    });

    it('rejects clearing a required field', async () => {
      await expect(service.update(10, { name: null as unknown as string })).rejects.toThrow(
        'name cannot be empty',
      );
    });
  });

  describe('links', () => {
    it('builds the invite link from APP_URL', async () => {
      await expect(service.getInviteLink(10)).resolves.toEqual({
        code: 'inv',
        url: 'https://app.example.com/invite/inv',
        role: TripMemberRole.EDITOR,
      });
    });

    it('creates a share code (not the invite code) when published', async () => {
      const info = await service.setVisibility(10, TripVisibility.LINK);
      expect(info.visibility).toBe(TripVisibility.LINK);
      expect(info.shareCode).toMatch(/^[\w-]{11}$/);
      expect(info.shareCode).not.toBe('inv');
      expect(info.shareUrl).toBe(`https://app.example.com/trips/shared/${info.shareCode}`);
    });

    it('has no working share URL while private, and keeps the code for later', async () => {
      tripsRepo.findOne.mockResolvedValueOnce(
        trip({ shareCode: 'abc', visibility: TripVisibility.LINK }),
      );
      const info = await service.setVisibility(10, TripVisibility.PRIVATE);
      expect(info).toEqual({
        visibility: TripVisibility.PRIVATE,
        shareCode: 'abc',
        shareUrl: null,
      });
    });

    it('only finds shared trips that are link or public', async () => {
      tripsRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.viewShared('abc', me)).rejects.toBeInstanceOf(NotFoundException);
      const where = tripsRepo.findOne.mock.calls.at(-1)[0].where;
      expect(where.shareCode).toBe('abc');
      expect((where.visibility as FindOperator<string[]>).value).toEqual([
        TripVisibility.LINK,
        TripVisibility.PUBLIC,
      ]);
    });

    it('shared view hides codes and private user details', async () => {
      tripsRepo.findOne.mockResolvedValueOnce(
        trip({
          shareCode: 'abc',
          visibility: TripVisibility.LINK,
          owner: Object.assign(new User(), {
            id: 1,
            firstName: 'Ana',
            lastName: 'T',
            email: 'ana@x.com',
            phone: '+1',
          }),
        }),
      );
      const view = await service.viewShared('abc', other);
      const json = JSON.stringify(view);
      expect(view.owner).toEqual(expect.objectContaining({ id: 1, firstName: 'Ana' }));
      expect(json).not.toContain('ana@x.com');
      expect(json).not.toContain('inv');
      expect(json).not.toContain('"abc"');
      expect(view.myRole).toBeNull();
      expect(view.activities).toEqual([]);
    });
  });

  describe('copy', () => {
    const activities = [
      Object.assign(new TripActivity(), {
        id: 5,
        tripId: 10,
        kind: ActivityKind.PLAN,
        name: 'Tram',
        dayNumber: 3,
        startTime: '09:00:00',
        endTime: '10:00:00',
        expense: 12.5,
        createdById: 7,
      }),
    ];

    beforeEach(() => {
      access.assertCanView.mockResolvedValue(
        trip({ visibility: TripVisibility.PUBLIC, shareCode: 'pub', ownerId: 7 }),
      );
      activitiesRepo.find.mockResolvedValue(activities as never);
    });

    it('creates a private trip owned by me with the details and all activities', async () => {
      await service.copy(10, me, {});
      const newTrip = saved.find((s) => s.__entity === Trip)!;
      expect(newTrip).toMatchObject({
        name: 'Lisbon (copy)',
        startDate: '2026-11-01',
        endDate: '2026-11-05',
        travelersCount: 2,
        budgetPerPerson: 300,
        hotelName: 'Avenida',
        ownerId: 1,
        visibility: TripVisibility.PRIVATE,
        shareCode: null,
        copiedFromTripId: 10,
      });
      expect(newTrip.inviteCode).not.toBe('inv');
      expect(saved).toContainEqual(
        expect.objectContaining({ __entity: TripMember, userId: 1, role: TripMemberRole.OWNER }),
      );
      const copied = saved.filter((s) => s.__entity === TripActivity);
      expect(copied).toEqual([
        expect.objectContaining({
          tripId: 99,
          name: 'Tram',
          kind: ActivityKind.PLAN,
          dayNumber: 3,
          expense: 12.5,
          createdById: 1,
        }),
      ]);
      expect(copied[0]).not.toHaveProperty('id');
    });

    it('moves the dates when given a new start date, keeping the length', async () => {
      await service.copy(10, me, { name: 'Mine', startDate: '2027-12-30' });
      expect(saved.find((s) => s.__entity === Trip)).toMatchObject({
        name: 'Mine',
        startDate: '2027-12-30',
        endDate: '2028-01-03',
      });
    });

    it('checks view access with the share code', async () => {
      access.assertCanView.mockRejectedValueOnce(new NotFoundException());
      await expect(service.copy(10, me, { shareCode: 'nope' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(access.assertCanView).toHaveBeenCalledWith(10, me, 'nope');
      expect(saved).toHaveLength(0);
    });
  });

  it('public browse: text matches name or city; cityPlaceId filters by city', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    const findAndCount = jest.fn(async (_opts: { where: any }) => [[], 0]);
    (tripsRepo as unknown as { findAndCount: jest.Mock }).findAndCount = findAndCount;
    const q = (extra: object) => Object.assign({ page: 1, limit: 10, skip: 0 }, extra) as never;

    await service.browsePublic(q({ q: 'lisb' }), me);
    const [byName, byCity] = findAndCount.mock.calls[0][0].where;
    expect(byName.name.value).toBe('%lisb%');
    expect(byCity.city.value).toBe('%lisb%');
    expect(byName.visibility).toBe(TripVisibility.PUBLIC);
    expect(byCity.visibility).toBe(TripVisibility.PUBLIC);

    await service.browsePublic(q({ cityPlaceId: 'ChIJlisbon' }), me);
    expect(findAndCount.mock.calls[1][0].where).toEqual({
      visibility: TripVisibility.PUBLIC,
      cityPlaceId: 'ChIJlisbon',
    });
  });

  describe('city (Google Places)', () => {
    const lisbon = {
      placeId: 'ChIJlisbon',
      name: 'Lisbon',
      country: 'Portugal',
      countryCode: 'PT',
      address: 'Lisbon, Portugal',
      latitude: 38.72,
      longitude: -9.14,
    };

    it('fills city, country and coordinates from cityPlaceId', async () => {
      places.getCity.mockResolvedValueOnce(lisbon);
      await service.create(1, {
        name: 'x',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        cityPlaceId: 'ChIJlisbon',
      });
      expect(saved[0]).toMatchObject({
        city: 'Lisbon',
        cityPlaceId: 'ChIJlisbon',
        country: 'Portugal',
        cityLatitude: 38.72,
        cityLongitude: -9.14,
      });
    });

    it('keeps a typed city name when Google is unavailable', async () => {
      places.getCity.mockRejectedValueOnce(new ServiceUnavailableException());
      await service.create(1, {
        name: 'x',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        cityPlaceId: 'ChIJlisbon',
        city: 'Lisboa',
      });
      expect(saved[0]).toMatchObject({ city: 'Lisboa', cityPlaceId: 'ChIJlisbon' });
    });

    it('fails without a fallback name, and a name alone needs no Google call', async () => {
      places.getCity.mockRejectedValueOnce(new ServiceUnavailableException());
      await expect(
        service.create(1, {
          name: 'x',
          startDate: '2026-11-01',
          endDate: '2026-11-02',
          cityPlaceId: 'ChIJlisbon',
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      await service.create(1, {
        name: 'x',
        startDate: '2026-11-01',
        endDate: '2026-11-02',
        city: 'Porto',
      });
      expect(places.getCity).toHaveBeenCalledTimes(1);
      expect(saved.at(-2)).toMatchObject({ city: 'Porto', cityPlaceId: null });
    });

    it('clears the whole city with cityPlaceId: null', async () => {
      tripsRepo.findOne.mockResolvedValueOnce(
        trip({ city: 'Lisbon', cityPlaceId: 'x', country: 'PT' }),
      );
      await service.update(10, { cityPlaceId: null });
      expect(tripsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          city: null,
          cityPlaceId: null,
          country: null,
          cityLatitude: null,
        }),
      );
    });
  });

  it('totals = activity costs + expenses list; per person by travelers', async () => {
    raw.getRawMany
      .mockResolvedValueOnce([{ tripId: 10, count: '3' }]) // members
      .mockResolvedValueOnce([{ tripId: 10, total: '100.50' }]) // activities
      .mockResolvedValueOnce([{ tripId: 10, total: '300' }]); // expenses list
    const t = await service.findOne(10);
    expect(t.totalExpenses).toBe(400.5);
    expect(t.totalExpensesPerPerson).toBe(200.25); // 2 travelers
  });

  describe('share details', () => {
    it('saves story and actual spend, and replaces the tips in order', async () => {
      await service.updateShareDetails(10, 1, {
        story: '  Great trip  ',
        actualSpentPerPerson: 420,
        tips: ['Buy a transport card', ' Book Belém online '],
      });
      expect(em.update).toHaveBeenCalledWith(
        Trip,
        { id: 10 },
        { story: 'Great trip', actualSpentPerPerson: 420 },
      );
      expect(em.delete).toHaveBeenCalledWith(TripTip, { tripId: 10 });
      expect(saved).toEqual([
        expect.objectContaining({ tripId: 10, text: 'Buy a transport card', position: 0 }),
        expect.objectContaining({ tripId: 10, text: 'Book Belém online', position: 1 }),
      ]);
      expect(gallery.add).not.toHaveBeenCalled();
    });

    it('only changes what was sent; [] clears tips; null clears the story', async () => {
      await service.updateShareDetails(10, 1, { tips: [] });
      expect(em.update).not.toHaveBeenCalled();
      expect(em.delete).toHaveBeenCalledWith(TripTip, { tripId: 10 });
      expect(saved).toHaveLength(0);

      await service.updateShareDetails(10, 1, { story: null });
      expect(em.update).toHaveBeenCalledWith(Trip, { id: 10 }, { story: null });
    });

    it('checks images before saving anything, then adds them to the gallery', async () => {
      const images = [{ originalname: 'a.png' }] as Express.Multer.File[];
      gallery.assertCanAdd.mockRejectedValueOnce(new BadRequestException('too many'));
      await expect(
        service.updateShareDetails(10, 1, { story: 'x' }, images),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(em.update).not.toHaveBeenCalled();

      await service.updateShareDetails(10, 1, { story: 'x' }, images);
      expect(gallery.add).toHaveBeenCalledWith(10, 1, images);
    });

    it('shows the difference between actual and estimated spend', () => {
      expect(
        trip({ budgetPerPerson: 300, actualSpentPerPerson: 370.5 }).spendDifferencePerPerson,
      ).toBe(70.5);
      expect(trip({ actualSpentPerPerson: null }).spendDifferencePerPerson).toBeNull();
    });

    it('public view includes story, tips, cover and gallery but no members or codes', async () => {
      const img = Object.assign(new Media(), {
        id: 3,
        filename: 'a.png',
        entityId: 10,
        position: 0,
      });
      gallery.findForTrips.mockResolvedValueOnce([img] as never);
      tipsRepo.find.mockResolvedValueOnce([{ tripId: 10, text: 'Go early', position: 0 }] as never);
      tripsRepo.findOne.mockResolvedValueOnce(
        trip({
          shareCode: 'abc',
          visibility: TripVisibility.LINK,
          story: 'Lovely',
          actualSpentPerPerson: 350,
        }),
      );
      const view = await service.viewShared('abc', other);
      expect(view).toMatchObject({
        story: 'Lovely',
        actualSpentPerPerson: 350,
        spendDifferencePerPerson: 50,
        tips: ['Go early'],
        coverUrl: '/files/a.png',
      });
      expect(view.gallery?.map((m) => m.id)).toEqual([3]);
      expect(view).not.toHaveProperty('members');
      expect(JSON.stringify(view)).not.toContain('"inv"');
    });

    it('lists show a story excerpt, not the whole story', async () => {
      const long = 'word '.repeat(100).trim();
      membersRepo.findAndCount.mockResolvedValueOnce([[], 0]);
      (tripsRepo as unknown as { findAndCount: jest.Mock }).findAndCount = jest.fn(async () => [
        [trip({ visibility: TripVisibility.PUBLIC, story: long })],
        1,
      ]);
      const page = await service.browsePublic(
        Object.assign(new (class {})(), { page: 1, limit: 10, skip: 0 }) as never,
        me,
      );
      const card = page.items[0];
      expect(card.story).toBeUndefined();
      expect(card.tips).toBeUndefined();
      expect(card.storyExcerpt!.length).toBeLessThanOrEqual(201);
      expect(card.storyExcerpt!.endsWith('…')).toBe(true);
    });
  });

  describe('profiles', () => {
    beforeEach(() => {
      usersService.findById.mockResolvedValue(
        Object.assign(new User(), {
          id: 9,
          firstName: 'Olga',
          lastName: 'K',
          email: 'olga@x.com',
          phone: '+44',
          isActive: true,
          role: UserRole.USER,
        }),
      );
      membersRepo.findAndCount.mockResolvedValue([[], 0]);
    });

    it('shows only public trips of other people, all trips to yourself and admins', async () => {
      await service.userTrips(9, me, { page: 1, limit: 10, skip: 0 });
      expect(membersRepo.findAndCount.mock.calls[0][0].where).toEqual({
        userId: 9,
        trip: { visibility: TripVisibility.PUBLIC },
      });

      await service.userTrips(9, other, { page: 1, limit: 10, skip: 0 });
      expect(membersRepo.findAndCount.mock.calls[1][0].where).toEqual({ userId: 9, trip: {} });

      await service.userTrips(9, { ...me, role: UserRole.ADMIN }, { page: 1, limit: 10, skip: 0 });
      expect(membersRepo.findAndCount.mock.calls[2][0].where).toEqual({ userId: 9, trip: {} });
    });

    it('hides email and phone from other users', async () => {
      const profile = await service.userProfile(9, me);
      expect(profile).toMatchObject({ id: 9, firstName: 'Olga', publicTripCount: 3 });
      expect(profile).not.toHaveProperty('email');
      expect(profile).not.toHaveProperty('phone');

      const own = await service.userProfile(9, other);
      expect(own).toMatchObject({ email: 'olga@x.com', phone: '+44', tripCount: 3 });
    });

    it('404s for unknown or deactivated users', async () => {
      usersService.findById.mockResolvedValueOnce(null);
      await expect(service.userProfile(5, me)).rejects.toBeInstanceOf(NotFoundException);
      usersService.findById.mockResolvedValueOnce({ id: 5, isActive: false });
      await expect(service.userProfile(5, me)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
