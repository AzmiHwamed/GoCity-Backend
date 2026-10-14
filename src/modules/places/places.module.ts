import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { PlacesController } from './places.controller';
import { PlacesService } from './places.service';

@Module({
  // In-memory cache of Google responses (10 min searches, 1 day details/photos) to save quota.
  imports: [CacheModule.register({ max: 2000 })],
  controllers: [PlacesController],
  providers: [PlacesService],
  exports: [PlacesService],
})
export class PlacesModule {}
