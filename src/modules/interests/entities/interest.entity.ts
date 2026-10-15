import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

/** A reusable interest that administrators curate for all user profiles. */
@Entity('interests')
export class Interest extends BaseEntity {
  @ApiProperty({ example: 'Local food' })
  @Index({ unique: true })
  @Column({ length: 40 })
  name: string;
}
