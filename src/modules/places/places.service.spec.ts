import {
  BadGatewayException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PlacesService } from './places.service';

/** In-memory stand-in for the cache-manager store. */
const memoryCache = () => {
  const m = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => m.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void m.set(k, v)),
  };
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('PlacesService (Google Places API, fetch mocked)', () => {
  let service: PlacesService;
  let cache: ReturnType<typeof memoryCache>;
  let fetchMock: jest.SpyInstance;
  const config = (key = 'test-key') => ({
    get: (name: string, fallback?: unknown) =>
      name === 'GOOGLE_PLACES_API_KEY' ? key : name === 'app.apiPrefix' ? 'api' : fallback,
  });

  beforeEach(() => {
    cache = memoryCache();
    service = new PlacesService(config() as never, cache as never);
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    return { url, init, headers, body: init.body ? JSON.parse(String(init.body)) : undefined };
  };

  it('searches cities with autocomplete and maps the suggestions', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        suggestions: [
          {
            placePrediction: {
              placeId: 'ChIJlisbon',
              text: { text: 'Lisbon, Portugal' },
              structuredFormat: {
                mainText: { text: 'Lisbon' },
                secondaryText: { text: 'Portugal' },
              },
            },
          },
          { queryPrediction: { text: { text: 'not a place' } } },
        ],
      }),
    );
    await expect(service.searchCities('lis', 'en', 'session-1')).resolves.toEqual([
      {
        placeId: 'ChIJlisbon',
        name: 'Lisbon',
        description: 'Portugal',
        fullText: 'Lisbon, Portugal',
      },
    ]);
    const { url, headers, body } = lastCall();
    expect(url).toBe('https://places.googleapis.com/v1/places:autocomplete');
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    expect(body).toEqual({
      input: 'lis',
      includedPrimaryTypes: ['(cities)'],
      languageCode: 'en',
      sessionToken: 'session-1',
    });
  });

  it('caches results (second call does not hit Google)', async () => {
    fetchMock.mockResolvedValueOnce(json({ suggestions: [] }));
    await service.searchCities('porto');
    await service.searchCities('Porto');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gets a city with country and coordinates', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        id: 'ChIJlisbon',
        displayName: { text: 'Lisbon' },
        formattedAddress: 'Lisbon, Portugal',
        location: { latitude: 38.72, longitude: -9.14 },
        addressComponents: [
          { longText: 'Lisbon', types: ['locality'] },
          { longText: 'Portugal', shortText: 'PT', types: ['country', 'political'] },
        ],
      }),
    );
    await expect(service.getCity('ChIJlisbon')).resolves.toEqual({
      placeId: 'ChIJlisbon',
      name: 'Lisbon',
      address: 'Lisbon, Portugal',
      country: 'Portugal',
      countryCode: 'PT',
      latitude: 38.72,
      longitude: -9.14,
    });
    expect(lastCall().url).toBe(
      'https://places.googleapis.com/v1/places/ChIJlisbon?languageCode=en',
    );
    expect(lastCall().headers['X-Goog-FieldMask']).toContain('addressComponents');
  });

  it('rejects odd place ids without calling Google', async () => {
    await expect(service.getCity('../secrets')).rejects.toBeInstanceOf(NotFoundException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('hotels', () => {
    const hotel = {
      id: 'ChIJhotel',
      displayName: { text: 'Hotel Avenida' },
      formattedAddress: 'Av. da Liberdade 1',
      location: { latitude: 38.7, longitude: -9.1 },
      rating: 4.4,
      userRatingCount: 1200,
      priceLevel: 'PRICE_LEVEL_MODERATE',
      photos: [{ name: 'places/ChIJhotel/photos/abc123' }],
      googleMapsUri: 'https://maps.google.com/?cid=1',
    };

    it('searches around the city from its placeId, with filters', async () => {
      fetchMock
        .mockResolvedValueOnce(
          json({
            id: 'ChIJlisbon',
            displayName: { text: 'Lisbon' },
            location: { latitude: 38.72, longitude: -9.14 },
          }),
        )
        .mockResolvedValueOnce(json({ places: [hotel], nextPageToken: 'next' }));

      const page = await service.findHotels({
        placeId: 'ChIJlisbon',
        minRating: 4,
        maxPriceLevel: 2,
        limit: 5,
      });
      expect(page.nextPageToken).toBe('next');
      expect(page.hotels[0]).toEqual({
        placeId: 'ChIJhotel',
        name: 'Hotel Avenida',
        address: 'Av. da Liberdade 1',
        latitude: 38.7,
        longitude: -9.1,
        rating: 4.4,
        userRatingCount: 1200,
        priceLevel: 2,
        photoUrl: '/api/v1/places/photo?name=places%2FChIJhotel%2Fphotos%2Fabc123',
        websiteUri: null,
        googleMapsUri: 'https://maps.google.com/?cid=1',
        phone: null,
      });

      const { url, body, headers } = lastCall();
      expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
      expect(body).toMatchObject({
        textQuery: 'hotels in Lisbon',
        includedType: 'hotel',
        pageSize: 5,
        minRating: 4,
        priceLevels: ['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_MODERATE'],
        locationBias: { circle: { center: { latitude: 38.72, longitude: -9.14 }, radius: 15000 } },
      });
      expect(headers['X-Goog-FieldMask']).toContain('places.photos');
      expect(headers['X-Goog-FieldMask']).toContain('nextPageToken');
      expect(JSON.stringify(page)).not.toContain('test-key');
    });

    it('keeps the old free-text searchHotels(query) working', async () => {
      fetchMock.mockResolvedValueOnce(json({ places: [hotel] }));
      const hotels = await service.searchHotels('hotels near Rossio');
      expect(hotels).toHaveLength(1);
      expect(lastCall().body.textQuery).toBe('hotels near Rossio');
    });

    it('photo proxy only serves photos from our own results', async () => {
      await expect(service.getPhoto('places/X/photos/unknown')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.getPhoto('https://evil.example/x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(json({ places: [hotel] }));
      await service.searchHotels('anything');
      fetchMock.mockResolvedValueOnce(
        new Response(Buffer.from('JPEGDATA'), { headers: { 'content-type': 'image/jpeg' } }),
      );
      const photo = await service.getPhoto('places/ChIJhotel/photos/abc123', 400);
      expect(photo.contentType).toBe('image/jpeg');
      expect(photo.body.toString()).toBe('JPEGDATA');
      expect(lastCall().url).toBe(
        'https://places.googleapis.com/v1/places/ChIJhotel/photos/abc123/media?maxWidthPx=400',
      );

      // cached afterwards
      await service.getPhoto('places/ChIJhotel/photos/abc123', 400);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('errors', () => {
    it('503 when no API key is configured (no request made)', async () => {
      service = new PlacesService(config('') as never, cache as never);
      await expect(service.searchCities('lis')).rejects.toThrow(
        new ServiceUnavailableException('Google Places API key is not configured'),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("502 for Google errors, without leaking Google's message", async () => {
      fetchMock.mockResolvedValueOnce(
        json({ error: { message: 'API key not valid. key=abc' } }, 403),
      );
      const err = await service.searchCities('lis').catch((e) => e);
      expect(err).toBeInstanceOf(BadGatewayException);
      expect(err.message).not.toContain('key');
    });

    it('502 when Google does not answer (network error / timeout)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('The operation was aborted due to timeout'));
      await expect(service.searchCities('lis')).rejects.toBeInstanceOf(BadGatewayException);
      expect(lastCall().init.signal).toBeDefined();
    });

    it('404 when Google does not know the place', async () => {
      fetchMock.mockResolvedValueOnce(json({ error: {} }, 404));
      await expect(service.getCity('ChIJnope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
