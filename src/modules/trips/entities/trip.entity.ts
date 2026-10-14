import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';
import { Media } from '../../media/entities/media.entity';
import { User } from '../../users/entities/user.entity';
import { TripMemberRole, TripVisibility } from '../trip.enums';
import { roundMoney, tripDurationDays } from '../trip.utils';
import { TripMember } from './trip-member.entity';

@Entity('trips')
export class Trip extends BaseEntity {
  @ApiProperty({ example: 'Lisbon weekend' })
  @Column({ length: 150 })
  name: string;

  @ApiProperty({ example: '2026-11-01' })
  @Column({ name: 'start_date', type: 'date' })
  startDate: string;

  @ApiProperty({ example: '2026-11-03' })
  @Column({ name: 'end_date', type: 'date' })
  endDate: string;

  @ApiProperty({ example: 4 })
  @Column({ name: 'travelers_count', type: 'int', default: 1 })
  travelersCount: number;

  @ApiPropertyOptional({ example: 350, nullable: true, description: 'Estimated budget per person' })
  @Column({
    name: 'budget_per_person',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  budgetPerPerson: number | null;

  @ApiPropertyOptional({ example: 'Hotel Avenida', nullable: true })
  @Column({ name: 'hotel_name', type: 'varchar', length: 200, nullable: true })
  hotelName: string | null;

  @ApiPropertyOptional({ example: 38.7223, nullable: true })
  @Column({
    name: 'hotel_latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  hotelLatitude: number | null;

  @ApiPropertyOptional({ example: -9.1393, nullable: true })
  @Column({
    name: 'hotel_longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  hotelLongitude: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Google placeId of the hotel' })
  @Column({ name: 'hotel_place_id', type: 'varchar', length: 255, nullable: true })
  hotelPlaceId: string | null;

  @ApiPropertyOptional({ example: 'Av. da Liberdade 123, Lisboa', nullable: true })
  @Column({ name: 'hotel_address', type: 'varchar', length: 300, nullable: true })
  hotelAddress: string | null;

  // ── Destination city (from Google Places) ──

  @ApiPropertyOptional({ example: 'Lisbon', nullable: true })
  @Column({ type: 'varchar', length: 150, nullable: true })
  city: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Google placeId of the city' })
  @Column({ name: 'city_place_id', type: 'varchar', length: 255, nullable: true })
  cityPlaceId: string | null;

  @ApiPropertyOptional({ example: 'Portugal', nullable: true })
  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string | null;

  @ApiPropertyOptional({ example: 38.7223, nullable: true })
  @Column({
    name: 'city_latitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  cityLatitude: number | null;

  @ApiPropertyOptional({ example: -9.1393, nullable: true })
  @Column({
    name: 'city_longitude',
    type: 'decimal',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: decimalTransformer,
  })
  cityLongitude: number | null;

  /** Secret part of the invite link; only owners can read it (GET /trips/:id/invite-link). */
  @Exclude()
  @Index({ unique: true })
  @Column({ name: 'invite_code', length: 16 })
  inviteCode: string;

  @ApiProperty({ enum: TripVisibility, example: TripVisibility.PRIVATE })
  @Column({ type: 'enum', enum: TripVisibility, default: TripVisibility.PRIVATE })
  visibility: TripVisibility;

  /**
   * Secret part of the read-only share link (/trips/shared/<code>). Separate from inviteCode,
   * which grants editing. Created the first time the trip is shared.
   */
  @Exclude()
  @Index({ unique: true })
  @Column({ name: 'share_code', type: 'varchar', length: 16, nullable: true })
  shareCode: string | null;

  @ApiPropertyOptional({ example: 3, nullable: true, description: 'Trip this one was copied from' })
  @Column({ name: 'copied_from_trip_id', type: 'int', nullable: true })
  copiedFromTripId: number | null;

  @ManyToOne(() => Trip, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'copied_from_trip_id' })
  copiedFrom?: Relation<Trip> | null;

  // ── Shared with others (set by the owner via PATCH /trips/:id/share-details) ──

  @ApiPropertyOptional({ nullable: true, description: "The owner's story of the trip" })
  @Column({ type: 'text', nullable: true })
  story: string | null;

  @ApiPropertyOptional({
    example: 420,
    nullable: true,
    description: 'What was really spent per person',
  })
  @Column({
    name: 'actual_spent_per_person',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: decimalTransformer,
  })
  actualSpentPerPerson: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'Gallery image shown as the cover' })
  @Column({ name: 'cover_media_id', type: 'int', nullable: true })
  coverMediaId: number | null;

  @ManyToOne(() => Media, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cover_media_id' })
  coverMedia?: Relation<Media> | null;

  @ApiProperty({ example: 1 })
  @Column({ name: 'owner_id' })
  ownerId: number;

  @ApiPropertyOptional({ type: () => User })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner?: Relation<User>;

  @Exclude()
  @OneToMany(() => TripMember, (member) => member.trip)
  members?: Relation<TripMember>[];

  @ApiProperty({ example: 3, description: 'Inclusive number of days (computed)' })
  @Expose()
  get durationDays(): number {
    return tripDurationDays(this.startDate, this.endDate);
  }

  @ApiPropertyOptional({
    example: 1400,
    nullable: true,
    description: 'budgetPerPerson × travelersCount (computed)',
  })
  @Expose()
  get totalBudget(): number | null {
    return this.budgetPerPerson == null
      ? null
      : roundMoney(this.budgetPerPerson * this.travelersCount);
  }

  @ApiPropertyOptional({
    example: 70,
    nullable: true,
    description: 'actualSpentPerPerson − budgetPerPerson (positive = over budget)',
  })
  @Expose()
  get spendDifferencePerPerson(): number | null {
    return this.actualSpentPerPerson == null || this.budgetPerPerson == null
      ? null
      : roundMoney(this.actualSpentPerPerson - this.budgetPerPerson);
  }

  // ── Response-only fields, filled in by TripsService ──

  @ApiPropertyOptional({ type: [String], description: 'Tips for others, in order' })
  tips?: string[];

  @ApiPropertyOptional({ example: '/files/3f2a.jpg', nullable: true })
  coverUrl?: string | null;

  @ApiPropertyOptional({ type: () => [Media], description: 'Trip images, in order' })
  gallery?: Media[];

  @ApiPropertyOptional({ enum: TripMemberRole, description: 'Your role in this trip' })
  myRole?: TripMemberRole;

  @ApiPropertyOptional({ example: 3 })
  memberCount?: number;

  @ApiPropertyOptional({
    example: 845.5,
    description: 'Activity costs + trip expenses (hotel, transport, food…)',
  })
  totalExpenses?: number;

  @ApiPropertyOptional({ example: 211.38, description: 'totalExpenses ÷ travelersCount' })
  totalExpensesPerPerson?: number;
}
