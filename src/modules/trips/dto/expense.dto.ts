import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ExpenseCategory } from '../trip.enums';
import { DATE_REGEX } from '../trip.utils';

const CURRENCY = /^[A-Z]{3}$/;

export class CreateExpenseDto {
  @ApiProperty({ example: 'Airport taxi' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  title: string;

  @ApiProperty({ example: 35.5, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  amount: number;

  @ApiPropertyOptional({ enum: ExpenseCategory, default: ExpenseCategory.OTHER })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @ApiPropertyOptional({ example: 'EUR', description: '3-letter currency code' })
  @IsOptional()
  @Matches(CURRENCY, { message: 'currency must be a 3-letter code like EUR' })
  currency?: string | null;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(DATE_REGEX, { message: 'date must be YYYY-MM-DD' })
  date?: string | null;

  @ApiPropertyOptional({ example: 'Split later' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @ApiPropertyOptional({ example: 2, description: 'User id of the member who paid' })
  @IsOptional()
  @IsInt()
  @Min(1)
  paidById?: number | null;
}

export class UpdateExpenseDto extends PartialType(CreateExpenseDto) {}

export class ExpenseQueryDto {
  @ApiPropertyOptional({ enum: ExpenseCategory })
  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;
}

/** Pick the trip's hotel from Google Places and record what it costs. */
export class SetHotelDto {
  @ApiProperty({ description: 'Hotel placeId from hotel suggestions' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  placeId: string;

  @ApiPropertyOptional({ example: 95, description: 'Price per night (for all travelers)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pricePerNight?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Default: trip length in nights (days − 1, min 1)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  nights?: number;

  @ApiPropertyOptional({
    example: 190,
    description: 'Total price; overrides pricePerNight × nights',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalPrice?: number;

  @ApiPropertyOptional({ example: 'EUR' })
  @IsOptional()
  @Matches(CURRENCY, { message: 'currency must be a 3-letter code like EUR' })
  currency?: string;

  @ApiPropertyOptional({ example: 1, description: 'Member who paid' })
  @IsOptional()
  @IsInt()
  @Min(1)
  paidById?: number;
}

export class HotelSuggestionsQueryDto {
  @ApiPropertyOptional({ example: 4, minimum: 1, maximum: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ example: 2, minimum: 1, maximum: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4)
  maxPriceLevel?: number;

  @ApiPropertyOptional({ example: 10, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pageToken?: string;
}

export class CategoryTotalDto {
  @ApiProperty({ enum: ExpenseCategory }) category: ExpenseCategory;
  @ApiProperty({ example: 190 }) total: number;
}

export class PayerTotalDto {
  @ApiPropertyOptional({ nullable: true }) userId: number | null;
  @ApiProperty({ example: 'Jane Doe', description: '"Not assigned" when nobody is set' })
  name: string;
  @ApiProperty({ example: 120 }) total: number;
}

export class ExpenseSummaryDto {
  @ApiProperty({ example: 845.5 }) total: number;
  @ApiProperty({ example: 211.38, description: 'total ÷ travelersCount' }) perPerson: number;
  @ApiProperty({ example: 4 }) travelersCount: number;
  @ApiProperty({ example: 120, description: 'From activities/plans' }) activitiesTotal: number;
  @ApiProperty({ example: 725.5, description: 'From the expenses list (hotel included)' })
  expensesTotal: number;
  @ApiPropertyOptional({ example: 1400, nullable: true }) budgetTotal: number | null;
  @ApiPropertyOptional({ example: 554.5, nullable: true, description: 'budget − spent' })
  remainingBudget: number | null;
  @ApiProperty({ type: [CategoryTotalDto] }) byCategory: CategoryTotalDto[];
  @ApiProperty({ type: [PayerTotalDto], description: 'Expenses list only' })
  byPayer: PayerTotalDto[];
  @ApiProperty({ type: [String], example: ['EUR'], description: 'Currencies used (not converted)' })
  currencies: string[];
}
