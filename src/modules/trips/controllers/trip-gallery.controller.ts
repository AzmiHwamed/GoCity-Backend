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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { ResponseTitle } from '../../../common/response/api-response';
import { CurrentUser } from '../../auth/decorators';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { Media } from '../../media/entities/media.entity';
import { CurrentTripRole, TripRole, TripRoleGuard } from '../access/trip-role.guard';
import {
  GALLERY_UPLOAD_SCHEMA,
  GalleryOrderDto,
  MAX_IMAGES_PER_REQUEST,
  SHARE_DETAILS_MULTIPART_SCHEMA,
  SetCoverDto,
  ShareDetailsDto,
} from '../dto/share-details.dto';
import { Trip } from '../entities/trip.entity';
import { TripGalleryService } from '../services/trip-gallery.service';
import { TripsService } from '../services/trips.service';
import { TripMemberRole } from '../trip.enums';

/** What a trip shows to others: the owner's story, real spend, tips and photos. */
@ApiTags('Trip sharing')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@Controller('trips/:tripId')
export class TripGalleryController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly gallery: TripGalleryService,
  ) {}

  @Patch('share-details')
  @TripRole(TripMemberRole.OWNER)
  @UseInterceptors(FilesInterceptor('images', MAX_IMAGES_PER_REQUEST))
  @ApiOperation({
    summary: 'Set the story, actual spend per person and tips; optionally add images (owner)',
    description:
      'Send JSON, or multipart/form-data to include images. Only the fields you send change. ' +
      '`tips` replaces the whole list in the given order. Copies of the trip do not get these.',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({ schema: SHARE_DETAILS_MULTIPART_SCHEMA })
  @ApiOkResponse({ type: Trip })
  @ApiUnsupportedMediaTypeResponse({ description: 'An image is not jpeg/png/webp/gif' })
  @ApiPayloadTooLargeResponse({ description: 'An image is larger than MAX_FILE_SIZE_MB' })
  @ResponseTitle('Share details updated')
  updateShareDetails(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: ShareDetailsDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ): Promise<Trip> {
    return this.tripsService.updateShareDetails(tripId, userId, dto, images ?? []);
  }

  @Get('gallery')
  @TripRole(TripMemberRole.VIEWER)
  @ApiOperation({ summary: "The trip's images in order (members)" })
  @ApiOkResponse({ type: [Media] })
  @ResponseTitle('Gallery fetched')
  findAll(@Param('tripId', ParseIntPipe) tripId: number): Promise<Media[]> {
    return this.gallery.findAll(tripId);
  }

  @Post('gallery')
  @TripRole(TripMemberRole.EDITOR)
  @UseInterceptors(FilesInterceptor('images', MAX_IMAGES_PER_REQUEST))
  @ApiOperation({
    summary: `Add up to ${MAX_IMAGES_PER_REQUEST} images (editor or owner)`,
    description:
      'All files are checked first; if one is invalid, none is saved. A trip holds at most MAX_TRIP_IMAGES images.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: GALLERY_UPLOAD_SCHEMA })
  @ApiCreatedResponse({ type: [Media] })
  @ApiUnsupportedMediaTypeResponse({ description: 'An image is not jpeg/png/webp/gif' })
  @ApiPayloadTooLargeResponse({ description: 'An image is larger than MAX_FILE_SIZE_MB' })
  @ResponseTitle('Images added')
  add(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @UploadedFiles() images?: Express.Multer.File[],
  ): Promise<Media[]> {
    return this.gallery.add(tripId, userId, images ?? []);
  }

  @Patch('gallery/order')
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({ summary: 'Reorder the images (editor or owner)' })
  @ApiOkResponse({ type: [Media] })
  @ResponseTitle('Gallery reordered')
  reorder(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Body() dto: GalleryOrderDto,
  ): Promise<Media[]> {
    return this.gallery.reorder(tripId, dto.mediaIds);
  }

  @Patch('cover')
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({
    summary: 'Choose the cover image (editor or owner)',
    description: 'mediaId: null goes back to using the first image.',
  })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Cover updated')
  setCover(@Param('tripId', ParseIntPipe) tripId: number, @Body() dto: SetCoverDto): Promise<void> {
    return this.gallery.setCover(tripId, dto.mediaId ?? null);
  }

  @Delete('gallery/:mediaId')
  @TripRole(TripMemberRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an image (owner: any image; editors: the ones they uploaded)',
  })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Image deleted')
  remove(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('mediaId', ParseIntPipe) mediaId: number,
    @CurrentUser() user: AuthUser,
    @CurrentTripRole() role: TripMemberRole,
  ): Promise<void> {
    return this.gallery.remove(tripId, mediaId, user, role);
  }
}
