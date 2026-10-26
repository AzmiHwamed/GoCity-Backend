/**
 * Development data for the Discover feeds and trip workspace.
 * Usage: npm run seed:demo
 *
 * Safe to run repeatedly: it updates the named demo accounts/trips instead of adding duplicates.
 * All demo accounts use the password from DEMO_PASSWORD, or `DemoPass123!` by default.
 */
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import dataSource from '../data-source';
import { SALT_ROUNDS } from '../../modules/users/users.service';
import { User, UserRole } from '../../modules/users/entities/user.entity';
import { Trip } from '../../modules/trips/entities/trip.entity';
import { TripActivity } from '../../modules/trips/entities/trip-activity.entity';
import { TripExpense } from '../../modules/trips/entities/trip-expense.entity';
import { TripMember } from '../../modules/trips/entities/trip-member.entity';
import { TripTip } from '../../modules/trips/entities/trip-tip.entity';
import {
  ActivityKind,
  ExpenseCategory,
  Transportation,
  TripMemberRole,
  TripVisibility,
} from '../../modules/trips/trip.enums';

type DemoUser = Pick<User, 'firstName' | 'lastName' | 'email' | 'role'> &
  Partial<Pick<User, 'organizationName' | 'organizationLocationName' | 'organizationLatitude' | 'organizationLongitude'>>;

type DemoTrip = Omit<Partial<Trip>, 'ownerId'> & {
  name: string;
  ownerEmail: string;
  startDate: string;
  endDate: string;
  city: string;
  cityPlaceId: string;
  country: string;
  visibility: TripVisibility;
};

const seedCode = (prefix: string, ownerId: number, name: string) =>
  `${prefix}${createHash('sha256').update(`${ownerId}:${name}`).digest('hex').slice(0, 14)}`;

const users: DemoUser[] = [
  { firstName: 'Maya', lastName: 'Santos', email: 'maya@example.test', role: UserRole.USER },
  { firstName: 'Noah', lastName: 'Bennett', email: 'noah@example.test', role: UserRole.USER },
  { firstName: 'Amina', lastName: 'Khaled', email: 'amina@example.test', role: UserRole.USER },
  {
    firstName: 'Sofia', lastName: 'Marin', email: 'hello@mediterraneo.example.test', role: UserRole.ORGANIZATION,
    organizationName: 'Mediterráneo Escapes', organizationLocationName: 'Amalfi, Italy', organizationLatitude: 40.634, organizationLongitude: 14.6027,
  },
  {
    firstName: 'Youssef', lastName: 'Ben Ali', email: 'team@atlas.example.test', role: UserRole.ORGANIZATION,
    organizationName: 'Atlas City Breaks', organizationLocationName: 'Marrakech, Morocco', organizationLatitude: 31.6295, organizationLongitude: -7.9811,
  },
  ...Array.from({ length: 24 }, (_, index) => ({
    firstName: ['Emma', 'Leo', 'Nina', 'Omar', 'Clara', 'Hugo'][index % 6],
    lastName: ['Wilson', 'Martin', 'Costa', 'Haddad', 'Rossi', 'Kim'][Math.floor(index / 6) % 6],
    email: `traveller${index + 1}@example.test`,
    role: UserRole.USER,
  })),
  ...Array.from({ length: 6 }, (_, index) => ({
    firstName: ['Elena', 'Rami', 'Lucia', 'Theo', 'Sara', 'Milo'][index],
    lastName: 'Travel Team',
    email: `agency${index + 1}@example.test`,
    role: UserRole.ORGANIZATION,
    organizationName: ['Coastal Stories', 'Northern Lights Co.', 'City Weekend Club', 'Alpine Routes', 'Nomad Notes', 'Island Pace'][index],
    organizationLocationName: ['Barcelona, Spain', 'Reykjavík, Iceland', 'Paris, France', 'Innsbruck, Austria', 'Istanbul, Türkiye', 'Athens, Greece'][index],
  })),
];

