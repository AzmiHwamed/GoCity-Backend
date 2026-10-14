import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Paginated } from '../../../common/dto/paginated-response.dto';
import { ResponseTitle } from '../../../common/response/api-response';
import { CurrentUser } from '../../auth/decorators';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import {
  MyTripsQueryDto,
  ProfileTripDto,
  UserProfileDto,
  UserTripsQueryDto,
} from '../dto/sharing.dto';
import { Trip } from '../entities/trip.entity';
import { TripsService } from '../services/trips.service';

/**
 * Profile routes that need trips. The `\d+` in the paths keeps /users/me and /users/search
 * (in UsersController) from ever being read as an id.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserProfilesController {
  constructor(private readonly tripsService: TripsService) {}

  @Get('me/trips')
  @ApiOperation({
    summary: 'My trips (owned and joined) with my role',
    description: 'Filter with role and when=upcoming|past.',
  })
  @ResponseTitle('My trips fetched')
  myTrips(
    @CurrentUser('id') userId: number,
    @Query() query: MyTripsQueryDto,
  ): Promise<Paginated<Trip>> {
    return this.tripsService.findMine(userId, query);
  }

  @Get(':id(\\d+)')
  @ApiOperation({
    summary: "A user's profile",
    description: 'Email, phone and the full trip count are only shown to the user and admins.',
  })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiNotFoundResponse()
  @ResponseTitle('User profile fetched')
  profile(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() viewer: AuthUser,
  ): Promise<UserProfileDto> {
    return this.tripsService.userProfile(id, viewer);
  }

  @Get(':id(\\d+)/trips')
  @ApiOperation({
    summary: "A user's trips",
    description:
      "Other people see only that user's public trips; you and admins see all of them. Each item has the user's role.",
  })
  @ResponseTitle('User trips fetched')
  trips(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() viewer: AuthUser,
    @Query() query: UserTripsQueryDto,
  ): Promise<Paginated<ProfileTripDto>> {
    return this.tripsService.userTrips(id, viewer, query);
  }
}
