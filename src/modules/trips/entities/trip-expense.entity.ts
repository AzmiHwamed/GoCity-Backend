import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { User } from '../../users/entities/user.entity';
import { ExpenseCategory } from '../trip.enums';
import { Trip } from './trip.entity';

/**
 * A cost of the trip that isn't an activity's own `expense`: the hotel, flights, food,
 * shopping… Activity costs stay on the activities and are added to the totals separately,
 * so nothing is counted twice.
 */
@Entity('trip_expenses')
@Index(['tripId', 'category'])
export class TripExpense extends BaseEntity {
  @ApiProperty({ example: 1 })
  @Column({ name: 'trip_id' })
  tripId: number;

  @ManyToOne(() => Trip, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip?: Relation<Trip>;

  @ApiProperty({ example: 'Airport taxi' })
  @Column({ length: 150 })
  title: string;

  @ApiProperty({ example: 35.5 })
  @Column({ type: 'decimal', precision: 12, scale: 2, transformer: decimalTransformer })
  amount: number;

  @ApiPropertyOptional({ example: 'EUR', nullable: true })
  @Column({ type: 'varchar', length: 3, nullable: true })
  currency: string | null;

  @ApiProperty({ enum: ExpenseCategory, example: ExpenseCategory.TRANSPORT })
  @Column({ type: 'enum', enum: ExpenseCategory, default: ExpenseCategory.OTHER })
  category: ExpenseCategory;

  @ApiPropertyOptional({ example: '2026-11-01', nullable: true })
  @Column({ type: 'date', nullable: true })
  date: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ example: 2, nullable: true, description: 'Member who paid' })
  @Column({ name: 'paid_by_id', type: 'int', nullable: true })
  paidById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'paid_by_id' })
  paidBy?: Relation<User> | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  @Column({ name: 'created_by_id', type: 'int', nullable: true })
  createdById: number | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy?: Relation<User> | null;

  /** The trip's hotel stay (kept in sync by PUT /trips/:id/hotel); at most one per trip. */
  @ApiProperty({ example: false })
  @Column({ name: 'is_hotel_stay', default: false })
  isHotelStay: boolean;
}
