import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { PlacesModule } from '../places/places.module';
import { UsersModule } from '../users/users.module';
import { TripAccessService } from './access/trip-access.service';
import { TripRoleGuard } from './access/trip-role.guard';
import { TripActivitiesController } from './controllers/trip-activities.controller';
import { TripIdeasController } from './controllers/trip-ideas.controller';
import {
  MyInvitationsController,
  TripInvitationsController,
} from './controllers/trip-invitations.controller';
import { TripMembersController } from './controllers/trip-members.controller';
import { TripsController } from './controllers/trips.controller';
import { UserProfilesController } from './controllers/user-profiles.controller';
import { TripGalleryController } from './controllers/trip-gallery.controller';
import { TripExpensesController } from './controllers/trip-expenses.controller';
import { IdeaVote } from './entities/idea-vote.entity';
import { TripActivity } from './entities/trip-activity.entity';
import { TripIdea } from './entities/trip-idea.entity';
import { TripInvitation } from './entities/trip-invitation.entity';
import { TripMember } from './entities/trip-member.entity';
import { TripExpense } from './entities/trip-expense.entity';
import { TripTip } from './entities/trip-tip.entity';
import { Trip } from './entities/trip.entity';
import { Media } from '../media/entities/media.entity';
import { TripActivitiesService } from './services/trip-activities.service';
import { TripIdeasService } from './services/trip-ideas.service';
import { TripInvitationsService } from './services/trip-invitations.service';
import { TripMembersService } from './services/trip-members.service';
import { TripExpensesService } from './services/trip-expenses.service';
import { TripGalleryService } from './services/trip-gallery.service';
import { TripsService } from './services/trips.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Trip,
      TripMember,
      TripInvitation,
      TripActivity,
      TripIdea,
      IdeaVote,
      TripTip,
      TripExpense,
      Media,
    ]),
    UsersModule,
    MailModule,
    MediaModule,
    PlacesModule,
    NotificationsModule,
  ],
  controllers: [
    TripsController,
    TripMembersController,
    TripInvitationsController,
    MyInvitationsController,
    TripActivitiesController,
    TripIdeasController,
    UserProfilesController,
    TripGalleryController,
    TripExpensesController,
  ],
  providers: [
    TripAccessService,
    TripRoleGuard,
    TripsService,
    TripGalleryService,
    TripExpensesService,
    TripMembersService,
    TripInvitationsService,
    TripActivitiesService,
    TripIdeasService,
  ],
  // For features that live inside a trip (e.g. chat): reuse @TripRole + TripRoleGuard.
  exports: [TripAccessService, TripRoleGuard, TypeOrmModule],
})
export class TripsModule {}
