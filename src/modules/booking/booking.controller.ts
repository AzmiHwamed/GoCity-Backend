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
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ResponseTitle } from '../../common/response/api-response';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { UserRole } from '../users/entities/user.entity';
import { EsimPlan } from './entities/esim-plan.entity';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { BookingService } from './booking.service';
import {
  CreateEsimPlanDto,
  EsimListDto,
  EsimPlansQueryDto,
  EsimQueryDto,
  FlightPlaceDto,
  FlightPlacesQueryDto,
  FlightPricesDto,
  FlightPricesQueryDto,
  FlightSearchLinkDto,
  FlightSearchQueryDto,
  TripBookingDto,
  TripFlightsDto,
  TripFlightsQueryDto,
  UpdateEsimPlanDto,
} from './dto';

@ApiTags('Booking')
@Controller('booking')
export class BookingController {
  constructor(private readonly booking: BookingService) {}

  @Public()
  @Get('flights/places')
  @ApiOperation({ summary: 'Find a city or airport code ("lisb" → Lisbon, LIS)' })
  @ApiOkResponse({ type: [FlightPlaceDto] })
  @ResponseTitle('Places found')
  places(@Query() q: FlightPlacesQueryDto): Promise<FlightPlaceDto[]> {
    return this.booking.searchPlaces(q.term);
  }

  @Public()
  @Get('flights/prices')
  @ApiOperation({
    summary: 'Flight prices for a route, cheapest first',
    description:
      'Offers include airline name and logo, flight number, times, stops and flight time, plus city ' +
      'and airport names and destination photos. Without TRAVELPAYOUTS_TOKEN (or when the partner ' +
      'is down) offers is empty, pricesAvailable is false and searchUrl still works.',
  })
  @ApiOkResponse({ type: FlightPricesDto })
  @ResponseTitle('Flight prices fetched')
  prices(@Query() q: FlightPricesQueryDto): Promise<FlightPricesDto> {
    return this.booking.prices(q);
  }

  @Public()
  @Get('flights/search-link')
  @ApiOperation({ summary: 'Partner search page for a route' })
  @ApiOkResponse({ type: FlightSearchLinkDto })
  @ResponseTitle('Flight search link created')
  link(@Query() q: FlightSearchQueryDto): Promise<FlightSearchLinkDto> {
    return this.booking.flightLink(q);
  }

  @Public()
  @Get('esims')
  @ApiOperation({ summary: 'Travel eSIMs for a country (code or name), with flag and photos' })
  @ApiOkResponse({ type: EsimListDto })
  @ResponseTitle('eSIM offers fetched')
  esims(@Query() q: EsimQueryDto): Promise<EsimListDto> {
    return this.booking.esims(q.country);
  }

  @Get('trips/:tripId')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Booking defaults for a trip',
    description:
      'Destination airport/city matched from the trip city, trip dates and travellers (to prefill ' +
      'flight search), destination photos, country and eSIM offers.',
  })
  @ApiQuery({ name: 'shareCode', required: false })
  @ApiOkResponse({ type: TripBookingDto })
  @ResponseTitle('Trip booking info fetched')
  forTrip(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser() user: AuthUser,
    @Query('shareCode') shareCode?: string,
  ): Promise<TripBookingDto> {
    return this.booking.forTrip(tripId, user, shareCode);
  }

  @Get('trips/:tripId/flights')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Flights for each trip member from their own home airport',
    description:
      'Members are grouped by home airport (profile homeAirportCode); each group gets its ' +
      'cheapest offers for the trip dates and a search link. Members without a home airport, ' +
      'or living at the destination, are listed separately.',
  })
  @ApiOkResponse({ type: TripFlightsDto })
  @ResponseTitle('Trip flights fetched')
  tripFlights(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser() user: AuthUser,
    @Query() q: TripFlightsQueryDto,
  ): Promise<TripFlightsDto> {
    return this.booking.tripFlights(tripId, user, q.currency, q.shareCode);
  }

  // ── eSIM plans (admin) ────────────────────────────────────

  @Get('esims/plans')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'All listed eSIM plans, also inactive ones (admin)' })
  @ApiOkResponse({ type: [EsimPlan] })
  @ResponseTitle('eSIM plans fetched')
  listPlans(@Query() q: EsimPlansQueryDto): Promise<EsimPlan[]> {
    return this.booking.listPlans(q.country);
  }

  @Post('esims/plans')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List an eSIM plan for a country (admin)',
    description:
      'Shown to users as "listed by GoCity" with its last update date, when no partner API ' +
      'gives live plans for that country.',
  })
  @ApiOkResponse({ type: EsimPlan })
  @ResponseTitle('eSIM plan created')
  createPlan(@Body() dto: CreateEsimPlanDto): Promise<EsimPlan> {
    return this.booking.createPlan(dto);
  }

  @Patch('esims/plans/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update an eSIM plan, e.g. its price (admin)' })
  @ApiOkResponse({ type: EsimPlan })
  @ResponseTitle('eSIM plan updated')
  updatePlan(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEsimPlanDto,
  ): Promise<EsimPlan> {
    return this.booking.updatePlan(id, dto);
  }

  @Delete('esims/plans/:id')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an eSIM plan (admin)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('eSIM plan deleted')
  deletePlan(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.booking.deletePlan(id);
  }
}
