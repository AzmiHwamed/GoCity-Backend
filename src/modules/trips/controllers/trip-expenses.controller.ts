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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ResponseTitle } from '../../../common/response/api-response';
import { CurrentUser } from '../../auth/decorators';
import { HotelPageDto } from '../../places/dto';
import { CurrentTripRole, TripRole, TripRoleGuard } from '../access/trip-role.guard';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  ExpenseSummaryDto,
  HotelSuggestionsQueryDto,
  SetHotelDto,
  UpdateExpenseDto,
} from '../dto/expense.dto';
import { TripExpense } from '../entities/trip-expense.entity';
import { Trip } from '../entities/trip.entity';
import { TripExpensesService } from '../services/trip-expenses.service';
import { TripsService } from '../services/trips.service';
import { TripMemberRole } from '../trip.enums';

@ApiTags('Trip hotel & expenses')
@ApiBearerAuth()
@UseGuards(TripRoleGuard)
@Controller('trips/:tripId')
export class TripExpensesController {
  constructor(
    private readonly expenses: TripExpensesService,
    private readonly tripsService: TripsService,
  ) {}

  // ── Hotel ─────────────────────────────────────────────────

  @Get('hotel-suggestions')
  @TripRole(TripMemberRole.VIEWER)
  @ApiOperation({
    summary: "Hotel suggestions for the trip's city (Google Places)",
    description:
      'The trip needs a city (cityPlaceId or city). Filter with minRating, maxPriceLevel.',
  })
  @ApiOkResponse({ type: HotelPageDto })
  @ResponseTitle('Hotel suggestions fetched')
  hotelSuggestions(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Query() query: HotelSuggestionsQueryDto,
  ): Promise<HotelPageDto> {
    return this.expenses.hotelSuggestions(tripId, query);
  }

  @Put('hotel')
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({
    summary: "Set the trip's hotel from a Google placeId, with its cost (editor or owner)",
    description:
      'Fills hotelName, address and position. If totalPrice or pricePerNight is given, the cost is ' +
      "saved as the trip's hotel expense (nights default to the trip length) and counted in the totals.",
  })
  @ApiOkResponse({ type: Trip })
  @ResponseTitle('Hotel set')
  async setHotel(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: SetHotelDto,
    @CurrentTripRole() role: TripMemberRole,
  ): Promise<Trip> {
    await this.expenses.setHotel(tripId, userId, dto);
    return this.tripsService.findOne(tripId, role);
  }

  @Delete('hotel')
  @TripRole(TripMemberRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove the hotel and its expense (editor or owner)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Hotel removed')
  clearHotel(@Param('tripId', ParseIntPipe) tripId: number): Promise<void> {
    return this.expenses.clearHotel(tripId);
  }

  // ── Expenses ──────────────────────────────────────────────

  @Get('expenses/summary')
  @TripRole(TripMemberRole.VIEWER)
  @ApiOperation({
    summary: 'Spending totals: overall, per person, by category, by who paid, vs budget',
    description: 'Activity costs are included under "activity"; nothing is counted twice.',
  })
  @ApiOkResponse({ type: ExpenseSummaryDto })
  @ResponseTitle('Expense summary fetched')
  summary(@Param('tripId', ParseIntPipe) tripId: number): Promise<ExpenseSummaryDto> {
    return this.expenses.summary(tripId);
  }

  @Get('expenses')
  @TripRole(TripMemberRole.VIEWER)
  @ApiOperation({ summary: 'List expenses (members)' })
  @ApiOkResponse({ type: [TripExpense] })
  @ResponseTitle('Expenses fetched')
  findAll(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Query() query: ExpenseQueryDto,
  ): Promise<TripExpense[]> {
    return this.expenses.findAll(tripId, query.category);
  }

  @Post('expenses')
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({ summary: 'Add an expense (editor or owner)' })
  @ApiCreatedResponse({ type: TripExpense })
  @ResponseTitle('Expense added')
  create(
    @Param('tripId', ParseIntPipe) tripId: number,
    @CurrentUser('id') userId: number,
    @Body() dto: CreateExpenseDto,
  ): Promise<TripExpense> {
    return this.expenses.create(tripId, userId, dto);
  }

  @Patch('expenses/:expenseId')
  @TripRole(TripMemberRole.EDITOR)
  @ApiOperation({ summary: 'Update an expense (editor or owner)' })
  @ApiOkResponse({ type: TripExpense })
  @ResponseTitle('Expense updated')
  update(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
    @Body() dto: UpdateExpenseDto,
  ): Promise<TripExpense> {
    return this.expenses.update(tripId, expenseId, dto);
  }

  @Delete('expenses/:expenseId')
  @TripRole(TripMemberRole.EDITOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an expense (editor or owner)' })
  @ApiOkResponse({ description: 'response_body is null' })
  @ResponseTitle('Expense deleted')
  remove(
    @Param('tripId', ParseIntPipe) tripId: number,
    @Param('expenseId', ParseIntPipe) expenseId: number,
  ): Promise<void> {
    return this.expenses.remove(tripId, expenseId);
  }
}
