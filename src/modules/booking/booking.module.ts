import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlacesModule } from '../places/places.module';
import { TripMember } from '../trips/entities/trip-member.entity';
import { TripsModule } from '../trips/trips.module';
import { User } from '../users/entities/user.entity';
import { AiraloService } from './airalo.service';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';
import { EsimPlan } from './entities/esim-plan.entity';
import { TravelpayoutsDataService } from './travelpayouts-data.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EsimPlan, TripMember, User]),
    CacheModule.register({ max: 2000 }), // prices (10 min), trips (1 h), place searches (1 day)
    PlacesModule, // destination photos
    TripsModule, // TripAccessService for the trip endpoints
  ],
  controllers: [BookingController],
  providers: [BookingService, TravelpayoutsDataService, AiraloService],
})
export class BookingModule {}