const trips: DemoTrip[] = [
  {
    name: 'Lisbon after the rain', ownerEmail: 'maya@example.test', startDate: '2026-11-12', endDate: '2026-11-15',
    city: 'Lisbon', cityPlaceId: 'demo-lisbon', country: 'Portugal', cityLatitude: 38.7223, cityLongitude: -9.1393,
    travelersCount: 2, budgetPerPerson: 420, hotelName: 'Baixa House', visibility: TripVisibility.PRIVATE,
    story: 'A slow four-day plan for tiled streets, miradouros and late dinners.',
  },
  {
    name: 'Our Lisbon trip', ownerEmail: 'noah@example.test', startDate: '2026-12-03', endDate: '2026-12-06',
    city: 'Lisbon', cityPlaceId: 'demo-lisbon', country: 'Portugal', cityLatitude: 38.7223, cityLongitude: -9.1393,
    travelersCount: 3, budgetPerPerson: 460, hotelName: 'Alfama Loft', visibility: TripVisibility.PUBLIC,
    story: 'A local-food-first Lisbon weekend, with room to wander.', actualSpentPerPerson: 438,
  },
  {
    name: 'Amalfi Coast, unhurried', ownerEmail: 'hello@mediterraneo.example.test', startDate: '2027-05-08', endDate: '2027-05-13',
    city: 'Amalfi', cityPlaceId: 'demo-amalfi', country: 'Italy', cityLatitude: 40.634, cityLongitude: 14.6027,
    travelersCount: 8, budgetPerPerson: 980, hotelName: 'Casa Marina', visibility: TripVisibility.PUBLIC,
    story: 'Five sun-washed days between Amalfi, Ravello and a long lunch in Cetara.',
  },
  {
    name: 'Marrakech at golden hour', ownerEmail: 'team@atlas.example.test', startDate: '2027-03-18', endDate: '2027-03-22',
    city: 'Marrakech', cityPlaceId: 'demo-marrakech', country: 'Morocco', cityLatitude: 31.6295, cityLongitude: -7.9811,
    travelersCount: 10, budgetPerPerson: 610, hotelName: 'Riad Atlas', visibility: TripVisibility.PUBLIC,
    story: 'A small-group city break built around gardens, makers and rooftops.',
  },
  {
    name: 'Kyoto in blossom season', ownerEmail: 'amina@example.test', startDate: '2027-04-02', endDate: '2027-04-06',
    city: 'Kyoto', cityPlaceId: 'demo-kyoto', country: 'Japan', cityLatitude: 35.0116, cityLongitude: 135.7681,
    travelersCount: 2, budgetPerPerson: 1180, hotelName: 'Gion Corner House', visibility: TripVisibility.PUBLIC,
    story: 'Early temples, quiet alleys and a spring picnic by the canal.',
  },
  ...Array.from({ length: 90 }, (_, index): DemoTrip => {
    const destinations = [
      { city: 'Barcelona', placeId: 'demo-barcelona', country: 'Spain', latitude: 41.3874, longitude: 2.1686 },
      { city: 'Paris', placeId: 'demo-paris', country: 'France', latitude: 48.8566, longitude: 2.3522 },
      { city: 'Rome', placeId: 'demo-rome', country: 'Italy', latitude: 41.9028, longitude: 12.4964 },
      { city: 'Istanbul', placeId: 'demo-istanbul', country: 'Türkiye', latitude: 41.0082, longitude: 28.9784 },
      { city: 'Reykjavík', placeId: 'demo-reykjavik', country: 'Iceland', latitude: 64.1466, longitude: -21.9426 },
      { city: 'Athens', placeId: 'demo-athens', country: 'Greece', latitude: 37.9838, longitude: 23.7275 },
      { city: 'Prague', placeId: 'demo-prague', country: 'Czechia', latitude: 50.0755, longitude: 14.4378 },
      { city: 'Seville', placeId: 'demo-seville', country: 'Spain', latitude: 37.3891, longitude: -5.9845 },
      { city: 'Lisbon', placeId: 'demo-lisbon', country: 'Portugal', latitude: 38.7223, longitude: -9.1393 },
      { city: 'Marrakech', placeId: 'demo-marrakech', country: 'Morocco', latitude: 31.6295, longitude: -7.9811 },
    ];
    const destination = destinations[index % destinations.length];
    const agency = index % 3 === 0;
    const ownerEmail = agency
      ? `agency${(index % 6) + 1}@example.test`
      : `traveller${(index % 24) + 1}@example.test`;
    const day = String((index % 25) + 1).padStart(2, '0');
    const duration = 2 + (index % 5);
    const endDay = String(Math.min(Number(day) + duration - 1, 28)).padStart(2, '0');
    const visibility = index % 17 === 0 ? TripVisibility.LINK : index % 13 === 0 ? TripVisibility.PRIVATE : TripVisibility.PUBLIC;
    return {
      name: `${destination.city} ${agency ? 'guided escape' : 'weekend notes'} #${index + 1}`,
      ownerEmail,
      startDate: `2027-${String((index % 10) + 1).padStart(2, '0')}-${day}`,
      endDate: `2027-${String((index % 10) + 1).padStart(2, '0')}-${endDay}`,
      city: destination.city,
      cityPlaceId: destination.placeId,
      country: destination.country,
      cityLatitude: destination.latitude,
      cityLongitude: destination.longitude,
      travelersCount: agency ? 6 + (index % 9) : 1 + (index % 4),
      budgetPerPerson: 260 + (index % 8) * 115,
      hotelName: `${destination.city} Stay ${index + 1}`,
      visibility,
      story: agency
        ? `A local team’s ${duration}-day route through ${destination.city}, with the essentials thoughtfully arranged.`
        : `A personal ${duration}-day plan for the corners of ${destination.city} worth slowing down for.`,
    };
  }),
];

