import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { TripAccessService } from '../access/trip-access.service';
import { CreateIdeaDto } from '../dto/idea.dto';
import { ACTIVITY_DETAIL_FIELDS } from '../entities/activity-details';
import { IdeaVote } from '../entities/idea-vote.entity';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripIdea } from '../entities/trip-idea.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { ActivityKind, IdeaStatus, TripMemberRole, VoteValue } from '../trip.enums';
import { decideIdea } from '../trip.utils';
import { validateActivityDetails } from './activity-validation';

@Injectable()
export class TripIdeasService {
  constructor(
    @InjectRepository(TripIdea) private readonly ideas: Repository<TripIdea>,
    @InjectRepository(IdeaVote) private readonly votes: Repository<IdeaVote>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    private readonly dataSource: DataSource,
  ) {}

  /** Proposes an idea. The proposer's vote counts as yes (they can change it). */
  async create(tripId: number, userId: number, dto: CreateIdeaDto): Promise<TripIdea> {
    const trip = await this.trips.findOne({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`Trip #${tripId} not found`);

    const idea = this.ideas.create({
      ...dto,
      kind: dto.kind ?? ActivityKind.ACTIVITY,
      expense: dto.expense ?? 0,
      tripId,
      createdById: userId,
      status: IdeaStatus.OPEN,
    });
    validateActivityDetails(idea, trip.durationDays);
    const saved = await this.ideas.save(idea);

    await this.votes.save(this.votes.create({ ideaId: saved.id, userId, value: VoteValue.YES }));
    await this.evaluate(saved.id);
    return this.findOne(tripId, saved.id, userId);
  }

  async findAll(tripId: number, userId: number, status?: IdeaStatus): Promise<TripIdea[]> {
    const ideas = await this.ideas.find({
      where: { tripId, ...(status ? { status } : {}) },
      relations: { votes: true },
      order: { createdAt: 'DESC' },
    });
    const memberIds = await this.memberIds(tripId);
    return ideas.map((idea) => this.withCounts(idea, memberIds, userId));
  }

  async findOne(tripId: number, ideaId: number, userId: number): Promise<TripIdea> {
    const idea = await this.ideas.findOne({
      where: { id: ideaId, tripId },
      relations: { votes: true },
    });
    if (!idea) throw new NotFoundException(`Idea #${ideaId} not found`);
    return this.withCounts(idea, await this.memberIds(tripId), userId);
  }

  /** Records or changes a vote, then applies the majority rule. */
  async vote(tripId: number, ideaId: number, userId: number, value: VoteValue): Promise<TripIdea> {
    const idea = await this.ideas.findOne({ where: { id: ideaId, tripId } });
    if (!idea) throw new NotFoundException(`Idea #${ideaId} not found`);
    if (idea.status !== IdeaStatus.OPEN) {
      throw new BadRequestException(`Voting is closed: this idea was ${idea.status}`);
    }

    const existing = await this.votes.findOne({ where: { ideaId, userId } });
    if (existing) {
      existing.value = value;
      await this.votes.save(existing);
    } else {
      await this.votes.save(this.votes.create({ ideaId, userId, value }));
    }

    await this.evaluate(ideaId);
    return this.findOne(tripId, ideaId, userId);
  }

  /** The proposer or the trip owner can withdraw an idea while it's open. */
  async remove(
    tripId: number,
    ideaId: number,
    userId: number,
    myRole: TripMemberRole | undefined,
  ): Promise<void> {
    const idea = await this.ideas.findOne({ where: { id: ideaId, tripId } });
    if (!idea) throw new NotFoundException(`Idea #${ideaId} not found`);
    if (idea.status !== IdeaStatus.OPEN) {
      throw new BadRequestException(`Only open ideas can be deleted (this one was ${idea.status})`);
    }
    if (idea.createdById !== userId && !TripAccessService.hasRole(myRole, TripMemberRole.OWNER)) {
      throw new ForbiddenException('Only the person who proposed it or the owner can delete it');
    }
    await this.ideas.delete(idea.id);
  }

  /**
   * Called when someone leaves or is removed: their votes on open ideas no longer
   * count, and with fewer members some ideas may now have a majority.
   */
  async onMemberLeft(tripId: number, userId: number): Promise<void> {
    const open = await this.ideas.find({
      where: { tripId, status: IdeaStatus.OPEN },
      select: { id: true },
    });
    if (!open.length) return;
    const ids = open.map((i) => i.id);
    await this.votes.delete({ userId, ideaId: In(ids) });
    for (const id of ids) await this.evaluate(id);
  }

  /** Applies the majority rule to an open idea, counting only current members' votes. */
  async evaluate(ideaId: number): Promise<void> {
    const idea = await this.ideas.findOne({ where: { id: ideaId }, relations: { votes: true } });
    if (!idea || idea.status !== IdeaStatus.OPEN) return;

    const memberIds = await this.memberIds(idea.tripId);
    const { yes, no } = countVotes(idea.votes ?? [], memberIds);
    const decision = decideIdea(yes, no, memberIds.size);

    if (decision === 'accept') await this.accept(idea);
    if (decision === 'reject') {
      await this.ideas.update(
        { id: idea.id, status: IdeaStatus.OPEN },
        { status: IdeaStatus.REJECTED },
      );
    }
  }

  // ──────────────────────────────────────────────────────────

  /** Copies the idea into a new activity. Guarded so two last votes can't create two. */
  private async accept(idea: TripIdea): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      const claimed = await em.update(
        TripIdea,
        { id: idea.id, status: IdeaStatus.OPEN },
        { status: IdeaStatus.ACCEPTED },
      );
      if (!claimed.affected) return; // someone else's vote already decided it

      const details = Object.fromEntries(ACTIVITY_DETAIL_FIELDS.map((f) => [f, idea[f]]));
      const activity = await em.save(
        em.create(TripActivity, { ...details, tripId: idea.tripId, createdById: idea.createdById }),
      );
      await em.update(TripIdea, { id: idea.id }, { activityId: activity.id });
    });
  }

  private async memberIds(tripId: number): Promise<Set<number>> {
    const members = await this.members.find({ where: { tripId }, select: { userId: true } });
    return new Set(members.map((m) => m.userId));
  }

  private withCounts(idea: TripIdea, memberIds: Set<number>, userId: number): TripIdea {
    const { yes, no } = countVotes(idea.votes ?? [], memberIds);
    idea.yesCount = yes;
    idea.noCount = no;
    idea.memberCount = memberIds.size;
    idea.myVote = idea.votes?.find((v) => v.userId === userId)?.value ?? null;
    return idea;
  }
}

function countVotes(votes: IdeaVote[], memberIds: Set<number>) {
  let yes = 0;
  let no = 0;
  for (const v of votes) {
    if (!memberIds.has(v.userId)) continue;
    if (v.value === VoteValue.YES) yes++;
    else no++;
  }
  return { yes, no };
}
