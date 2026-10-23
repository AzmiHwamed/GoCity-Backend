import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { RoutesService } from './routes.service';

const memoryCache = () => {
  const m = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => m.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void m.set(k, v)),
  };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('RoutesService (Google Routes API, fetch mocked)', () => {
  let service: RoutesService;
  let fetchMock: jest.SpyInstance;
  const config = (key: string | undefined = 'test-key') => ({ get: () => key });
  const a = { lat: 38.6916, lng: -9.216 };
  const b = { lat: 38.7071, lng: -9.1457 };

  beforeEach(() => {
    service = new RoutesService(config() as never, memoryCache() as never);
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const lastCall = () => {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return {
      url,
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    };
  };

  it('computes a walking leg: distance, duration and polyline', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        routes: [{ distanceMeters: 6200, duration: '4500s', polyline: { encodedPolyline: 'abc' } }],
      }),
    );
    const leg = await service.computeLeg({ from: a, to: b, mode: 'WALK' });
    expect(leg).toEqual({
      distanceMeters: 6200,
      durationSeconds: 4500,
      polyline: 'abc',
      transitSummary: null,
    });
    const { url, headers, body } = lastCall();
    expect(url).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(headers['X-Goog-Api-Key']).toBe('test-key');
    expect(headers['X-Goog-FieldMask']).toContain('routes.polyline.encodedPolyline');
    expect(body).toMatchObject({
      travelMode: 'WALK',
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
    });
    expect(body.arrivalTime).toBeUndefined();
  });

  it('summarizes transit rides and asks to arrive on time', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        routes: [
          {
            distanceMeters: 7000,
            duration: '1500s',
            legs: [
              {
                steps: [
                  { travelMode: 'WALK' },
                  {
                    travelMode: 'TRANSIT',
                    transitDetails: {
                      stopCount: 6,
                      transitLine: { nameShort: '15E', vehicle: { type: 'TRAM' } },
                    },
                  },
                  {
                    travelMode: 'TRANSIT',
                    transitDetails: {
                      stopCount: 1,
                      transitLine: { name: 'Azul', vehicle: { type: 'SUBWAY' } },
                    },
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
    const arrivalTime = new Date('2026-12-01T12:00:00Z');
    const leg = await service.computeLeg({ from: a, to: b, mode: 'TRANSIT', arrivalTime });
    expect(leg?.transitSummary).toBe('Tram 15E (6 stops) → Metro Azul (1 stop)');
    expect(lastCall().body.arrivalTime).toBe('2026-12-01T12:00:00.000Z');
  });

  it('returns null when Google finds no route, and caches results', async () => {
    fetchMock.mockResolvedValueOnce(json({}));
    expect(await service.computeLeg({ from: a, to: b, mode: 'TRANSIT' })).toBeNull();
    expect(await service.computeLeg({ from: a, to: b, mode: 'TRANSIT' })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('says clearly when the Routes API is not enabled for the key', async () => {
    fetchMock.mockResolvedValueOnce(
      json(
        {
          error: {
            status: 'PERMISSION_DENIED',
            message: 'Routes API has not been used in project 1 before or it is disabled.',
            details: [{ reason: 'SERVICE_DISABLED' }],
          },
        },
        403,
      ),
    );
    await expect(service.computeLeg({ from: a, to: b, mode: 'WALK' })).rejects.toThrow(
      'The Google Routes API is not enabled',
    );
  });

  it('other Google errors are 502, a missing key is 503 (no request made)', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: {} }, 500));
    await expect(service.computeLeg({ from: a, to: b, mode: 'DRIVE' })).rejects.toBeInstanceOf(
      BadGatewayException,
    );
    const noKey = new RoutesService(config('') as never, memoryCache() as never);
    await expect(noKey.computeLeg({ from: a, to: b, mode: 'DRIVE' })).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