async function seedDemo() {
  await dataSource.initialize();
  if ((process.env.DB_SYNCHRONIZE ?? 'true') === 'true') await dataSource.synchronize();
  try {
    const password = process.env.DEMO_PASSWORD ?? 'DemoPass123!';
    if (password.length < 8) throw new Error('DEMO_PASSWORD must be at least 8 characters');
    const [userRepo, tripRepo, memberRepo, activityRepo, expenseRepo, tipRepo] = [
      dataSource.getRepository(User), dataSource.getRepository(Trip), dataSource.getRepository(TripMember),
      dataSource.getRepository(TripActivity), dataSource.getRepository(TripExpense), dataSource.getRepository(TripTip),
    ];
    const saveMembership = async (tripId: number, userId: number, role: TripMemberRole) => {
      const existing = await memberRepo.findOne({ where: { tripId, userId } });
      return memberRepo.save(existing ? Object.assign(existing, { role }) : memberRepo.create({ tripId, userId, role }));
    };

    const accounts = new Map<string, User>();
    for (const input of users) {
      const email = input.email.toLowerCase();
      let account = await userRepo.findOne({ where: { email }, withDeleted: true });
      if (!account) {
        account = userRepo.create({ ...input, email, password: await bcrypt.hash(password, SALT_ROUNDS), isActive: true });
      } else {
        Object.assign(account, input, { email, isActive: true });
      }
      accounts.set(email, await userRepo.save(account));
    }

    for (const input of trips) {
      const owner = accounts.get(input.ownerEmail)!;
      const { ownerEmail, ...values } = input;
      let trip = await tripRepo.findOne({ where: { ownerId: owner.id, name: input.name } });
      if (!trip) {
        trip = tripRepo.create({
          ...values, ownerId: owner.id, inviteCode: seedCode('i', owner.id, input.name),
          shareCode: input.visibility === TripVisibility.PRIVATE ? null : seedCode('s', owner.id, input.name),
        });
      } else {
        Object.assign(trip, values);
      }
      trip = await tripRepo.save(trip);

      await saveMembership(trip.id, owner.id, TripMemberRole.OWNER);
      if (input.name === 'Lisbon after the rain') {
        const noah = accounts.get('noah@example.test')!;
        await saveMembership(trip.id, noah.id, TripMemberRole.EDITOR);
      }

      await activityRepo.delete({ tripId: trip.id });
      await expenseRepo.delete({ tripId: trip.id });
      await tipRepo.delete({ tripId: trip.id });
      await activityRepo.save([
        activityRepo.create({ tripId: trip.id, createdById: owner.id, kind: ActivityKind.ACTIVITY, name: `Walk through ${input.city}`, description: 'A relaxed first look at the city.', dayNumber: 1, startTime: '10:00:00', endTime: '12:00:00', placeName: `${input.city} old town`, placeId: null, placeLatitude: input.cityLatitude ?? null, placeLongitude: input.cityLongitude ?? null, meetingPointText: null, meetingLatitude: null, meetingLongitude: null, transportation: Transportation.WALK, expense: 0 }),
        activityRepo.create({ tripId: trip.id, createdById: owner.id, kind: ActivityKind.ACTIVITY, name: 'Local dinner', description: 'A table worth lingering over.', dayNumber: Math.min(2, trip.durationDays), startTime: '19:30:00', endTime: '21:30:00', placeName: null, placeId: null, placeLatitude: null, placeLongitude: null, meetingPointText: null, meetingLatitude: null, meetingLongitude: null, transportation: Transportation.WALK, expense: 42 }),
      ]);
      await expenseRepo.save(expenseRepo.create({ tripId: trip.id, title: 'Hotel stay', amount: (input.budgetPerPerson ?? 300) * (input.travelersCount ?? 1) * 0.45, currency: 'EUR', category: ExpenseCategory.HOTEL, date: input.startDate, notes: 'Demo seed', paidById: owner.id, createdById: owner.id, isHotelStay: true }));
      await tipRepo.save([
        tipRepo.create({ tripId: trip.id, position: 0, text: 'Book the first popular stop in advance.' }),
        tipRepo.create({ tripId: trip.id, position: 1, text: 'Leave one afternoon free for spontaneous finds.' }),
      ]);
    }

    console.log(`Seeded ${accounts.size} demo accounts and ${trips.length} trips.`);
    console.log(`Demo password: ${password}`);
    console.log('Sign in as maya@example.test to see Lisbon recommendations in the For you feed.');
  } finally {
    await dataSource.destroy();
  }
}

seedDemo().catch((error: Error) => {
  console.error(error.message);
  process.exit(1);
});
