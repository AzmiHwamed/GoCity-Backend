import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TripMember } from '../trips/entities/trip-member.entity';
import { Trip } from '../trips/entities/trip.entity';
import { User } from '../users/entities/user.entity';
import { Media } from '../media/entities/media.entity';
import { MediaModule } from '../media/media.module';
import {
  OrganizationProfilesController,
  OrganizationsController,
  PublicProgramsController,
} from './organizations.controller';
import { OrganizationProgram } from './entities/organization-program.entity';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrganizationProgram, Trip, TripMember, User, Media]),
    MediaModule,
  ],
  controllers: [OrganizationsController, PublicProgramsController, OrganizationProfilesController],
  providers: [OrganizationsService],
})
export class OrganizationsModule {}
