import { BadRequestException, Controller, Get, Param, Query, Res } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { ResponseTitle } from '../../common/response/api-response';
import { Public } from '../auth/decorators';
import {
  CityDetailsDto,
  CitySearchQueryDto,
  CitySuggestionDto,
  HotelPageDto,
  HotelSearchQueryDto,
  LangQueryDto,
  PhotoQueryDto,
} from './dto';
import { PlacesService } from './places.service';

/** City search and hotel suggestions through Google Places (the API key stays on the server). */
@ApiTags('Places')
@ApiBearerAuth()
@ApiServiceUnavailableResponse({ description: 'GOOGLE_PLACES_API_KEY is not set' })
@Controller('places')
export class PlacesController {
  constructor(private readonly places: PlacesService) {}

  @Get('cities/search')
  @ApiOperation({ summary: 'City autocomplete ("lis" → Lisbon, Portugal)' })
  @ApiOkResponse({ type: [CitySuggestionDto] })
  @ResponseTitle('Cities found')
  searchCities(@Query() query: CitySearchQueryDto): Promise<CitySuggestionDto[]> {
    return this.places.searchCities(query.q.trim(), query.lang, query.sessionToken);
  }

  @Get('cities/:placeId')
  @ApiOperation({ summary: 'City details: name, country, coordinates' })
  @ApiOkResponse({ type: CityDetailsDto })
  @ResponseTitle('City fetched')
  getCity(
    @Param('placeId') placeId: string,
    @Query() query: LangQueryDto,
  ): Promise<CityDetailsDto> {
    return this.places.getCity(placeId, query.lang);
  }

  @Get('hotels')
  @ApiOperation({
    summary: 'Hotel suggestions',
    description:
      'Give a city placeId (best), a city name, lat+lng, or free text q. Filter with minRating ' +
      'and maxPriceLevel (1–4); page with nextPageToken. Images come through photoUrl.',
  })
  @ApiOkResponse({ type: HotelPageDto })
  @ResponseTitle('Hotel places fetched')
  hotels(@Query() query: HotelSearchQueryDto): Promise<HotelPageDto> {
    const hasCoords = query.lat !== undefined && query.lng !== undefined;
    if (!query.placeId && !query.city?.trim() && !query.q?.trim() && !hasCoords) {
      throw new BadRequestException('Give placeId, city, lat+lng or q');
    }
    return this.places.findHotels(query);
  }

  @Public() // <img src> can't send a token; only photos from our own results are served
  @Get('photo')
  @ApiOperation({ summary: 'Hotel photo (image bytes, not JSON). Use the photoUrl from results.' })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  async photo(@Query() query: PhotoQueryDto, @Res() res: Response): Promise<void> {
    const { body, contentType } = await this.places.getPhoto(query.name, query.maxWidth);
    res.set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=86400' });
    res.send(body);
  }
}
