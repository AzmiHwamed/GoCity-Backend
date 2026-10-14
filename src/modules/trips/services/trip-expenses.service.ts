import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { HotelPageDto } from '../../places/dto';
import { PlacesService } from '../../places/places.service';
import {
  CreateExpenseDto,
  ExpenseSummaryDto,
  HotelSuggestionsQueryDto,
  SetHotelDto,
  UpdateExpenseDto,
} from '../dto/expense.dto';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripExpense } from '../entities/trip-expense.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { ExpenseCategory } from '../trip.enums';
import { roundMoney } from '../trip.utils';

const REQUIRED = ['title', 'amount', 'category'] as const;

@Injectable()
export class TripExpensesService {
  constructor(
    @InjectRepository(TripExpense) private readonly expenses: Repository<TripExpense>,
    @InjectRepository(TripActivity) private readonly activities: Repository<TripActivity>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    private readonly places: PlacesService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Expenses list ─────────────────────────────────────────

  findAll(tripId: number, category?: ExpenseCategory): Promise<TripExpense[]> {
    return this.expenses.find({
      where: { tripId, ...(category ? { category } : {}) },
      relations: { paidBy: true },
      order: { date: 'ASC', createdAt: 'ASC' },
    });
  }

  async findOne(tripId: number, expenseId: number): Promise<TripExpense> {
    const expense = await this.expenses.findOne({
      where: { id: expenseId, tripId },
      relations: { paidBy: true },
    });
    if (!expense) throw new NotFoundException(`Expense #${expenseId} not found`);
    return expense;
  }

  async create(tripId: number, userId: number, dto: CreateExpenseDto): Promise<TripExpense> {
    await this.assertPayerIsMember(tripId, dto.paidById);
    const saved = await this.expenses.save(
      this.expenses.create({
        ...dto,
        category: dto.category ?? ExpenseCategory.OTHER,
        tripId,
        createdById: userId,
        isHotelStay: false,
      }),
    );
    return this.findOne(tripId, saved.id);
  }

  async update(tripId: number, expenseId: number, dto: UpdateExpenseDto): Promise<TripExpense> {
    const expense = await this.findOne(tripId, expenseId);
    for (const key of REQUIRED) {
      if (dto[key] === null) throw new BadRequestException(`${key} cannot be empty`);
    }
    await this.assertPayerIsMember(tripId, dto.paidById);
    delete expense.paidBy; // let paidById decide
    Object.assign(expense, dto);
    await this.expenses.save(expense);
    return this.findOne(tripId, expenseId);
  }

  async remove(tripId: number, expenseId: number): Promise<void> {
    const expense = await this.findOne(tripId, expenseId);
    await this.expenses.delete(expense.id);
  }

  /**
   * Totals: activity costs (from the activities) + the expenses list, by category and by
   * who paid, per person and against the budget.
   */
  async summary(tripId: number): Promise<ExpenseSummaryDto> {
    const trip = await this.getTrip(tripId);
    const [expenses, activities] = await Promise.all([
      this.findAll(tripId),
      this.activities.find({ where: { tripId }, select: { id: true, expense: true } }),
    ]);

    const activitiesTotal = roundMoney(activities.reduce((s, a) => s + Number(a.expense), 0));
    const expensesTotal = roundMoney(expenses.reduce((s, e) => s + Number(e.amount), 0));
    const total = roundMoney(activitiesTotal + expensesTotal);

    const byCategory = new Map<ExpenseCategory, number>(
      Object.values(ExpenseCategory).map((c) => [c, 0]),
    );
    byCategory.set(ExpenseCategory.ACTIVITY, activitiesTotal);
    for (const e of expenses)
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);

    const byPayer = new Map<number | null, { name: string; total: number }>();
    for (const e of expenses) {
      const key = e.paidById ?? null;
      const name = e.paidBy ? `${e.paidBy.firstName} ${e.paidBy.lastName}` : 'Not assigned';
      const row = byPayer.get(key) ?? { name, total: 0 };
      row.total += e.amount;
      byPayer.set(key, row);
    }

    const travelers = Math.max(trip.travelersCount, 1);
    const budgetTotal = trip.totalBudget;
    return {
      total,
      perPerson: roundMoney(total / travelers),
      travelersCount: travelers,
      activitiesTotal,
      expensesTotal,
      budgetTotal,
      remainingBudget: budgetTotal == null ? null : roundMoney(budgetTotal - total),
      byCategory: [...byCategory].map(([category, sum]) => ({ category, total: roundMoney(sum) })),
      byPayer: [...byPayer].map(([userId, row]) => ({
        userId,
        name: row.name,
        total: roundMoney(row.total),
      })),
      currencies: [...new Set(expenses.map((e) => e.currency).filter((c): c is string => !!c))],
    };
  }

