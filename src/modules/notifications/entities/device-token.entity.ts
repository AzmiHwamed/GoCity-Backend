import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('device_tokens')
@Index(['tokenHash'], { unique: true })
@Index(['userId'])
export class DeviceToken extends BaseEntity {
  @Column({ name: 'user_id' }) userId: number;
  @ManyToOne(() => User, { onDelete: 'CASCADE' }) @JoinColumn({ name: 'user_id' }) user: User;
  @Column({ type: 'text' }) token: string;
  @Column({ name: 'token_hash', length: 64 }) tokenHash: string;
  @Column({ length: 32, default: 'web' }) platform: string;
}
