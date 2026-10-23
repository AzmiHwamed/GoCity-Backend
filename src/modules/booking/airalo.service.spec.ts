import { AiraloService } from './airalo.service';

const memoryCache = () => {
  const m = new Map<string, unknown>();
  return {
    get: jest.fn(async (k: string) => m.get(k)),
    set: jest.fn(async (k: string, v: unknown) => void m.set(k, v)),
  };
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('AiraloService (fetch mocked)', () => {
  let fetchMock: jest.SpyInstance;
  const make = (env: Record<string, string>) =>
    new AiraloService({ get: (k: string) => env[k] } as never, memoryCache() as never);
  const creds = { AIRALO_CLIENT_ID: 'id', AIRALO_CLIENT_SECRET: 'secret' };

  beforeEach(() => (fetchMock = jest.spyOn(global, 'fetch')));
  afterEach(() => fetchMock.mockRestore());

  it('is off without credentials and makes no requests', async () => {
    const service = make({});
    expect(service.enabled).toBe(false);
    expect(await service.plans('PT')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gets a token, then the country packages, cheapest first', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: { access_token: 'tok', expires_in: 31536000 } }))
      .mockResolvedValueOnce(
        json({
          data: [
            {
              slug: 'portugal',
              country_code: 'PT',
              title: 'Portugal',
              operators: [
                {
                  title: 'MEO',
                  image: { url: 'https://cdn.airalo.com/meo.png' },
                  packages: [
                    {
                      id: 'pt-5gb',
                      title: '5 GB - 30 Days',
                      amount: 5120,
                      day: 30,
                      price: 11,
                      data: '5 GB',
                    },
                    {
                      id: 'pt-1gb',
                      title: '1 GB - 7 Days',
                      amount: 1024,
                      day: 7,
                      price: 4.5,
                      data: '1 GB',
                    },
                    {
                      id: 'pt-unl',
                      title: 'Unlimited - 7 Days',
                      amount: 0,
                      day: 7,
                      is_unlimited: true,
                      price: 19,
                      data: 'Unlimited',
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
    const service = make(creds);
    const plans = await service.plans('PT');
    expect(
      plans.map((p) => [p.title, p.price, p.validityDays, p.dataMb, p.isUnlimited, p.network]),
    ).toEqual([
      ['1 GB - 7 Days', 4.5, 7, 1024, false, 'MEO'],
      ['5 GB - 30 Days', 11, 30, 5120, false, 'MEO'],
      ['Unlimited - 7 Days', 19, 7, null, true, 'MEO'],
    ]);
    expect(plans[0]).toMatchObject({
      provider: 'Airalo',
      currency: 'USD',
      source: 'airalo_api',
      url: 'https://www.airalo.com/portugal',
    });
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(tokenUrl).toBe('https://partners-api.airalo.com/v2/token');
    expect((tokenInit.body as FormData).get('grant_type')).toBe('client_credentials');
    const [url, init] = fetchMock.mock.calls[1] as [URL, RequestInit];
    expect(String(url)).toContain('filter%5Bcountry%5D=PT');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');

    // Cached: no more requests.
    await service.plans('PT');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns no plans (instead of failing) when Airalo errors', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401));
    expect(await make(creds).plans('PT')).toEqual([]);
  });
});
