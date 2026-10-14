import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import { Paginated } from '../../common/dto/paginated-response.dto';
import { CurrentUser } from '../auth/decorators';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { QueryMediaDto, UploadMediaDto } from './dto';
import { Media, MediaType } from './entities/media.entity';
import { MediaService } from './media.service';
import { ResponseTitle } from '../../common/response/api-response';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload an image',
    description: 'type=profile also sets it as your avatar (replacing the previous one).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type'],
      properties: {
        file: { type: 'string', format: 'binary', description: 'jpeg, png, webp or gif' },
        type: {
          type: 'string',
          enum: Object.values(MediaType).filter((t) => t !== MediaType.TRIP),
        },
        entityId: { type: 'integer', description: 'e.g. the trip id for type=trip' },
      },
    },
  })
  @ApiCreatedResponse({ type: Media })
  @ApiUnsupportedMediaTypeResponse({ description: 'Not an allowed image type' })
  @ApiPayloadTooLargeResponse({ description: 'File larger than MAX_FILE_SIZE_MB' })
  @ResponseTitle('File uploaded')
  upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadMediaDto,
  ): Promise<Media> {
    // Trip images need a trip permission check, which lives in the trip gallery.
    if (dto.type === MediaType.TRIP) {
      throw new BadRequestException(
        'Upload trip images with POST /trips/:tripId/gallery (editors and owners only)',
      );
    }
    return this.mediaService.upload(user.id, file, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my media (admins can pass ownerId)' })
  @ResponseTitle('Media fetched')
  findAll(@CurrentUser() user: AuthUser, @Query() query: QueryMediaDto): Promise<Paginated<Media>> {
    return this.mediaService.findAll(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one media record' })
  @ApiOkResponse({ type: Media })
  @ApiNotFoundResponse()
  @ResponseTitle('Media fetched')
  findOne(@Param('id', ParseIntPipe) id: number): Promise<Media> {
    return this.mediaService.findOne(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a media record and its file (owner or admin)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ApiForbiddenResponse()
  @ApiNotFoundResponse()
  @ResponseTitle('Media deleted')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser): Promise<void> {
    return this.mediaService.remove(id, user);
  }
}
