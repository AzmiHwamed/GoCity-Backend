import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { VoteValue } from '../trip.enums';
import { TripIdea } from './trip-idea.entity';

@Entity('trip_idea_votes')
@Index(['ideaId', 'userId'], { unique: true })
export class IdeaVote extends BaseEntity {
  @Column({ name: 'idea_id' })
  ideaId: number;

  @ManyToOne(() => TripIdea, (idea) => idea.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'idea_id' })
  idea?: Relation<TripIdea>;

  @Column({ name: 'user_id' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: Relation<User>;

  @Column({ type: 'enum', enum: VoteValue })
  value: VoteValue;
}
