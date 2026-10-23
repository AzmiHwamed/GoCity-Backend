import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  BadGatewayException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cache } from 'cache-manager';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const TIMEOUT_MS = 8000;
const ROUTE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day
const FIELD_MASK = [
  'routes.distanceMeters',
  'routes.duration',
  'routes.polyline.encodedPolyline',
  'routes.legs.steps.travelMode',
  'routes.legs.steps.transitDetails.stopCount',
  'routes.legs.steps.transitDetails.transitLine.nameShort',
  'routes.legs.steps.transitDetails.transitLine.name',
  'routes.legs.steps.transitDetails.transitLine.vehicle.type',
].join(',');

export type RouteMode = 'WALK' | 'TRANSIT' | 'DRIVE';
export interface LatLng {
  lat: number;
  lng: number;
}
export interface LegRequest {
  from: LatLng;
  to: LatLng;
  mode: RouteMode;
  /** Transit only: when you want to arrive. */
  arrivalTime?: Date;
}
export interface LegResult {
  distanceMeters: number;
  durationSeconds: number;
  /** Google encoded polyline of the path. */
  polyline: string | null;
  /** Transit only, e.g. "Tram 15E (6 stops) → Metro Blue". */
  transitSummary: string | null;
}

interface GoogleRoute {
  distanceMeters?: number;
  duration?: string;
  polyline?: { encodedPolyline?: string };
  legs?: {
    steps?: {
      travelMode?: string;
      transitDetails?: {
        stopCount?: number;
        transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } };
      };
    }[];
  }[];
}

const VEHICLES: Record<string, string> = {
  BUS: 'Bus',
  TRAM: 'Tram',
  SUBWAY: 'Metro',
  METRO_RAIL: 'Metro',
  HEAVY_RAIL: 'Train',
  RAIL: 'Train',
  COMMUTER_TRAIN: 'Train',
  FERRY: 'Ferry',
  CABLE_CAR: 'Cable car',
  FUNICULAR: 'Funicular',
};
const round = (n: number) => n.toFixed(5);

/**
 * Google Routes API (computeRoutes), one leg at a time, using the server's Google key.
 * Legs are cached for a day, so a day's route is only recomputed when its stops change.
 */
@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** The route for one leg, or null when Google finds none (e.g. no transit there). */
  async computeLeg(req: LegRequest): Promise<LegResult | null> {
    const arrival =
      req.mode === 'TRANSIT' && req.arrivalTime ? req.arrivalTime.toISOString().slice(0, 13) : '';
    const key = `routes:${req.mode}:${round(req.from.lat)},${round(req.from.lng)}:${round(req.to.lat)},${round(req.to.lng)}:${arrival}`;
    const hit = await this.cache.get<{ leg: LegResult | null }>(key);
    if (hit) return hit.leg;

    const body: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: req.from.lat, longitude: req.from.lng } } },
      destination: { location: { latLng: { latitude: req.to.lat, longitude: req.to.lng } } },
      travelMode: req.mode,
      polylineQuality: 'OVERVIEW',
      languageCode: 'en',
    };
    if (req.mode === 'TRANSIT' && req.arrivalTime) body.arrivalTime = req.arrivalTime.toISOString();

    const data = await this.post(body);
    const route = data.routes?.[0];
    const leg: LegResult | null = route
      ? {
          distanceMeters: route.distanceMeters ?? 0,
          durationSeconds: Number.parseInt(route.duration ?? '0', 10) || 0,
          polyline: route.polyline?.encodedPolyline ?? null,
          transitSummary: req.mode === 'TRANSIT' ? this.transitSummary(route) : null,
        }
      : null;
    await this.cache.set(key, { leg }, ROUTE_TTL_MS);
    return leg;
  }

  private transitSummary(route: GoogleRoute): string | null {
    const rides = (route.legs ?? [])
      .flatMap((l) => l.steps ?? [])
      .filter((s) => s.travelMode === 'TRANSIT' && s.transitDetails)
      .map(({ transitDetails: t }) => {
        const line = t?.transitLine;
        const vehicle = VEHICLES[line?.vehicle?.type ?? ''] ?? 'Line';
        const name = line?.nameShort || line?.name || '';
        const stops = t?.stopCount ? ` (${t.stopCount} stop${t.stopCount === 1 ? '' : 's'})` : '';
        return `${vehicle}${name ? ` ${name}` : ''}${stops}`;
      });
    return rides.length ? rides.join(' → ') : 'On foot';
  }

  private async post(body: unknown): Promise<{ routes?: GoogleRoute[] }> {
    const apiKey = this.config.get<string>('GOOGLE_PLACES_API_KEY');
    if (!apiKey) throw new ServiceUnavailableException('Google API key is not configured');
    let res: Response;
    try {
      res = await fetch(ROUTES_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': FIELD_MASK,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn(`Google Routes request failed: ${(err as Error).message}`);
      throw new BadGatewayException('Google Routes did not respond, please try again');
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      // Log Google's message for us; never pass it (or the key) to the client.
      this.logger.warn(`Google Routes ${res.status}: ${text}`);
      if (
        res.status === 403 &&
        /SERVICE_DISABLED|has not been used|is disabled|not enabled|blocked/i.test(text)
      ) {
        throw new ServiceUnavailableException(
          'The Google Routes API is not enabled for this API key. Enable "Routes API" in Google Cloud Console.',
        );
      }
      throw new BadGatewayException('Google Routes returned an error, please try again later');
    }
    return (await res.json()) as { routes?: GoogleRoute[] };
  }
}
