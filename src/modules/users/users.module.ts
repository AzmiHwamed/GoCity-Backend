import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { MediaModule } from '../media/media.module';
import { User } from './entities/user.entity';
import { Favorite } from '../favorites/entities/favorite.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Interest } from '../interests/entities/interest.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { LegalModule } from '../legal/legal.module';
import { AdminBootstrapService } from './admin-bootstrap.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, Trip, Favorite, Interest]),
    MediaModule,
    LegalModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, AdminBootstrapService],
  exports: [UsersService],
})
export class UsersModule {}
