import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Media } from '../media/entities/media.entity';
import { PlacesModule } from '../places/places.module';
import { TripActivity } from '../trips/entities/trip-activity.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripsModule } from '../trips/trips.module';
import { Favorite } from './entities/favorite.entity';
import { FavoritesController } from './favorites.controller';
import { FavoritesService } from './favorites.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Favorite, Trip, TripActivity, Media]),
    TripsModule, // TripAccessService: who can see a trip
    PlacesModule,
  ],
  controllers: [FavoritesController],
  providers: [FavoritesService],
})
export class FavoritesModule {}
