import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';
import {
  CityDetailsDto,
  CitySuggestionDto,
  HotelDto,
  HotelPageDto,
  HotelSearchOptions,
} from './dto';

const API = 'https://places.googleapis.com/v1';
const TIMEOUT_MS = 8000;
const SEARCH_TTL_MS = 10 * 60 * 1000; // 10 min
const DETAILS_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const PHOTO_NAME = /^places\/[\w-]+\/photos\/[\w-]+$/;

const PRICE_LEVELS = [
  'PRICE_LEVEL_FREE',
  'PRICE_LEVEL_INEXPENSIVE',
  'PRICE_LEVEL_MODERATE',
  'PRICE_LEVEL_EXPENSIVE',
  'PRICE_LEVEL_VERY_EXPENSIVE',
];

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: { name?: string }[];
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
}

const HOTEL_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'photos',
  'websiteUri',
  'googleMapsUri',
  'nationalPhoneNumber',
];

/**
 * Server-side proxy for Google Places API (New). The API key never reaches clients:
 * photos are served through GET /places/photo. Responses are cached to save quota.
 */
@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly photoPath: string;

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {
    this.photoPath = `/${config.get<string>('app.apiPrefix', 'api')}/v1/places/photo`;
  }

  // ── Cities ────────────────────────────────────────────────

  /** City suggestions while the user types ("lis" → Lisbon, Portugal). */
  async searchCities(
    query: string,
    lang = 'en',
    sessionToken?: string,
  ): Promise<CitySuggestionDto[]> {
    return this.cached(`places:cities:${lang}:${query.toLowerCase()}`, SEARCH_TTL_MS, async () => {
      const data = await this.post<{
        suggestions?: {
          placePrediction?: {
            placeId?: string;
            text?: { text?: string };
            structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
          };
        }[];
      }>('places:autocomplete', {
        input: query,
        includedPrimaryTypes: ['(cities)'],
        languageCode: lang,
        ...(sessionToken ? { sessionToken } : {}),
      });
      return (data.suggestions ?? [])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
        .map((p) => ({
          placeId: p.placeId as string,
          name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? '',
          description: p.structuredFormat?.secondaryText?.text ?? null,
          fullText: p.text?.text ?? '',
        }));
    });
  }

  /** Name, country and coordinates of a city (or any place) from its placeId. */
  async getCity(placeId: string, lang = 'en'): Promise<CityDetailsDto> {
    const place = await this.getPlace(placeId, lang, [
      'id',
      'displayName',
      'formattedAddress',
      'location',
      'addressComponents',
    ]);
    const country = place.addressComponents?.find((c) => c.types?.includes('country'));
    return {
      placeId: place.id ?? placeId,
      name: place.displayName?.text ?? '',
      address: place.formattedAddress ?? null,
      country: country?.longText ?? null,
      countryCode: country?.shortText ?? null,
      latitude: place.location?.latitude ?? null,
      longitude: place.location?.longitude ?? null,
    };
  }

  // ── Hotels ────────────────────────────────────────────────

  /**
   * Hotels in a city: by city placeId (searched around its coordinates), by city name,
   * by coordinates, or by free text (`q`).
   */
  async findHotels(opts: HotelSearchOptions): Promise<HotelPageDto> {
    let cityName = opts.city?.trim();
    let lat = opts.lat;
    let lng = opts.lng;
    if (opts.placeId) {
      const city = await this.getCity(opts.placeId, opts.lang);
      cityName = city.name;
      lat = city.latitude ?? undefined;
      lng = city.longitude ?? undefined;
    }
    const textQuery = opts.q?.trim() || (cityName ? `hotels in ${cityName}` : 'hotels');

    const body: Record<string, unknown> = {
      textQuery,
      includedType: 'hotel',
      languageCode: opts.lang ?? 'en',
      pageSize: Math.min(opts.limit ?? 10, 20),
    };
    if (lat !== undefined && lng !== undefined) {
      body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 15000 } };
    }
    if (opts.minRating !== undefined) body.minRating = opts.minRating;
    if (opts.maxPriceLevel !== undefined) {
      // FREE isn't a valid filter value; 2 → inexpensive + moderate
      body.priceLevels = PRICE_LEVELS.slice(1, opts.maxPriceLevel + 1);
    }
    if (opts.pageToken) body.pageToken = opts.pageToken;

    return this.cached(`places:hotels:${JSON.stringify(body)}`, SEARCH_TTL_MS, async () => {
      const data = await this.post<{ places?: GooglePlace[]; nextPageToken?: string }>(
        'places:searchText',
        body,
        [...HOTEL_FIELDS.map((f) => `places.${f}`), 'nextPageToken'].join(','),
      );
      const places = data.places ?? [];
      await this.allowPhotos(places);
      return {
        hotels: places.map((p) => this.toHotel(p)),
        nextPageToken: data.nextPageToken ?? null,
      };
    });
  }

  /** Hotels matching free text, e.g. "hotels near Rossio". */
  async searchHotels(query: string): Promise<HotelDto[]> {
    return (await this.findHotels({ q: query })).hotels;
  }

  /** One hotel's details (used when a trip picks its hotel). */
  async getHotel(placeId: string, lang = 'en'): Promise<HotelDto> {
    const place = await this.getPlace(placeId, lang, HOTEL_FIELDS);
    await this.allowPhotos([place]);
    return this.toHotel(place);
  }

  // ── Photos ────────────────────────────────────────────────

  /**
   * Downloads a place photo for the photo proxy. Only photos that came back from one of our
   * own searches are served, so the endpoint can't be used to spend the quota on anything.
   */
  async getPhoto(name: string, maxWidth = 800): Promise<{ body: Buffer; contentType: string }> {
    if (!PHOTO_NAME.test(name) || !(await this.cache.get(`places:photo-ok:${name}`))) {
      throw new NotFoundException('Photo not found');
    }
    const width = Math.min(Math.max(Math.round(maxWidth), 100), 1600);
    const cached = await this.cache.get<{ body: string; contentType: string }>(
      `places:photo:${name}:${width}`,
    );
    if (cached)
      return { body: Buffer.from(cached.body, 'base64'), contentType: cached.contentType };

    const res = await this.request(`${API}/${name}/media?maxWidthPx=${width}`, { method: 'GET' });
    const body = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    await this.cache.set(
      `places:photo:${name}:${width}`,
      { body: body.toString('base64'), contentType },
      DETAILS_TTL_MS,
    );
    return { body, contentType };
  }

  // ──────────────────────────────────────────────────────────

  private toHotel(p: GooglePlace): HotelDto {
    const photo = p.photos?.[0]?.name;
    const level = p.priceLevel ? PRICE_LEVELS.indexOf(p.priceLevel) : -1;
    return {
      placeId: p.id ?? '',
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? null,
      latitude: p.location?.latitude ?? null,
      longitude: p.location?.longitude ?? null,
      rating: p.rating ?? null,
      userRatingCount: p.userRatingCount ?? null,
      priceLevel: level >= 0 ? level : null,
      photoUrl: photo ? `${this.photoPath}?name=${encodeURIComponent(photo)}` : null,
      websiteUri: p.websiteUri ?? null,
      googleMapsUri: p.googleMapsUri ?? null,
      phone: p.nationalPhoneNumber ?? null,
    };
  }

  /** Remembers which photos we handed out, so the proxy only serves those. */
  private async allowPhotos(places: GooglePlace[]): Promise<void> {
    for (const name of places.map((p) => p.photos?.[0]?.name).filter(Boolean)) {
      await this.cache.set(`places:photo-ok:${name}`, true, DETAILS_TTL_MS);
    }
  }

  private getPlace(placeId: string, lang: string, fields: string[]): Promise<GooglePlace> {
    if (!/^[\w-]+$/.test(placeId)) throw new NotFoundException('Place not found');
    const key = `places:place:${lang}:${placeId}:${fields.join(',')}`;
    return this.cached(key, DETAILS_TTL_MS, async () => {
      const res = await this.request(
        `${API}/places/${placeId}?languageCode=${encodeURIComponent(lang)}`,
        { method: 'GET', headers: { 'X-Goog-FieldMask': fields.join(',') } },
      );
      return (await res.json()) as GooglePlace;
    });
  }

  private async post<T>(path: string, body: unknown, fieldMask = '*'): Promise<T> {
    const res = await this.request(`${API}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': fieldMask },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  /** Calls Google with the key; maps failures to 503 (no key) / 404 / 502. */
  private async request(url: string, init: RequestInit): Promise<Response> {
    const key = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!key) throw new ServiceUnavailableException('Google Places API key is not configured');

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...(init.headers as Record<string, string>), 'X-Goog-Api-Key': key },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`Google Places request failed: ${(err as Error).message}`);
      throw new BadGatewayException('Google Places did not respond, please try again');
    }
    if (res.status === 404) throw new NotFoundException('Place not found');
    if (!res.ok) {
      // Log Google's message for us; never pass it (or the key) to the client.
      this.logger.warn(`Google Places ${res.status}: ${(await res.text()).slice(0, 300)}`);
      throw new BadGatewayException('Google Places returned an error, please try again later');
    }
    return res;
  }

  private async cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
    const hit = await this.cache.get<T>(key);
    if (hit !== undefined && hit !== null) return hit;
    const value = await load();
    await this.cache.set(key, value, ttl);
    return value;
  }
}
