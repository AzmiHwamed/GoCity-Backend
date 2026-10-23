import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import { EsimPlanDto } from './dto';

const DEFAULT_API = 'https://partners-api.airalo.com';
const TIMEOUT_MS = 10000;
const PLANS_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

interface AiraloPackage {
  id?: string;
  title?: string;
  amount?: number; // MB
  day?: number;
  is_unlimited?: boolean;
  price?: number;
  data?: string;
}
interface AiraloOperator {
  title?: string;
  image?: { url?: string };
  packages?: AiraloPackage[];
}
interface AiraloCountry {
  slug?: string;
  country_code?: string;
  title?: string;
  image?: { url?: string };
  operators?: AiraloOperator[];
}

/**
 * Airalo Partner API (real eSIM packages and prices). Used only when AIRALO_CLIENT_ID and
 * AIRALO_CLIENT_SECRET are set; otherwise `enabled` is false and admin-listed plans are shown.
 */
@Injectable()
export class AiraloService {
  private readonly logger = new Logger(AiraloService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  get enabled(): boolean {
    return !!(
      this.config.get<string>('AIRALO_CLIENT_ID') && this.config.get<string>('AIRALO_CLIENT_SECRET')
    );
  }

  /** Packages for a country, cheapest first. Empty when not configured or on errors. */
  async plans(countryCode: string): Promise<EsimPlanDto[]> {
    if (!this.enabled) return [];
    const key = `airalo:plans:${countryCode}`;
    const hit = await this.cache.get<EsimPlanDto[]>(key);
    if (hit) return hit;
    try {
      const token = await this.token();
      const url = new URL(`${this.api}/v2/packages`);
      url.searchParams.set('filter[country]', countryCode);
      url.searchParams.set('filter[type]', 'local');
      url.searchParams.set('limit', '50');
      const res = await fetch(url, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { data?: AiraloCountry[] };
      const checkedAt = new Date().toISOString();
      const plans = (body.data ?? [])
        .flatMap((c) =>
          (c.operators ?? []).flatMap((op) =>
            (op.packages ?? []).map((p): EsimPlanDto => ({
              id: null,
              provider: 'Airalo',
              providerLogo: op.image?.url ?? null,
              network: op.title ?? null,
              title: p.title ?? `${c.title ?? countryCode} ${p.data ?? ''}`.trim(),
              dataMb: p.is_unlimited ? null : (p.amount ?? null),
              isUnlimited: !!p.is_unlimited,
              dataLabel: p.data ?? null,
              validityDays: p.day ?? 0,
              price: p.price ?? 0,
              currency: 'USD',
              url: c.slug ? `https://www.airalo.com/${c.slug}` : 'https://www.airalo.com/',
              notes: null,
              source: 'airalo_api',
              checkedAt,
            })),
          ),
        )
        .filter((p) => p.price > 0)
        .sort((a, b) => a.price - b.price);
      await this.cache.set(key, plans, PLANS_TTL_MS);
      return plans;
    } catch (err) {
      this.logger.warn(`Airalo plans for ${countryCode} unavailable: ${(err as Error).message}`);
      return [];
    }
  }

  private get api(): string {
    return (this.config.get<string>('AIRALO_API_URL') || DEFAULT_API).replace(/\/$/, '');
  }

  private async token(): Promise<string> {
    const cached = await this.cache.get<string>('airalo:token');
    if (cached) return cached;
    const form = new FormData();
    form.set('client_id', this.config.get<string>('AIRALO_CLIENT_ID') as string);
    form.set('client_secret', this.config.get<string>('AIRALO_CLIENT_SECRET') as string);
    form.set('grant_type', 'client_credentials');
    const res = await fetch(`${this.api}/v2/token`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`token HTTP ${res.status}`);
    const body = (await res.json()) as { data?: { access_token?: string; expires_in?: number } };
    const token = body.data?.access_token;
    if (!token) throw new Error('no access_token');
    // Refresh a day before it expires (tokens last about a year).
    const ttl = Math.max(((body.data?.expires_in ?? 86400) - 86400) * 1000, 60_000);
    await this.cache.set('airalo:token', token, Math.min(ttl, 7 * 24 * 60 * 60 * 1000));
    return token;
  }
}
