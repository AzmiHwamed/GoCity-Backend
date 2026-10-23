import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Cache } from 'cache-manager';
import { Repository } from 'typeorm';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { PlacePhotoDto } from '../places/dto';
import { PlacesService } from '../places/places.service';
import { TripAccessService } from '../trips/access/trip-access.service';
import { TripMember } from '../trips/entities/trip-member.entity';
import { Trip } from '../trips/entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { AiraloService } from './airalo.service';
import {
  CountryDto,
  CreateEsimPlanDto,
  EsimListDto,
  EsimPlanDto,
  FlightOfferDto,
  FlightPlaceDto,
  FlightPricesDto,
  FlightPricesQueryDto,
  FlightRouteDto,
  FlightSearchLinkDto,
  FlightSearchQueryDto,
  TravellerDto,
  TravellerFlightsDto,
  TripBookingDto,
  TripFlightsDto,
  UpdateEsimPlanDto,
} from './dto';
import { EsimPlan } from './entities/esim-plan.entity';
import { TravelpayoutsDataService, countryName } from './travelpayouts-data.service';

const PRICES_URL = 'https://api.travelpayouts.com/aviasales/v3/prices_for_dates';
const AVIASALES = 'https://www.aviasales.com';
const PRICES_TTL_MS = 10 * 60 * 1000;
const TRIP_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 10000;
const favicon = (domain: string) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
const FLIGHTS_PROVIDER = { name: 'Aviasales / Travelpayouts', logoUrl: favicon('aviasales.com') };
const ESIM_LOGOS: Record<string, string> = {
  airalo: favicon('airalo.com'),
  holafly: favicon('holafly.com'),
};
/** EU/EEA: an EU phone plan usually roams here at home prices ("roam like at home"). */
const EU_EEA = new Set(
  'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE IS LI NO'.split(
    ' ',
  ),
);

interface TpPrice {
  origin_airport?: string;
  destination_airport?: string;
  price?: number;
  airline?: string;
  flight_number?: string | number;
  departure_at?: string;
  return_at?: string;
  transfers?: number;
  return_transfers?: number;
  duration_to?: number;
  duration_back?: number;
  link?: string;
}
type Offers = Pick<FlightPricesDto, 'pricesAvailable' | 'message' | 'datesMatched' | 'offers'>;

/** Every ISO country name → code ("portugal" → PT), for eSIM lookups by name. */
const COUNTRY_CODES = (() => {
  const map = new Map<string, string>();
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const a of letters)
    for (const b of letters) {
      const name = countryName(a + b);
      if (name && name !== a + b) map.set(name.toLowerCase(), a + b);
    }
  return map;
})();
const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * Flights (Travelpayouts / Aviasales) and travel eSIMs, with the pictures and details a booking
 * screen needs: airline logos, city and airport names, destination photos, country flags, eSIM
 * plans, and per-traveller flights from each member's home airport.
 */
