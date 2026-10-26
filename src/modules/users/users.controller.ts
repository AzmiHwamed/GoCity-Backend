import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiPayloadTooLargeResponse,
  ApiUnsupportedMediaTypeResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Paginated } from '../../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CurrentUser, Roles } from '../auth/decorators';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { SearchUsersDto, UserSearchResultDto } from './dto/search-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';
import { Trip } from '../trips/entities/trip.entity';
import { UsersService } from './users.service';
import { LegalService } from '../legal/legal.service';
import { ResponseTitle } from '../../common/response/api-response';

// Swagger body schemas for the update routes (all fields optional, avatar is a file).
type SchemaProps = Record<string, Record<string, unknown>>;
const PROFILE_FIELDS: SchemaProps = {
  firstName: { type: 'string', example: 'Jane' },
  lastName: { type: 'string', example: 'Doe' },
  phone: { type: 'string', example: '+447911123456' },
  organizationName: { type: 'string', description: 'Only applied for organizations' },
  aboutMe: { type: 'string', maxLength: 1000 },
  interests: { type: 'array', items: { type: 'string' }, maxItems: 12 },
};
const ADMIN_FIELDS: SchemaProps = {
  ...PROFILE_FIELDS,
  email: { type: 'string', format: 'email' },
  role: { type: 'string', enum: Object.values(UserRole) },
  isActive: { type: 'boolean' },
};
const withAvatar = (fields: SchemaProps) => ({
  type: 'object',
  properties: {
    ...fields,
    avatar: { type: 'string', format: 'binary', description: 'jpeg, png, webp or gif' },
  },
});

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly legal: LegalService,
  ) {}

  // ── Current user ──────────────────────────────────────────
  // Declared before ':id' so "me" is not parsed as an id.

  @Get('me')
  @ApiOperation({ summary: 'Get my profile' })
  @ApiOkResponse({ type: User })
  @ResponseTitle('Profile fetched')
  async getMe(@CurrentUser('id') userId: number): Promise<User> {
    const user = await this.usersService.findOne(userId);
    user.legal = await this.legal.status(userId);
    return user;
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({
    summary: 'Update my profile, optionally with a new avatar',
    description:
      'Send JSON, or multipart/form-data to include an `avatar` image (jpeg/png/webp/gif). ' +
      'The new avatar replaces the previous one.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({ schema: withAvatar(PROFILE_FIELDS) })
  @ApiOkResponse({ type: User })
  @ApiUnsupportedMediaTypeResponse({ description: 'Avatar is not an allowed image type' })
  @ApiPayloadTooLargeResponse({ description: 'Avatar larger than MAX_FILE_SIZE_MB' })
  @ResponseTitle('Profile updated')
  updateMe(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ): Promise<User> {
    return this.usersService.updateProfile(userId, dto, avatar);
  }

  @Get('search')
  @ApiOperation({
    summary: 'Find people by part of their name or email (e.g. to invite them to a trip)',
    description:
      'Every word must match a first name, last name, organization or email. Emails are masked ' +
      'unless you typed the exact address. Use the id with POST /trips/:tripId/invitations; ' +
      'pass excludeTripId to hide people who are already in that trip.',
  })
  @ResponseTitle('Users found')
  search(
    @CurrentUser('id') userId: number,
    @Query() query: SearchUsersDto,
  ): Promise<Paginated<UserSearchResultDto>> {
    return this.usersService.search(query, userId);
  }

  // ── Admin ─────────────────────────────────────────────────

  @Get('admin/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin dashboard overview' })
  @ApiForbiddenResponse()
  @ResponseTitle('Admin overview fetched')
  adminOverview(): Promise<{
    users: number;
    travellers: number;
    agencies: number;
    admins: number;
    trips: number;
    publicTrips: number;
  }> {
    return this.usersService.adminOverview();
  }

  @Get('admin/trips')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List all trips, including private trips (admin)' })
  @ResponseTitle('Admin trips fetched')
  adminTrips(@Query() query: PaginationQueryDto): Promise<Paginated<Trip>> {
    return this.usersService.adminTrips(query);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a user of any role (admin)' })
  @ApiCreatedResponse({ type: User })
  @ApiConflictResponse({ description: 'Email already registered' })
  @ApiForbiddenResponse()
  @ResponseTitle('User created')
  create(@Body() dto: CreateUserDto): Promise<User> {
    return this.usersService.create(dto);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'List users, paginated and searchable (admin)' })
  @ApiForbiddenResponse()
  @ResponseTitle('Users fetched')
  findAll(@Query() query: QueryUserDto): Promise<Paginated<User>> {
    return this.usersService.findAll(query);
  }

  // GET /users/:id (public profile) lives in TripsModule's UserProfilesController,
  // because it includes the user's trips.

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({
    summary: 'Update a user, optionally with a new avatar (admin)',
    description: 'JSON, or multipart/form-data with an `avatar` image owned by that user.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({ schema: withAvatar(ADMIN_FIELDS) })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse()
  @ApiUnsupportedMediaTypeResponse({ description: 'Avatar is not an allowed image type' })
  @ResponseTitle('User updated')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @UploadedFile() avatar?: Express.Multer.File,
  ): Promise<User> {
    return this.usersService.update(id, dto, avatar);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-delete a user (admin)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ApiNotFoundResponse()
  @ResponseTitle('User deleted')
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.usersService.remove(id);
  }
}
