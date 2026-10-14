import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { PlacesService } from '../../places/places.service';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripExpense } from '../entities/trip-expense.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { ExpenseCategory } from '../trip.enums';
import { TripExpensesService } from './trip-expenses.service';

describe('TripExpensesService', () => {
  let service: TripExpensesService;
  let expenseRows: TripExpense[];
  const trip = (extra: Partial<Trip> = {}) =>
    Object.assign(new Trip(), {
      id: 10,
      startDate: '2026-11-01',
      endDate: '2026-11-04', // 4 days → 3 nights
      travelersCount: 2,
      budgetPerPerson: 500,
      city: 'Lisbon',
      cityPlaceId: 'ChIJlisbon',
      ...extra,
    });
  const trips = { findOne: jest.fn() };
  const expenses = {
    find: jest.fn(async () => expenseRows),
    findOne: jest.fn(
      async ({ where }: { where: { id: number } }) =>
        expenseRows.find((e) => e.id === where.id) ?? null,
    ),
    create: jest.fn((d: Partial<TripExpense>) => Object.assign(new TripExpense(), d)),
    save: jest.fn(async (e: TripExpense) => {
      e.id ??= 77;
      expenseRows.push(e);
      return e;
    }),
    delete: jest.fn(),
  };
  const activities = { find: jest.fn(async () => [{ expense: 40 }, { expense: 10.5 }]) };
  const members = { exists: jest.fn(async () => true) };
  const places = {
    findHotels: jest.fn(async () => ({ hotels: [], nextPageToken: null })),
    getHotel: jest.fn(async () => ({
      placeId: 'ChIJhotel',
      name: 'Hotel Avenida',
      address: 'Av. da Liberdade 1',
      latitude: 38.7,
      longitude: -9.1,
    })),
  };
  const em = {
    update: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((_e: unknown, d: object) => d),
    save: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    expenseRows = [];
    trips.findOne.mockResolvedValue(trip());
    em.findOne.mockResolvedValue(null);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripExpensesService,
        { provide: getRepositoryToken(TripExpense), useValue: expenses },
        { provide: getRepositoryToken(TripActivity), useValue: activities },
        { provide: getRepositoryToken(TripMember), useValue: members },
        { provide: getRepositoryToken(Trip), useValue: trips },
        { provide: PlacesService, useValue: places },
        {
          provide: DataSource,
          useValue: { transaction: (cb: (m: typeof em) => unknown) => cb(em) },
        },
      ],
    }).compile();
    service = moduleRef.get(TripExpensesService);
  });

  it('adds an expense (default category other) and checks who paid is a member', async () => {
    const e = await service.create(10, 1, { title: 'Taxi', amount: 35.5, paidById: 2 });
    expect(e).toMatchObject({
      tripId: 10,
      title: 'Taxi',
      category: ExpenseCategory.OTHER,
      createdById: 1,
      isHotelStay: false,
    });
    members.exists.mockResolvedValueOnce(false);
    await expect(service.create(10, 1, { title: 'x', amount: 1, paidById: 99 })).rejects.toThrow(
      'paidById must be a member',
    );
  });

  it('summary: activities + expenses, per category, per payer, per person, vs budget', async () => {
    expenseRows = [
      Object.assign(new TripExpense(), {
        amount: 300,
        category: ExpenseCategory.HOTEL,
        currency: 'EUR',
        paidById: 1,
        paidBy: { firstName: 'Ana', lastName: 'T' },
      }),
      Object.assign(new TripExpense(), {
        amount: 35.5,
        category: ExpenseCategory.TRANSPORT,
        currency: 'EUR',
        paidById: 2,
        paidBy: { firstName: 'Ben', lastName: 'T' },
      }),
      Object.assign(new TripExpense(), {
        amount: 20,
        category: ExpenseCategory.ACTIVITY,
        currency: null,
        paidById: null,
      }),
    ];
    const s = await service.summary(10);
    expect(s).toMatchObject({
      activitiesTotal: 50.5,
      expensesTotal: 355.5,
      total: 406,
      perPerson: 203,
      travelersCount: 2,
      budgetTotal: 1000,
      remainingBudget: 594,
      currencies: ['EUR'],
    });
    const cat = Object.fromEntries(s.byCategory.map((c) => [c.category, c.total]));
    expect(cat).toEqual({
      hotel: 300,
      activity: 70.5,
      transport: 35.5,
      food: 0,
      shopping: 0,
      other: 0,
    });
    expect(s.byPayer).toEqual([
      { userId: 1, name: 'Ana T', total: 300 },
      { userId: 2, name: 'Ben T', total: 35.5 },
      { userId: null, name: 'Not assigned', total: 20 },
    ]);
  });

  it('rejects clearing required fields on update', async () => {
    expenseRows = [Object.assign(new TripExpense(), { id: 5, tripId: 10, title: 'x', amount: 1 })];
    await expect(
      service.update(10, 5, { amount: null as unknown as number }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('hotel', () => {
    it("suggests hotels around the trip's city", async () => {
      await service.hotelSuggestions(10, { minRating: 4 });
      expect(places.findHotels).toHaveBeenCalledWith({ minRating: 4, placeId: 'ChIJlisbon' });

      trips.findOne.mockResolvedValueOnce(trip({ cityPlaceId: null }));
      await service.hotelSuggestions(10, {});
      expect(places.findHotels).toHaveBeenLastCalledWith({ city: 'Lisbon' });

      trips.findOne.mockResolvedValueOnce(trip({ cityPlaceId: null, city: null }));
      await expect(service.hotelSuggestions(10, {})).rejects.toThrow("Set the trip's city first");
    });

    it('sets the hotel and creates one hotel expense (nights default to trip length)', async () => {
      await service.setHotel(10, 1, { placeId: 'ChIJhotel', pricePerNight: 95, currency: 'EUR' });
      expect(em.update).toHaveBeenCalledWith(
        Trip,
        { id: 10 },
        expect.objectContaining({
          hotelName: 'Hotel Avenida',
          hotelPlaceId: 'ChIJhotel',
          hotelAddress: 'Av. da Liberdade 1',
          hotelLatitude: 38.7,
        }),
      );
      expect(em.save).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 285, // 3 nights × 95
          category: ExpenseCategory.HOTEL,
          isHotelStay: true,
          currency: 'EUR',
          title: 'Hotel: Hotel Avenida',
        }),
      );
    });

    it('updates the existing hotel expense instead of adding a second one', async () => {
      em.findOne.mockResolvedValueOnce({ id: 9, currency: 'EUR' });
      await service.setHotel(10, 1, { placeId: 'ChIJhotel', totalPrice: 250 });
      expect(em.save).not.toHaveBeenCalled();
      expect(em.update).toHaveBeenCalledWith(
        TripExpense,
        { id: 9 },
        expect.objectContaining({ amount: 250 }),
      );
    });

    it('without a price only the hotel is set', async () => {
      await service.setHotel(10, 1, { placeId: 'ChIJhotel' });
      expect(em.update).toHaveBeenCalledTimes(1);
      expect(em.save).not.toHaveBeenCalled();
    });

    it('removing the hotel removes its expense', async () => {
      await service.clearHotel(10);
      expect(em.update).toHaveBeenCalledWith(
        Trip,
        { id: 10 },
        expect.objectContaining({ hotelName: null, hotelPlaceId: null }),
      );
      expect(em.delete).toHaveBeenCalledWith(TripExpense, { tripId: 10, isHotelStay: true });
    });
  });
});
