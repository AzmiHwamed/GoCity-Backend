import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { AirlineDto, FlightPlaceDto } from './dto';

const DATA_URL = 'https://api.travelpayouts.com/data/en';
const AUTOCOMPLETE_URL = 'https://autocomplete.travelpayouts.com/places2';
const TIMEOUT_MS = 15000;
const DATA_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_TTL_MS = 24 * 60 * 60 * 1000;

interface TpCity {
  code: string;
  name?: string;
  country_code?: string;
  coordinates?: { lat?: number; lon?: number };
}
interface TpAirport extends TpCity {
  city_code?: string;
  iata_type?: string;
  flightable?: boolean;
}
interface TpAirline {
  code?: string;
  name?: string;
  name_translations?: { en?: string };
}
interface TpSuggestion {
  code?: string;
  type?: string;
  name?: string;
  city_code?: string;
  city_name?: string;
  country_code?: string;
  country_name?: string;
  main_airport_name?: string;
  coordinates?: { lat?: number; lon?: number };
}

const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
export const countryName = (code?: string | null) => {
  if (!code) return null;
  try {
    return countryNames.of(code.toUpperCase()) ?? null;
  } catch {
    return null;
  }
};
export const airlineLogo = (code: string) => `https://pics.avs.io/200/200/${code}.png`;

/**
 * Travelpayouts reference data (cities, airports, airlines) and place autocomplete. These are
 * public (no token). The files are loaded once a day and kept in memory; if they can't be loaded,
 * lookups return null and the booking endpoints still answer.
 */
@Injectable()
export class TravelpayoutsDataService {
  private readonly logger = new Logger(TravelpayoutsDataService.name);
  private data: {
    cities: Map<string, TpCity>;
    airports: Map<string, TpAirport>;
    airlines: Map<string, TpAirline>;
  } | null = null;
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  /** City or airport by IATA code (a city wins when a code is both). */
  async place(code: string): Promise<FlightPlaceDto | null> {
    const data = await this.load();
    if (!data) return null;
    const c = code.toUpperCase();
    const city = data.cities.get(c);
    if (city) {
      const main = [...data.airports.values()].find(
        (a) => a.city_code === c && a.iata_type === 'airport' && a.flightable,
      );
      return this.toPlace(city, 'city', city, main ?? null);
    }
    const airport = data.airports.get(c);
    if (!airport) return null;
    const itsCity = airport.city_code ? (data.cities.get(airport.city_code) ?? null) : null;
    return this.toPlace(airport, 'airport', itsCity, airport);
  }

  async airline(code?: string | null): Promise<AirlineDto | null> {
    if (!code) return null;
    const data = await this.load();
    const a = data?.airlines.get(code.toUpperCase());
    return {
      code: code.toUpperCase(),
      name: a?.name_translations?.en || a?.name || code.toUpperCase(),
      logoUrl: airlineLogo(code.toUpperCase()),
    };
  }

  /** Cities and airports matching what the user typed ("lisb" → Lisbon LIS). */
  async search(term: string): Promise<FlightPlaceDto[]> {
    const key = `booking:places:${term.trim().toLowerCase()}`;
    const hit = await this.cache.get<FlightPlaceDto[]>(key);
    if (hit) return hit;
    const params = new URLSearchParams({ locale: 'en', term: term.trim() });
    params.append('types[]', 'city');
    params.append('types[]', 'airport');
    const res = await this.fetchJson<TpSuggestion[]>(`${AUTOCOMPLETE_URL}?${params}`);
    const results = (res ?? [])
      .filter((s) => s.code && (s.type === 'city' || s.type === 'airport'))
      .slice(0, 10)
      .map((s): FlightPlaceDto => ({
        code: s.code as string,
        type: s.type as 'city' | 'airport',
        name: s.name ?? (s.code as string),
        cityCode: s.type === 'airport' ? (s.city_code ?? null) : (s.code as string),
        cityName: s.type === 'airport' ? (s.city_name ?? null) : (s.name ?? null),
        countryCode: s.country_code ?? null,
        countryName: s.country_name ?? countryName(s.country_code),
        airportName: s.type === 'airport' ? (s.name ?? null) : (s.main_airport_name ?? null),
        latitude: s.coordinates?.lat ?? null,
        longitude: s.coordinates?.lon ?? null,
      }));
    if (res) await this.cache.set(key, results, SEARCH_TTL_MS);
    return results;
  }

  /**
   * The flight city for a trip destination: a city with that name, nearest to the trip's
   * coordinates (within 150 km) or in the same country.
   */
  async matchCity(
    name: string,
    opts: { lat?: number | null; lng?: number | null; country?: string | null } = {},
  ): Promise<FlightPlaceDto | null> {
    const cities = (await this.search(name)).filter((p) => p.type === 'city');
    if (!cities.length) return null;
    if (opts.lat != null && opts.lng != null) {
      const near = cities
        .filter((c) => c.latitude != null && c.longitude != null)
        .map((c) => ({ c, km: distanceKm(opts.lat!, opts.lng!, c.latitude!, c.longitude!) }))
        .sort((a, b) => a.km - b.km)[0];
      if (near && near.km <= 150) return near.c;
    }
    const country = opts.country?.toLowerCase();
    return (
      cities.find(
        (c) =>
          country && [c.countryName?.toLowerCase(), c.countryCode?.toLowerCase()].includes(country),
      ) ?? (opts.lat == null ? cities[0] : null)
    );
  }

  private toPlace(
    p: TpCity,
    type: 'city' | 'airport',
    city: TpCity | null,
    airport: TpAirport | null,
  ): FlightPlaceDto {
    return {
      code: p.code,
      type,
      name: p.name ?? p.code,
      cityCode: city?.code ?? null,
      cityName: city?.name ?? null,
      countryCode: p.country_code ?? null,
      countryName: countryName(p.country_code),
      airportName: airport?.name ?? null,
      latitude: p.coordinates?.lat ?? null,
      longitude: p.coordinates?.lon ?? null,
    };
  }

  private async load(): Promise<typeof this.data> {
    if (this.data && Date.now() - this.loadedAt < DATA_TTL_MS) return this.data;
    this.loading ??= (async () => {
      const [cities, airports, airlines] = await Promise.all([
        this.fetchJson<TpCity[]>(`${DATA_URL}/cities.json`),
        this.fetchJson<TpAirport[]>(`${DATA_URL}/airports.json`),
        this.fetchJson<TpAirline[]>(`${DATA_URL}/airlines.json`),
      ]);
      if (cities && airports && airlines) {
        const byCode = <T extends { code?: string }>(rows: T[]) =>
          new Map(rows.filter((r) => r.code).map((r) => [r.code!.toUpperCase(), r]));
        this.data = {
          cities: byCode(cities),
          airports: byCode(airports),
          airlines: byCode(airlines),
        };
        this.loadedAt = Date.now();
      }
    })().finally(() => (this.loading = null));
    await this.loading;
    return this.data;
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(
        `Travelpayouts data unavailable (${url.split('?')[0]}): ${(err as Error).message}`,
      );
      return null;
    }
  }
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
