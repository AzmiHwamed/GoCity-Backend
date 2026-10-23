import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { decimalTransformer } from '../../../common/transformers/decimal.transformer';

/**
 * An eSIM plan entered by an admin (when no partner API is connected). Shown as
 * "listed by GoCity" with the date it was last checked, never as a live price.
 */
@Entity('esim_plans')
@Index(['countryCode', 'isActive'])
export class EsimPlan extends BaseEntity {
  @ApiProperty({ example: 'PT', description: 'ISO country code' })
  @Column({ name: 'country_code', length: 2 })
  countryCode: string;

  @ApiProperty({ example: 'Airalo' })
  @Column({ length: 60 })
  provider: string;

  @ApiProperty({ example: 'Portugal 5 GB' })
  @Column({ length: 120 })
  title: string;

  @ApiPropertyOptional({
    example: 5120,
    nullable: true,
    description: 'Data in MB; null if unlimited',
  })
  @Column({ name: 'data_mb', type: 'int', nullable: true })
  dataMb: number | null;

  @ApiProperty({ example: false })
  @Column({ name: 'is_unlimited', default: false })
  isUnlimited: boolean;

  @ApiProperty({ example: 30 })
  @Column({ name: 'validity_days', type: 'int' })
  validityDays: number;

  @ApiProperty({ example: 11.5 })
  @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalTransformer })
  price: number;

  @ApiProperty({ example: 'USD' })
  @Column({ length: 3 })
  currency: string;

  @ApiProperty({ example: 'https://www.airalo.com/portugal-esim' })
  @Column({ length: 500 })
  url: string;

  @ApiPropertyOptional({ nullable: true, example: 'Data only · 5G where available' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  notes: string | null;

  @ApiProperty({ example: true })
  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