  // ── Hotel ─────────────────────────────────────────────────

  /** Google hotel suggestions for the trip's city. */
  async hotelSuggestions(tripId: number, query: HotelSuggestionsQueryDto): Promise<HotelPageDto> {
    const trip = await this.getTrip(tripId);
    if (!trip.cityPlaceId && !trip.city) {
      throw new BadRequestException(
        "Set the trip's city first (PATCH /trips/:tripId with cityPlaceId or city)",
      );
    }
    return this.places.findHotels({
      ...query,
      ...(trip.cityPlaceId ? { placeId: trip.cityPlaceId } : { city: trip.city as string }),
    });
  }

  /**
   * Sets the trip's hotel from a Google placeId and records its cost as the trip's
   * single hotel expense (created or updated).
   */
  async setHotel(tripId: number, userId: number, dto: SetHotelDto): Promise<void> {
    const trip = await this.getTrip(tripId);
    await this.assertPayerIsMember(tripId, dto.paidById);
    const hotel = await this.places.getHotel(dto.placeId);

    const nights = dto.nights ?? Math.max(trip.durationDays - 1, 1);
    const amount =
      dto.totalPrice ?? (dto.pricePerNight !== undefined ? dto.pricePerNight * nights : undefined);

    await this.dataSource.transaction(async (em) => {
      await em.update(
        Trip,
        { id: tripId },
        {
          hotelName: hotel.name.slice(0, 200),
          hotelPlaceId: hotel.placeId,
          hotelAddress: hotel.address?.slice(0, 300) ?? null,
          hotelLatitude: hotel.latitude,
          hotelLongitude: hotel.longitude,
        },
      );
      if (amount === undefined) return; // hotel chosen, price not known yet

      const title = `Hotel: ${hotel.name}`.slice(0, 150);
      const notes =
        dto.totalPrice === undefined ? `${nights} night(s) × ${dto.pricePerNight}` : null;
      const existing = await em.findOne(TripExpense, { where: { tripId, isHotelStay: true } });
      if (existing) {
        await em.update(
          TripExpense,
          { id: existing.id },
          {
            title,
            amount: roundMoney(amount),
            currency: dto.currency ?? existing.currency,
            notes,
            ...(dto.paidById !== undefined ? { paidById: dto.paidById } : {}),
          },
        );
      } else {
        await em.save(
          em.create(TripExpense, {
            tripId,
            title,
            amount: roundMoney(amount),
            currency: dto.currency ?? null,
            category: ExpenseCategory.HOTEL,
            date: trip.startDate,
            notes,
            paidById: dto.paidById ?? null,
            createdById: userId,
            isHotelStay: true,
          }),
        );
      }
    });
  }

  /** Removes the hotel from the trip, and its hotel expense. */
  async clearHotel(tripId: number): Promise<void> {
    await this.getTrip(tripId);
    await this.dataSource.transaction(async (em) => {
      await em.update(
        Trip,
        { id: tripId },
        {
          hotelName: null,
          hotelPlaceId: null,
          hotelAddress: null,
          hotelLatitude: null,
          hotelLongitude: null,
        },
      );
      await em.delete(TripExpense, { tripId, isHotelStay: true });
    });
  }

  // ──────────────────────────────────────────────────────────

  private async getTrip(tripId: number): Promise<Trip> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip #${tripId} not found`);
    return trip;
  }

  private async assertPayerIsMember(tripId: number, paidById?: number | null): Promise<void> {
    if (paidById == null) return;
    if (!(await this.members.exists({ where: { tripId, userId: paidById } }))) {
      throw new BadRequestException('paidById must be a member of this trip');
    }
  }
}