@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly data: TravelpayoutsDataService,
    private readonly places: PlacesService,
    private readonly access: TripAccessService,
    private readonly airalo: AiraloService,
    @InjectRepository(EsimPlan) private readonly plansRepo: Repository<EsimPlan>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  searchPlaces(term: string): Promise<FlightPlaceDto[]> {
    return this.data.search(term);
  }

  // ── Flights ───────────────────────────────────────────────

  /** Live prices for a route, cheapest first, with airline details and destination photos. */
  async prices(q: FlightPricesQueryDto): Promise<FlightPricesDto> {
    const currency = q.currency ?? 'EUR';
    const route = await this.route(q);
    const [photos, offers] = await Promise.all([
      this.photosFor(route.destination),
      this.offers(q, currency),
    ]);
    return {
      provider: FLIGHTS_PROVIDER,
      route,
      destinationPhotos: photos,
      currency,
      searchUrl: this.searchUrl(q),
      ...offers,
    };
  }

  /** A partner search page for the route (no token needed). */
  async flightLink(q: FlightSearchQueryDto): Promise<FlightSearchLinkDto> {
    const route = await this.route(q);
    const from = route.origin?.cityName ?? route.origin?.name ?? route.originCode;
    const to = route.destination?.cityName ?? route.destination?.name ?? route.destinationCode;
    return {
      provider: FLIGHTS_PROVIDER,
      route,
      title: `Flights from ${from} to ${to}`,
      description:
        'Compare available flight options and complete your booking with a travel partner.',
      ctaLabel: 'Search flights',
      url: this.searchUrl(q),
    };
  }

  // ── eSIMs ─────────────────────────────────────────────────

  /**
   * eSIMs for a country (code or name): its flag and photos, real plans (live from Airalo when
   * connected, otherwise the ones GoCity admins listed), and the partners' pages for it.
   */
  async esims(country?: string): Promise<EsimListDto> {
    const c = this.country(country);
    const [photos, plans] = c
      ? await Promise.all([this.photos(c.name), this.plansFor(c.code)])
      : [[], { plans: [], source: 'none' as const }];
    const slug = c ? slugify(c.name) : null;
    const place = c?.name ?? country?.trim() ?? 'your destination';
    const eu = c && EU_EEA.has(c.code);
    const message = !c
      ? null
      : plans.plans.length
        ? plans.source === 'manual'
          ? 'Plans listed by GoCity; check the partner page for the current price.'
          : null
        : `No plans listed for ${c.name} yet. Browse the partners below.`;
    return {
      country: c,
      photos,
      plans: plans.plans,
      plansSource: plans.source,
      message: eu
        ? [
            message,
            'EU/EEA: if your phone plan is from the EU, it may already roam here at home prices.',
          ]
            .filter(Boolean)
            .join(' ')
        : message,
      items: [
        {
          provider: 'Airalo',
          providerLogo: ESIM_LOGOS.airalo,
          title: `eSIM for ${place}`,
          description: c
            ? `Local data plans for ${c.name}. Install before you leave, switch on when you land.`
            : 'Install a digital SIM before departure and connect when you land.',
          highlights: this.highlights('airalo', plans.plans, eu),
          ctaLabel: c ? `See ${c.name} plans on Airalo` : 'Browse Airalo eSIMs',
          url: slug ? `https://www.airalo.com/${slug}-esim` : 'https://www.airalo.com/',
        },
        {
          provider: 'Holafly',
          providerLogo: ESIM_LOGOS.holafly,
          title: `Travel eSIM for ${place}`,
          description: c
            ? `Day-based data passes for ${c.name}, often with unlimited data.`
            : 'Explore travel data plans for your next destination.',
          highlights: this.highlights('holafly', plans.plans, eu),
          ctaLabel: c ? `See ${c.name} plans on Holafly` : 'Browse Holafly eSIMs',
          url: slug ? `https://esim.holafly.com/esim-${slug}/` : 'https://esim.holafly.com/',
        },
      ],
    };
  }

  /** Admin: plans as stored (optionally one country), newest first. */
  listPlans(country?: string): Promise<EsimPlan[]> {
    return this.plansRepo.find({
      where: country ? { countryCode: country } : {},
      order: { countryCode: 'ASC', price: 'ASC', id: 'DESC' },
    });
  }

  createPlan(dto: CreateEsimPlanDto): Promise<EsimPlan> {
    return this.plansRepo.save(
      this.plansRepo.create({
        ...dto,
        dataMb: dto.isUnlimited ? null : (dto.dataMb ?? null),
        isUnlimited: dto.isUnlimited ?? false,
        notes: dto.notes ?? null,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updatePlan(id: number, dto: UpdateEsimPlanDto): Promise<EsimPlan> {
    const plan = await this.plansRepo.findOne({ where: { id } });
    if (!plan) throw new NotFoundException(`eSIM plan #${id} not found`);
    Object.assign(plan, Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)));
    if (plan.isUnlimited) plan.dataMb = null;
    return this.plansRepo.save(plan);
  }

  async deletePlan(id: number): Promise<void> {
    const res = await this.plansRepo.delete(id);
    if (!res.affected) throw new NotFoundException(`eSIM plan #${id} not found`);
  }

  // ── Trips ─────────────────────────────────────────────────

  /**
   * Booking defaults for a trip: destination airport/city, dates, travellers, photos and eSIMs.
   * Cached per trip; a change to the trip (city, dates…) gives a fresh result.
   */
  async forTrip(tripId: number, user: AuthUser, shareCode?: string): Promise<TripBookingDto> {
    const trip = await this.access.assertCanView(tripId, user, shareCode);
    const key = `booking:trip:${trip.id}:${new Date(trip.updatedAt).getTime()}`;
    let base = await this.cache.get<Omit<TripBookingDto, 'myHomeAirport'>>(key);
    if (!base) {
      const destination = await this.destinationOf(trip);
      const country =
        this.country(destination?.countryCode ?? undefined) ??
        this.country(trip.country ?? undefined);
      const [photos, esims] = await Promise.all([
        trip.city ? this.photos([trip.city, trip.country].filter(Boolean).join(', ')) : [],
        this.esims(country?.code),
      ]);
      base = {
        tripId: trip.id,
        tripName: trip.name,
        destination,
        departDate: trip.startDate,
        returnDate: trip.endDate,
        adults: trip.travelersCount ?? 1,
        country,
        photos,
        esims,
      };
      await this.cache.set(key, base, TRIP_TTL_MS);
    }
    const me = await this.users.findOne({
      where: { id: user.id },
      select: { id: true, homeAirportCode: true },
    });
    return {
      ...base,
      myHomeAirport: me?.homeAirportCode ? await this.data.place(me.homeAirportCode) : null,
    };
  }

  /**
   * Flights for every trip member from their own home airport, for the trip dates. Members
   * sharing an airport are one group (prices for all of them).
   */
  async tripFlights(
    tripId: number,
    user: AuthUser,
    currency = 'EUR',
    shareCode?: string,
  ): Promise<TripFlightsDto> {
    const trip = await this.access.assertCanView(tripId, user, shareCode);
    const [destination, members] = await Promise.all([
      this.destinationOf(trip),
      this.members.find({
        where: { tripId: trip.id },
        relations: { user: true },
        order: { id: 'ASC' },
      }),
    ]);
    const travellers: TravellerDto[] = members
      .filter((m) => m.user)
      .map((m) => ({
        userId: m.userId,
        firstName: m.user!.firstName,
        lastName: m.user!.lastName,
        avatarUrl: m.user!.avatar?.url ?? null,
        isMe: m.userId === user.id,
        homeAirportCode: m.user!.homeAirportCode ?? null,
      }));

    const withoutAirport = travellers.filter((t) => !t.homeAirportCode);
    const located = await Promise.all(
      travellers
        .filter((t) => t.homeAirportCode)
        .map(async (t) => ({ t, origin: await this.data.place(t.homeAirportCode as string) })),
    );
    // Same city as the destination (e.g. LIS airport and LIS city): no flight needed.
    const atDestination = located
      .filter(
        ({ t, origin }) =>
          destination &&
          [origin?.code, origin?.cityCode, t.homeAirportCode].includes(destination.code),
      )
      .map(({ t }) => t);
    const byOrigin = new Map<
      string,
      { origin: FlightPlaceDto | null; travellers: TravellerDto[] }
    >();
    for (const { t, origin } of located) {
      if (atDestination.includes(t)) continue;
      const code = t.homeAirportCode as string;
      const group = byOrigin.get(code) ?? { origin, travellers: [] };
      group.travellers.push(t);
      byOrigin.set(code, group);
    }

    const groups: TravellerFlightsDto[] = destination
      ? await Promise.all(
          [...byOrigin.entries()].map(async ([code, g]) => {
            const q = {
              origin: code,
              destination: destination.code,
              departDate: trip.startDate,
              returnDate: trip.endDate,
              adults: g.travellers.length,
              limit: 3,
            };
            const offers = await this.offers(q, currency);
            return {
              origin: g.origin,
              originCode: code,
              travellers: g.travellers,
              ...offers,
              offers: offers.offers.slice(0, 3),
              searchUrl: this.searchUrl(q),
            };
          }),
        )
      : [];
    // Me first, then by price.
    groups.sort(
      (a, b) =>
        Number(b.travellers.some((t) => t.isMe)) - Number(a.travellers.some((t) => t.isMe)) ||
        (a.offers[0]?.price ?? Infinity) - (b.offers[0]?.price ?? Infinity),
    );
    return {
      destination,
      departDate: trip.startDate,
      returnDate: trip.endDate,
      currency,
      groups,
      withoutAirport: destination
        ? withoutAirport
        : [...withoutAirport, ...located.map((l) => l.t)],
      atDestination,
    };
  }

  // ──────────────────────────────────────────────────────────

  private destinationOf(trip: Trip): Promise<FlightPlaceDto | null> {
    return trip.city
      ? this.data.matchCity(trip.city, {
          lat: trip.cityLatitude,
          lng: trip.cityLongitude,
          country: trip.country,
        })
      : Promise.resolve(null);
  }

  /** Offers for a route; falls back to the month when the exact dates have nothing cached. */
  private async offers(q: FlightPricesQueryDto, currency: string): Promise<Offers> {
    const token = this.config.get<string>('TRAVELPAYOUTS_TOKEN');
    if (!token) {
      return {
        pricesAvailable: false,
        message:
          'Live prices are not set up yet (TRAVELPAYOUTS_TOKEN). Use the search link instead.',
        datesMatched: 'exact',
        offers: [],
      };
    }
    try {
      let offers = await this.fetchOffers(q, currency, token);
      // Prices are cached by the partner and often missing for an exact day: try the month(s).
      const month = (d?: string) => d?.slice(0, 7);
      if (!offers.length && (q.departDate.length > 7 || (q.returnDate?.length ?? 0) > 7)) {
        offers = await this.fetchOffers(
          { ...q, departDate: month(q.departDate)!, returnDate: month(q.returnDate) },
          currency,
          token,
        );
        if (offers.length) {
          const label = new Date(`${month(q.departDate)}-01T00:00:00Z`).toLocaleDateString('en', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          });
          return {
            pricesAvailable: true,
            message: `No prices for these exact dates yet. Cheapest found in ${label}.`,
            datesMatched: 'month',
            offers,
          };
        }
      }
      return {
        pricesAvailable: true,
        message: offers.length ? null : 'No cached prices for these dates. Try the search link.',
        datesMatched: 'exact',
        offers,
      };
    } catch (err) {
      this.logger.warn(`Travelpayouts prices failed: ${(err as Error).message}`);
      return {
        pricesAvailable: false,
        message: 'Live prices are unavailable right now. Use the search link instead.',
        datesMatched: 'exact',
        offers: [],
      };
    }
  }

  /** Live Airalo plans when connected, otherwise active admin-listed plans. */
  private async plansFor(
    code: string,
  ): Promise<{ plans: EsimPlanDto[]; source: EsimListDto['plansSource'] }> {
    const live = await this.airalo.plans(code);
    if (live.length) return { plans: live, source: 'airalo_api' };
    const rows = await this.plansRepo.find({
      where: { countryCode: code, isActive: true },
      order: { price: 'ASC' },
    });
    if (!rows.length) return { plans: [], source: 'none' };
    return {
      source: 'manual',
      plans: rows.map((p) => ({
        id: p.id,
        provider: p.provider,
        providerLogo: ESIM_LOGOS[p.provider.toLowerCase()] ?? null,
        network: null,
        title: p.title,
        dataMb: p.dataMb,
        isUnlimited: p.isUnlimited,
        dataLabel: p.isUnlimited
          ? 'Unlimited'
          : p.dataMb != null
            ? p.dataMb >= 1024
              ? `${+(p.dataMb / 1024).toFixed(1)} GB`
              : `${p.dataMb} MB`
            : null,
        validityDays: p.validityDays,
        price: p.price,
        currency: p.currency,
        url: p.url,
        notes: p.notes,
        source: 'manual',
        checkedAt: new Date(p.updatedAt).toISOString(),
      })),
    };
  }

  /** Card highlights from the provider's real plans when there are some. */
  private highlights(provider: string, plans: EsimPlanDto[], eu: boolean | null): string[] {
    const own = plans.filter((p) => p.provider.toLowerCase() === provider);
    if (own.length) {
      const cheapest = own[0];
      const days = own.map((p) => p.validityDays);
      return [
        `From ${new Intl.NumberFormat('en', { style: 'currency', currency: cheapest.currency }).format(cheapest.price)}`,
        `${own.length} plan${own.length === 1 ? '' : 's'} · ${Math.min(...days)}–${Math.max(...days)} days`,
        own.some((p) => p.isUnlimited)
          ? 'Unlimited data available'
          : `Up to ${
              own
                .map((p) => p.dataLabel)
                .filter(Boolean)
                .at(-1) ?? 'several GB'
            }`,
      ];
    }
    const base =
      provider === 'airalo'
        ? ['Instant delivery', 'No physical SIM', 'Data plans by GB']
        : ['Digital activation', 'Unlimited-data passes', 'Keep your main SIM'];
    return eu ? [...base.slice(0, 2), 'Compare with EU roaming first'] : base;
  }

  private async route(q: FlightSearchQueryDto): Promise<FlightRouteDto> {
    const [origin, destination] = await Promise.all([
      this.data.place(q.origin),
      this.data.place(q.destination),
    ]);
    return {
      origin,
      destination,
      originCode: q.origin,
      destinationCode: q.destination,
      departDate: q.departDate,
      returnDate: q.returnDate ?? null,
      adults: q.adults ?? 1,
    };
  }

  private searchUrl(q: FlightSearchQueryDto): string {
    const p = new URLSearchParams({
      origin: q.origin,
      destination: q.destination,
      depart_date: q.departDate,
      adults: String(q.adults ?? 1),
    });
    if (q.returnDate) p.set('return_date', q.returnDate);
    return this.withMarker(`${AVIASALES}/search?${p}`);
  }

  private withMarker(url: string): string {
    const marker = this.config.get<string>('TRAVELPAYOUTS_MARKER');
    if (!marker) return url;
    const u = new URL(url);
    u.searchParams.set('marker', marker);
    return u.toString();
  }

  private async fetchOffers(
    q: FlightPricesQueryDto,
    currency: string,
    token: string,
  ): Promise<FlightOfferDto[]> {
    const p = new URLSearchParams({
      origin: q.origin,
      destination: q.destination,
      departure_at: q.departDate,
      currency: currency.toLowerCase(),
      sorting: 'price',
      unique: 'false',
      limit: String(q.limit ?? 10),
      one_way: q.returnDate ? 'false' : 'true',
    });
    if (q.returnDate) p.set('return_at', q.returnDate);
    const key = `booking:prices:${p}`;
    let rows = await this.cache.get<TpPrice[]>(key);
    if (!rows) {
      p.set('token', token);
      const res = await fetch(`${PRICES_URL}?${p}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { success?: boolean; data?: TpPrice[] };
      if (body.success === false) throw new Error('success=false');
      rows = body.data ?? [];
      await this.cache.set(key, rows, PRICES_TTL_MS);
    }
    return Promise.all(
      rows
        .filter((r) => r.price != null && r.departure_at)
        .map(async (r): Promise<FlightOfferDto> => {
          const airline = await this.data.airline(r.airline);
          return {
            price: r.price as number,
            currency,
            airline,
            flightNumber:
              r.flight_number != null && r.airline ? `${r.airline}${r.flight_number}` : null,
            departureAt: r.departure_at as string,
            returnAt: r.return_at ?? null,
            departureDate: (r.departure_at as string).slice(0, 10),
            returnDate: r.return_at?.slice(0, 10) ?? null,
            originAirport: r.origin_airport ?? null,
            destinationAirport: r.destination_airport ?? null,
            stops: r.transfers ?? 0,
            returnStops: r.return_at ? (r.return_transfers ?? 0) : null,
            durationMinutes: r.duration_to ?? null,
            returnDurationMinutes: r.return_at ? (r.duration_back ?? null) : null,
            bookingUrl: r.link
              ? this.withMarker(`${AVIASALES}${r.link.startsWith('/') ? '' : '/'}${r.link}`)
              : this.searchUrl(q),
            ctaLabel: 'View flight',
          };
        }),
    );
  }

  private photosFor(place: FlightPlaceDto | null): Promise<PlacePhotoDto[]> {
    const city = place?.cityName ?? place?.name;
    return city
      ? this.photos([city, place?.countryName].filter(Boolean).join(', '))
      : Promise.resolve([]);
  }

  /** Google photos, or none when Google is unavailable (pictures are a bonus, not required). */
  private async photos(query: string): Promise<PlacePhotoDto[]> {
    try {
      return await this.places.placePhotos(query, 5);
    } catch (err) {
      this.logger.warn(`No photos for "${query}": ${(err as Error).message}`);
      return [];
    }
  }

  private country(input?: string): CountryDto | null {
    const value = input?.trim();
    if (!value) return null;
    const code = /^[a-z]{2}$/i.test(value)
      ? value.toUpperCase()
      : COUNTRY_CODES.get(value.toLowerCase());
    const name = code ? countryName(code) : null;
    if (!code || !name || name === code) return null;
    return {
      code,
      name,
      flagEmoji: String.fromCodePoint(...[...code].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)),
      flagUrl: `https://flagcdn.com/w160/${code.toLowerCase()}.png`,
    };
  }
}
