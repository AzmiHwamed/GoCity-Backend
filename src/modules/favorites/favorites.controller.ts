import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseTitle } from '../../common/response/api-response';
import { CurrentUser } from '../auth/decorators';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import {
  AddFavoriteDto,
  FavoriteCheckQueryDto,
  FavoritePageDto,
  FavoriteQueryDto,
  FavoriteViewDto,
} from './dto';
import { FavoriteType } from './entities/favorite.entity';
import { FavoritesService } from './favorites.service';

@ApiTags('Favorites')
@ApiBearerAuth()
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({
    summary: 'My favorites, newest first',
    description: 'Filter with type (trip, activity, hotel, place). Always returns counts per type.',
  })
  @ApiOkResponse({ type: FavoritePageDto })
  @ResponseTitle('Favorites fetched')
  list(@CurrentUser() user: AuthUser, @Query() query: FavoriteQueryDto): Promise<FavoritePageDto> {
    return this.favorites.list(user, query);
  }

  @Get('check')
  @ApiOperation({ summary: 'Which of these items are in my favorites (for heart buttons)' })
  @ApiOkResponse({ type: [String] })
  @ResponseTitle('Favorites checked')
  check(@CurrentUser() user: AuthUser, @Query() query: FavoriteCheckQueryDto): Promise<string[]> {
    return this.favorites.check(user, query.type, query.ids);
  }

  @Post()
  @ApiOperation({
    summary: 'Add to favorites',
    description:
      'trip/activity: targetId is its id and you must be able to see it. hotel/place: targetId is the Google placeId. Adding twice is fine.',
  })
  @ApiCreatedResponse({ type: FavoriteViewDto })
  @ResponseTitle('Added to favorites')
  add(@CurrentUser() user: AuthUser, @Body() dto: AddFavoriteDto): Promise<FavoriteViewDto> {
    return this.favorites.add(user, dto);
  }

  @Delete(':type/:targetId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove from favorites' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Removed from favorites')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('type', new ParseEnumPipe(FavoriteType)) type: FavoriteType,
    @Param('targetId') targetId: string,
  ): Promise<void> {
    return this.favorites.remove(user, type, targetId);
  }
}
