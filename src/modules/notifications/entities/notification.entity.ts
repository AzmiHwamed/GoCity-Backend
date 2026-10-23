import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('notifications')
@Index(['userId', 'readAt'])
export class Notification extends BaseEntity {
  @ApiProperty() @Column({ name: 'user_id' }) userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
  @ApiProperty() @Column({ length: 150 }) title: string;
  @ApiProperty() @Column({ type: 'text' }) body: string;
  @ApiProperty({ example: 'trip_invitation' }) @Column({ length: 50 }) type: string;
  @ApiProperty({ required: false })
  @Column({ name: 'data_json', type: 'json', nullable: true })
  data?: Record<string, string> | null;
  @ApiProperty({ required: false })
  @Column({ name: 'read_at', type: 'datetime', nullable: true })
  readAt?: Date | null;
}
