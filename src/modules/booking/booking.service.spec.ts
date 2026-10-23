import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserRole } from '../users/entities/user.entity';
import { BookingService } from './booking.service';
import { FlightPricesQueryDto } from './dto';

const memoryCache = () => {
  const m = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => m.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void m.set(k, v)),
  };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const paris = {
  code: 'PAR',
  type: 'city',
  name: 'Paris',
  cityCode: 'PAR',
  cityName: 'Paris',
  countryCode: 'FR',
  countryName: 'France',
  airportName: 'Charles de Gaulle Airport',
  latitude: 48.85,
  longitude: 2.35,
};
const lisbon = {
  ...paris,
  code: 'LIS',
  name: 'Lisbon',
  cityCode: 'LIS',
  cityName: 'Lisbon',
  countryCode: 'PT',
  countryName: 'Portugal',
  airportName: 'Lisbon Portela Airport',
  latitude: 38.72,
  longitude: -9.14,
};
const photo = {
  url: '/api/v1/places/photo?name=places%2Fx%2Fphotos%2Fy',
  attribution: 'Ana',
  attributionUrl: null,
};
const q = { origin: 'PAR', destination: 'LIS', departDate: '2026-12-01', returnDate: '2026-12-08' };

describe('BookingService', () => {
  let service: BookingService;
  let fetchMock: jest.SpyInstance;
  let env: Record<string, string>;
  const data = {
    place: jest.fn(async (code: string) =>
      code === 'PAR' ? paris : code === 'LIS' ? lisbon : null,
    ),
    airline: jest.fn(async (code?: string | null) =>
      code
        ? {
            code,
            name: code === 'TP' ? 'TAP Air Portugal' : code,
            logoUrl: `https://pics.avs.io/200/200/${code}.png`,
          }
        : null,
    ),
    search: jest.fn(),
    matchCity: jest.fn(async () => lisbon),
  };
  const places = { placePhotos: jest.fn(async () => [photo]) };
  const access = { assertCanView: jest.fn() };
  const airalo = { plans: jest.fn(async (): Promise<unknown[]> => []) };
  const plansRepo = {
    find: jest.fn(async (): Promise<unknown[]> => []),
    findOne: jest.fn(),
    create: jest.fn((d: object) => d),
    save: jest.fn(async (d: object) => ({ id: 1, ...d })),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  const members = { find: jest.fn(async (): Promise<unknown[]> => []) };
  const users = { findOne: jest.fn(async (): Promise<unknown> => null) };

  beforeEach(() => {
    jest.clearAllMocks();
    env = { TRAVELPAYOUTS_TOKEN: 'secret-token', TRAVELPAYOUTS_MARKER: '12345' };
    service = new BookingService(
      { get: (k: string) => env[k] } as never,
      data as never,
      places as never,
      access as never,
      airalo as never,
      plansRepo as never,
      members as never,
      users as never,
      memoryCache() as never,
    );
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const offer = {
    origin_airport: 'ORY',
    destination_airport: 'LIS',
    price: 89,
    airline: 'TP',
    flight_number: 439,
    departure_at: '2026-12-01T07:05:00+01:00',
    return_at: '2026-12-08T19:00:00+00:00',
    transfers: 0,
    return_transfers: 1,
    duration_to: 155,
    duration_back: 240,
    link: '/search/PAR0112LIS08121?t=abc',
  };

  it('returns offers with airline, times, stops and a partner link, plus places and photos', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, data: [offer] }));
    const r = await service.prices(q);
    expect(r.pricesAvailable).toBe(true);
    expect(r.datesMatched).toBe('exact');
    expect(r.route).toMatchObject({ origin: paris, destination: lisbon, adults: 1 });
    expect(r.destinationPhotos).toEqual([photo]);
    expect(places.placePhotos).toHaveBeenCalledWith('Lisbon, Portugal', 5);
    expect(r.offers[0]).toEqual({
      price: 89,
      currency: 'EUR',
      airline: {
        code: 'TP',
        name: 'TAP Air Portugal',
        logoUrl: 'https://pics.avs.io/200/200/TP.png',
      },
      flightNumber: 'TP439',
      departureAt: '2026-12-01T07:05:00+01:00',
      returnAt: '2026-12-08T19:00:00+00:00',
      departureDate: '2026-12-01',
      returnDate: '2026-12-08',
      originAirport: 'ORY',
      destinationAirport: 'LIS',
      stops: 0,
      returnStops: 1,
      durationMinutes: 155,
      returnDurationMinutes: 240,
      bookingUrl: 'https://www.aviasales.com/search/PAR0112LIS08121?t=abc&marker=12345',
      ctaLabel: 'View flight',
    });
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/aviasales/v3/prices_for_dates');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      origin: 'PAR',
      destination: 'LIS',
      departure_at: '2026-12-01',
      return_at: '2026-12-08',
      one_way: 'false',
      sorting: 'price',
      currency: 'eur',
      token: 'secret-token',
    });
    expect(JSON.stringify(r)).not.toContain('secret-token');
  });

  it('falls back to the month when the exact dates have no cached prices', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ success: true, data: [] }))
      .mockResolvedValueOnce(json({ success: true, data: [offer] }));
    const r = await service.prices(q);
    expect(r.datesMatched).toBe('month');
    expect(r.message).toBe('No prices for these exact dates yet. Cheapest found in December 2026.');
    const second = new URL(fetchMock.mock.calls[1][0] as string).searchParams;
    expect([second.get('departure_at'), second.get('return_at')]).toEqual(['2026-12', '2026-12']);
  });

  it('caches prices for a while', async () => {
    fetchMock.mockResolvedValueOnce(json({ success: true, data: [offer] }));
    await service.prices(q);
    await service.prices(q);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('still answers with the search link and photos without a token or when the partner fails', async () => {
    env.TRAVELPAYOUTS_TOKEN = '';
    const noToken = await service.prices(q);
    expect(noToken).toMatchObject({
      pricesAvailable: false,
      offers: [],
      destinationPhotos: [photo],
    });
    expect(noToken.message).toContain('TRAVELPAYOUTS_TOKEN');
    expect(noToken.searchUrl).toBe(
      'https://www.aviasales.com/search?origin=PAR&destination=LIS&depart_date=2026-12-01&adults=1&return_date=2026-12-08&marker=12345',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    env.TRAVELPAYOUTS_TOKEN = 'secret-token';
    fetchMock.mockResolvedValueOnce(json({}, 500));
    const down = await service.prices({ ...q, departDate: '2026-11' });
    expect(down).toMatchObject({ pricesAvailable: false, offers: [] });
  });

  it('photos are optional: Google being down does not break the search', async () => {
    places.placePhotos.mockRejectedValueOnce(new ServiceUnavailableException());
    fetchMock.mockResolvedValueOnce(json({ success: true, data: [offer] }));
    const r = await service.prices(q);
    expect(r.destinationPhotos).toEqual([]);
    expect(r.offers).toHaveLength(1);
  });

  it('search link names the cities', async () => {
    const link = await service.flightLink({ ...q, adults: 2 });
    expect(link.title).toBe('Flights from Paris to Lisbon');
    expect(link.url).toContain('adults=2');
  });

  describe('eSIMs', () => {
    it('by country name or code, with flag, photos and country-specific links', async () => {
      for (const country of ['Portugal', 'pt']) {
        const r = await service.esims(country);
        expect(r.country).toEqual({
          code: 'PT',
          name: 'Portugal',
          flagEmoji: '🇵🇹',
          flagUrl: 'https://flagcdn.com/w160/pt.png',
        });
        expect(r.photos).toEqual([photo]);
        expect(r.items.map((i) => i.url)).toEqual([
          'https://www.airalo.com/portugal-esim',
          'https://esim.holafly.com/esim-portugal/',
        ]);
      }
      expect((await service.esims('United States')).items[0].url).toBe(
        'https://www.airalo.com/united-states-esim',
      );
    });

    it('shows live Airalo plans first, with their highlights on the card', async () => {
      airalo.plans.mockResolvedValueOnce([
        {
          id: null,
          provider: 'Airalo',
          providerLogo: null,
          network: 'MEO',
          title: 'Portugal 1 GB',
          dataMb: 1024,
          isUnlimited: false,
          dataLabel: '1 GB',
          validityDays: 7,
          price: 4.5,
          currency: 'USD',
          url: 'https://www.airalo.com/portugal-esim',
          notes: null,
          source: 'airalo_api',
          checkedAt: '2026-10-16T00:00:00.000Z',
        },
        {
          id: null,
          provider: 'Airalo',
          providerLogo: null,
          network: 'MEO',
          title: 'Portugal 5 GB',
          dataMb: 5120,
          isUnlimited: false,
          dataLabel: '5 GB',
          validityDays: 30,
          price: 11,
          currency: 'USD',
          url: 'https://www.airalo.com/portugal-esim',
          notes: null,
          source: 'airalo_api',
          checkedAt: '2026-10-16T00:00:00.000Z',
        },
      ]);
      const r = await service.esims('PT');
      expect(r.plansSource).toBe('airalo_api');
      expect(r.plans.map((p) => p.title)).toEqual(['Portugal 1 GB', 'Portugal 5 GB']);
      expect(r.items[0].highlights).toEqual(['From $4.50', '2 plans · 7–30 days', 'Up to 5 GB']);
      expect(plansRepo.find).not.toHaveBeenCalled();
      expect(r.message).toContain('EU/EEA'); // Portugal: EU roaming note
    });

    it('falls back to admin-listed plans, clearly marked, with sizes in GB', async () => {
      plansRepo.find.mockResolvedValueOnce([
        {
          id: 7,
          provider: 'Holafly',
          title: 'Japan unlimited 7 days',
          dataMb: null,
          isUnlimited: true,
          validityDays: 7,
          price: 27,
          currency: 'EUR',
          url: 'https://esim.holafly.com/esim-japan/',
          notes: null,
          updatedAt: new Date('2026-10-01T10:00:00Z'),
        },
        {
          id: 8,
          provider: 'Airalo',
          title: 'Japan 3 GB',
          dataMb: 3072,
          isUnlimited: false,
          validityDays: 30,
          price: 9,
          currency: 'USD',
          url: 'https://www.airalo.com/japan-esim',
          notes: null,
          updatedAt: new Date('2026-10-02T10:00:00Z'),
        },
      ]);
      const r = await service.esims('Japan');
      expect(plansRepo.find).toHaveBeenCalledWith({
        where: { countryCode: 'JP', isActive: true },
        order: { price: 'ASC' },
      });
      expect(r.plansSource).toBe('manual');
      expect(r.message).toBe(
        'Plans listed by GoCity; check the partner page for the current price.',
      );
      expect(r.plans.map((p) => [p.provider, p.dataLabel, p.source, p.checkedAt])).toEqual([
        ['Holafly', 'Unlimited', 'manual', '2026-10-01T10:00:00.000Z'],
        ['Airalo', '3 GB', 'manual', '2026-10-02T10:00:00.000Z'],
      ]);
      expect(r.items[1].highlights[2]).toBe('Unlimited data available');
    });

    it('says when there are no plans for a country (no invented prices)', async () => {
      const r = await service.esims('Japan');
      expect(r.plansSource).toBe('none');
      expect(r.plans).toEqual([]);
      expect(r.message).toBe('No plans listed for Japan yet. Browse the partners below.');
      expect(r.items[0].highlights).toEqual([
        'Instant delivery',
        'No physical SIM',
        'Data plans by GB',
      ]);
    });

    it('admins manage plans; unlimited plans store no data amount', async () => {
      await service.createPlan({
        countryCode: 'JP',
        provider: 'Holafly',
        title: 'x',
        isUnlimited: true,
        dataMb: 500,
        validityDays: 5,
        price: 19,
        currency: 'EUR',
        url: 'https://esim.holafly.com/',
      });
      expect(plansRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ dataMb: null, isUnlimited: true, isActive: true, notes: null }),
      );
      plansRepo.findOne.mockResolvedValueOnce({
        id: 3,
        price: 9,
        isUnlimited: false,
        dataMb: 1024,
      });
      await service.updatePlan(3, { price: 8.5 });
      expect(plansRepo.save).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: 3, price: 8.5, dataMb: 1024 }),
      );
      plansRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.updatePlan(99, { price: 1 })).rejects.toThrow('eSIM plan #99 not found');
      plansRepo.delete.mockResolvedValueOnce({ affected: 0 });
      await expect(service.deletePlan(99)).rejects.toThrow('not found');
    });

    it('unknown or missing country: general links, no photos', async () => {
      const r = await service.esims('Atlantis');
      expect(r.country).toBeNull();
      expect(r.photos).toEqual([]);
      expect(r.items[0].url).toBe('https://www.airalo.com/');
      expect(places.placePhotos).not.toHaveBeenCalled();
    });
  });

  describe('trip defaults', () => {
    const me = { id: 1, email: 'me@x.com', role: UserRole.USER };
    it('matches the destination from the trip city and prefills dates and travellers', async () => {
      access.assertCanView.mockResolvedValueOnce({
        id: 10,
        name: 'Lisbon weekend',
        city: 'Lisbon',
        country: 'Portugal',
        cityLatitude: 38.72,
        cityLongitude: -9.14,
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        travelersCount: 2,
        updatedAt: new Date('2026-10-16T10:00:00Z'),
      });
      users.findOne.mockResolvedValueOnce({ id: 1, homeAirportCode: 'PAR' });
      const r = await service.forTrip(10, me);
      expect(r.myHomeAirport).toEqual(paris);
      expect(data.matchCity).toHaveBeenCalledWith('Lisbon', {
        lat: 38.72,
        lng: -9.14,
        country: 'Portugal',
      });
      expect(r).toMatchObject({
        tripId: 10,
        destination: lisbon,
        departDate: '2026-12-01',
        returnDate: '2026-12-03',
        adults: 2,
        country: { code: 'PT' },
        photos: [photo],
      });
      expect(r.esims.items[0].url).toBe('https://www.airalo.com/portugal-esim');
    });

    it('caches per trip, and refreshes when the trip changes', async () => {
      const trip = {
        id: 10,
        name: 'x',
        city: 'Lisbon',
        country: 'Portugal',
        startDate: '2026-12-01',
        endDate: '2026-12-03',
        travelersCount: 1,
        updatedAt: new Date('2026-10-16T10:00:00Z'),
      };
      access.assertCanView.mockResolvedValue(trip);
      await service.forTrip(10, me);
      await service.forTrip(10, me);
      expect(data.matchCity).toHaveBeenCalledTimes(1);
      access.assertCanView.mockResolvedValue({
        ...trip,
        endDate: '2026-12-05',
        updatedAt: new Date('2026-10-16T11:00:00Z'),
      });
      const changed = await service.forTrip(10, me);
      expect(data.matchCity).toHaveBeenCalledTimes(2);
      expect(changed.returnDate).toBe('2026-12-05');
      access.assertCanView.mockReset();
    });

    it('groups members by home airport, with offers for each group', async () => {
      access.assertCanView.mockResolvedValueOnce({
        id: 10,
        name: 'x',
        city: 'Lisbon',
        country: 'Portugal',
        startDate: '2026-12-01',
        endDate: '2026-12-08',
      });
      const member = (userId: number, firstName: string, homeAirportCode: string | null) => ({
        userId,
        user: { firstName, lastName: 'T', homeAirportCode, avatar: null },
      });
      members.find.mockResolvedValueOnce([
        member(1, 'Me', 'PAR'),
        member(2, 'Ana', 'PAR'),
        member(3, 'Bea', null),
        member(4, 'Rui', 'LIS'),
      ]);
      fetchMock.mockResolvedValueOnce(
        json({
          success: true,
          data: [
            offer,
            { ...offer, price: 120 },
            { ...offer, price: 150 },
            { ...offer, price: 160 },
          ],
        }),
      );
      const r = await service.tripFlights(10, me);
      expect(r.destination).toEqual(lisbon);
      expect(r.groups).toHaveLength(1);
      const g = r.groups[0];
      expect(g.originCode).toBe('PAR');
      expect(g.travellers.map((t) => [t.firstName, t.isMe])).toEqual([
        ['Me', true],
        ['Ana', false],
      ]);
      expect(g.offers.map((o) => o.price)).toEqual([89, 120, 150]);
      expect(g.searchUrl).toContain('adults=2');
      const sent = new URL(fetchMock.mock.calls[0][0] as string).searchParams;
      expect([
        sent.get('origin'),
        sent.get('destination'),
        sent.get('departure_at'),
        sent.get('return_at'),
      ]).toEqual(['PAR', 'LIS', '2026-12-01', '2026-12-08']);
      expect(r.withoutAirport.map((t) => t.firstName)).toEqual(['Bea']);
      expect(r.atDestination.map((t) => t.firstName)).toEqual(['Rui']);
    });

    it('needs view access to the trip', async () => {
      access.assertCanView.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.forTrip(10, me)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('validates the query (IATA codes, dates)', async () => {
    const errors = async (input: Record<string, string>) =>
      (await validate(plainToInstance(FlightPricesQueryDto, input))).map((e) => e.property);
    expect(await errors({ origin: 'par', destination: 'LIS', departDate: '2026-12' })).toEqual([]);
    expect(await errors({ origin: 'PARIS', destination: 'L1S', departDate: '2026-13-01' })).toEqual(
      ['origin', 'destination', 'departDate'],
    );
  });
});
