import { TravelpayoutsDataService } from './travelpayouts-data.service';

const memoryCache = () => {
  const m = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => m.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void m.set(k, v)),
  };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const cities = [
  { code: 'LIS', name: 'Lisbon', country_code: 'PT', coordinates: { lat: 38.72, lon: -9.14 } },
  { code: 'PAR', name: 'Paris', country_code: 'FR', coordinates: { lat: 48.85, lon: 2.35 } },
];
const airports = [
  {
    code: 'LIS',
    name: 'Lisbon Portela Airport',
    city_code: 'LIS',
    country_code: 'PT',
    iata_type: 'airport',
    flightable: true,
  },
  {
    code: 'ORY',
    name: 'Orly Airport',
    city_code: 'PAR',
    country_code: 'FR',
    iata_type: 'airport',
    flightable: true,
    coordinates: { lat: 48.72, lon: 2.36 },
  },
];
const airlines = [{ code: 'TP', name: 'TAP', name_translations: { en: 'TAP Air Portugal' } }];

describe('TravelpayoutsDataService (fetch mocked)', () => {
  let service: TravelpayoutsDataService;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    service = new TravelpayoutsDataService(memoryCache() as never);
    fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/cities.json')) return json(cities);
      if (url.endsWith('/airports.json')) return json(airports);
      if (url.endsWith('/airlines.json')) return json(airlines);
      if (url.includes('autocomplete')) {
        return json([
          {
            code: 'LIS',
            type: 'city',
            name: 'Lisbon',
            country_code: 'PT',
            country_name: 'Portugal',
            main_airport_name: 'Lisbon Portela Airport',
            coordinates: { lat: 38.72, lon: -9.14 },
          },
          {
            code: 'LIS',
            type: 'airport',
            name: 'Lisbon Portela Airport',
            city_code: 'LIS',
            city_name: 'Lisbon',
            country_code: 'PT',
            coordinates: { lat: 38.77, lon: -9.13 },
          },
          {
            code: 'XLB',
            type: 'city',
            name: 'Lisbon',
            country_code: 'US',
            country_name: 'United States',
            coordinates: { lat: 44.0, lon: -70.1 },
          },
        ]);
      }
      return json({}, 404);
    });
  });
  afterEach(() => fetchMock.mockRestore());

  it('describes cities (with their main airport) and airports (with their city)', async () => {
    expect(await service.place('lis')).toMatchObject({
      code: 'LIS',
      type: 'city',
      name: 'Lisbon',
      countryName: 'Portugal',
      airportName: 'Lisbon Portela Airport',
    });
    expect(await service.place('ORY')).toMatchObject({
      code: 'ORY',
      type: 'airport',
      name: 'Orly Airport',
      cityCode: 'PAR',
      cityName: 'Paris',
      countryName: 'France',
    });
    expect(await service.place('ZZZ')).toBeNull();
    // Reference files are loaded once.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('airlines get a name and logo (unknown codes keep the code as name)', async () => {
    expect(await service.airline('tp')).toEqual({
      code: 'TP',
      name: 'TAP Air Portugal',
      logoUrl: 'https://pics.avs.io/200/200/TP.png',
    });
    expect((await service.airline('ZZ'))?.name).toBe('ZZ');
    expect(await service.airline(null)).toBeNull();
  });

  it('autocomplete returns cities and airports, cached', async () => {
    const r = await service.search('lisb');
    expect(r.map((p) => [p.code, p.type, p.cityName])).toEqual([
      ['LIS', 'city', 'Lisbon'],
      ['LIS', 'airport', 'Lisbon'],
      ['XLB', 'city', 'Lisbon'],
    ]);
    await service.search('LISB ');
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('autocomplete'))).toHaveLength(
      1,
    );
  });

  it('matches a trip city by distance, then by country', async () => {
    expect((await service.matchCity('Lisbon', { lat: 38.7, lng: -9.1 }))?.countryCode).toBe('PT');
    expect((await service.matchCity('Lisbon', { country: 'United States' }))?.code).toBe('XLB');
    expect(await service.matchCity('Lisbon', { lat: 0, lng: 0, country: 'Japan' })).toBeNull();
  });

  it('works without the reference data (lookups return null)', async () => {
    fetchMock.mockImplementation(async () => json({}, 503));
    expect(await service.place('LIS')).toBeNull();
    expect(await service.search('lis')).toEqual([]);
  });
});
