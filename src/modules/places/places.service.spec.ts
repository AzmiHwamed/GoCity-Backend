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

  describe('places for activities', () => {
    it('searches around the trip city and keeps only places with coordinates', async () => {
      fetchMock
        .mockResolvedValueOnce(
          json({
            id: 'ChIJlisbon',
            displayName: { text: 'Lisbon' },
            location: { latitude: 38.72, longitude: -9.14 },
          }),
        )
        .mockResolvedValueOnce(
          json({
            places: [
              {
                id: 'ChIJbelem',
                displayName: { text: 'Pastéis de Belém' },
                formattedAddress: 'R. de Belém 84',
                location: { latitude: 38.6975, longitude: -9.2032 },
                primaryTypeDisplayName: { text: 'Bakery' },
                rating: 4.6,
              },
              { id: 'ChIJnowhere', displayName: { text: 'No location' } },
            ],
          }),
        );
      const results = await service.searchPlaces({ q: 'pasteis de belem', near: 'ChIJlisbon' });
      expect(results).toEqual([
        {
          placeId: 'ChIJbelem',
          name: 'Pastéis de Belém',
          address: 'R. de Belém 84',
          category: 'Bakery',
          latitude: 38.6975,
          longitude: -9.2032,
          rating: 4.6,
          googleMapsUri: null,
        },
      ]);
      const { url, body, headers } = lastCall();
      expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
      expect(body).toMatchObject({
        textQuery: 'pasteis de belem',
        pageSize: 8,
        locationBias: { circle: { center: { latitude: 38.72, longitude: -9.14 }, radius: 30000 } },
      });
      expect(body.includedType).toBeUndefined();
      expect(headers['X-Goog-FieldMask']).toContain('places.location');
    });

    it('works without a bias and caches the results', async () => {
      fetchMock.mockResolvedValueOnce(json({ places: [] }));
      await service.searchPlaces({ q: 'louvre', lat: 48.86, lng: 2.34 });
      await service.searchPlaces({ q: 'louvre', lat: 48.86, lng: 2.34 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(lastCall().body.locationBias.circle.center).toEqual({
        latitude: 48.86,
        longitude: 2.34,
      });
    });
  });

  it('gives several photos of a place through the proxy, with credits, and allows them', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        places: [
          {
            id: 'ChIJlisbon',
            photos: [
              {
                name: 'places/ChIJlisbon/photos/a1',
                authorAttributions: [{ displayName: 'Ana', uri: 'https://maps.google.com/ana' }],
              },
              { name: 'places/ChIJlisbon/photos/b2' },
              { name: 'places/ChIJlisbon/photos/c3' },
            ],
          },
        ],
      }),
    );
    const photos = await service.placePhotos('Lisbon, Portugal', 2);
    expect(photos).toEqual([
      {
        url: '/api/v1/places/photo?name=places%2FChIJlisbon%2Fphotos%2Fa1',
        attribution: 'Ana',
        attributionUrl: 'https://maps.google.com/ana',
      },
      {
        url: '/api/v1/places/photo?name=places%2FChIJlisbon%2Fphotos%2Fb2',
        attribution: null,
        attributionUrl: null,
      },
    ]);
    expect(lastCall().headers['X-Goog-FieldMask']).toBe('places.id,places.photos');
    // Only the photos we handed out can be fetched through the proxy.
    fetchMock.mockResolvedValueOnce(
      new Response(Buffer.from('jpg'), { headers: { 'content-type': 'image/jpeg' } }),
    );
    await expect(service.getPhoto('places/ChIJlisbon/photos/b2')).resolves.toMatchObject({
      contentType: 'image/jpeg',
    });
    await expect(service.getPhoto('places/ChIJlisbon/photos/c3')).rejects.toThrow(
      'Photo not found',
    );
    // Cached: a second call doesn't ask Google again.
    await service.placePhotos('lisbon, portugal', 3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('place details: hours on a given day, photos, reviews, amenities', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        id: 'ChIJbelem',
        displayName: { text: 'Belém Tower' },
        primaryTypeDisplayName: { text: 'Historical landmark' },
        editorialSummary: { text: 'Fortified tower on the river.' },
        formattedAddress: 'Av. Brasília, Lisboa',
        location: { latitude: 38.69, longitude: -9.21 },
        rating: 4.6,
        userRatingCount: 48211,
        priceLevel: 'PRICE_LEVEL_INEXPENSIVE',
        currentOpeningHours: { openNow: false },
        regularOpeningHours: {
          weekdayDescriptions: [
            'Monday: Closed',
            'Tuesday: 10:00 AM – 5:30 PM',
            'Wednesday: 10:00 AM – 5:30 PM',
            'Thursday: 10:00 AM – 5:30 PM',
            'Friday: 10:00 AM – 5:30 PM',
            'Saturday: 10:00 AM – 5:30 PM',
            'Sunday: 10:00 AM – 5:30 PM',
          ],
        },
        photos: [
          { name: 'places/ChIJbelem/photos/p1', authorAttributions: [{ displayName: 'Rui' }] },
        ],
        reviews: [
          {
            rating: 5,
            text: { text: 'Beautiful' },
            relativePublishTimeDescription: 'a week ago',
            authorAttribution: { displayName: 'Ana' },
          },
        ],
        goodForChildren: true,
        allowsDogs: false,
        restroom: true,
      }),
    );
    // 2026-12-01 is a Tuesday.
    const d = await service.getPlaceDetails('ChIJbelem', '2026-12-01');
    expect(d).toMatchObject({
      name: 'Belém Tower',
      category: 'Historical landmark',
      summary: 'Fortified tower on the river.',
      rating: 4.6,
      userRatingCount: 48211,
      priceLevel: 1,
      openNow: false,
      hoursOnDate: 'Tuesday: 10:00 AM – 5:30 PM',
      reviews: [{ author: 'Ana', rating: 5, text: 'Beautiful', when: 'a week ago' }],
      amenities: ['Good for children', 'Restroom'],
    });
    expect(d.weeklyHours).toHaveLength(7);
    expect(d.photos).toEqual([
      {
        url: '/api/v1/places/photo?name=places%2FChIJbelem%2Fphotos%2Fp1',
        attribution: 'Rui',
        attributionUrl: null,
      },
    ]);
    expect(lastCall().headers['X-Goog-FieldMask']).toContain(
      'regularOpeningHours.weekdayDescriptions',
    );
    // Monday (2026-11-30) and no date
    expect((await service.getPlaceDetails('ChIJbelem', '2026-11-30')).hoursOnDate).toBe(
      'Monday: Closed',
    );
    expect((await service.getPlaceDetails('ChIJbelem')).hoursOnDate).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1); // cached
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
