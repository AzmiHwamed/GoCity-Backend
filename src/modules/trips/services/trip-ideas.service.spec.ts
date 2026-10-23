import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IdeaVote } from '../entities/idea-vote.entity';
import { TripActivity } from '../entities/trip-activity.entity';
import { TripIdea } from '../entities/trip-idea.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { ActivityKind, IdeaStatus, TripMemberRole, VoteValue } from '../trip.enums';
import { TripIdeasService } from './trip-ideas.service';

describe('TripIdeasService (voting)', () => {
  let service: TripIdeasService;
  let idea: TripIdea;
  let votes: IdeaVote[];
  let memberIds: number[];

  const ideasRepo = {
    findOne: jest.fn(async () => ({ ...idea, votes: [...votes] })),
    find: jest.fn(async () => [{ id: idea.id }]),
    update: jest.fn(async (where: { status?: IdeaStatus }, set: Partial<TripIdea>) => {
      if (!where.status || where.status === idea.status) Object.assign(idea, set);
    }),
    delete: jest.fn(),
  };
  const votesRepo = {
    findOne: jest.fn(async ({ where }: { where: { userId: number } }) =>
      votes.find((v) => v.userId === where.userId),
    ),
    create: jest.fn((v: Partial<IdeaVote>) => v),
    save: jest.fn(async (v: IdeaVote) => {
      votes = [...votes.filter((x) => x.userId !== v.userId), v];
      return v;
    }),
    delete: jest.fn(async ({ userId }: { userId: number }) => {
      votes = votes.filter((v) => v.userId !== userId);
    }),
  };
  const membersRepo = { find: jest.fn(async () => memberIds.map((userId) => ({ userId }))) };
  const activitiesRepo = { find: jest.fn(async () => []) };
  const createdActivities: Partial<TripActivity>[] = [];
  const em = {
    update: jest.fn(async (_entity: unknown, where: { status?: IdeaStatus }, set: object) => {
      if (where.status && where.status !== idea.status) return { affected: 0 };
      Object.assign(idea, set);
      return { affected: 1 };
    }),
    create: jest.fn((_entity: unknown, data: Partial<TripActivity>) => data),
    save: jest.fn(async (a: Partial<TripActivity>) => {
      createdActivities.push(a);
      return { ...a, id: 77 };
    }),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: typeof em) => unknown) => cb(em)) };

  beforeEach(async () => {
    jest.clearAllMocks();
    createdActivities.length = 0;
    idea = Object.assign(new TripIdea(), {
      id: 1,
      tripId: 10,
      createdById: 1,
      status: IdeaStatus.OPEN,
      activityId: null,
      kind: ActivityKind.ACTIVITY,
      name: 'Sunset cruise',
      dayNumber: 2,
      startTime: '18:00:00',
      endTime: '20:00:00',
      expense: 40,
    });
    votes = [{ ideaId: 1, userId: 1, value: VoteValue.YES } as IdeaVote];
    memberIds = [1, 2, 3, 4];

    const moduleRef = await Test.createTestingModule({
      providers: [
        TripIdeasService,
        { provide: getRepositoryToken(TripIdea), useValue: ideasRepo },
        { provide: getRepositoryToken(TripActivity), useValue: activitiesRepo },
        { provide: getRepositoryToken(IdeaVote), useValue: votesRepo },
        { provide: getRepositoryToken(TripMember), useValue: membersRepo },
        { provide: getRepositoryToken(Trip), useValue: {} },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(TripIdeasService);
  });

  it('stays open without a majority (2 of 4 yes)', async () => {
    const res = await service.vote(10, 1, 2, VoteValue.YES);
    expect(idea.status).toBe(IdeaStatus.OPEN);
    expect(res).toMatchObject({ yesCount: 2, noCount: 0, memberCount: 4, myVote: VoteValue.YES });
    expect(createdActivities).toHaveLength(0);
  });

  it('becomes an activity when more than half vote yes', async () => {
    await service.vote(10, 1, 2, VoteValue.YES);
    await service.vote(10, 1, 3, VoteValue.YES);
    expect(idea.status).toBe(IdeaStatus.ACCEPTED);
    expect(idea.activityId).toBe(77);
    expect(createdActivities).toEqual([
      expect.objectContaining({
        tripId: 10,
        name: 'Sunset cruise',
        dayNumber: 2,
        startTime: '18:00:00',
        expense: 40,
        createdById: 1,
      }),
    ]);
  });

  it('is rejected on a tie, since yes can no longer win', async () => {
    await service.vote(10, 1, 2, VoteValue.YES);
    await service.vote(10, 1, 3, VoteValue.NO);
    await service.vote(10, 1, 4, VoteValue.NO);
    expect(idea.status).toBe(IdeaStatus.REJECTED);
    expect(createdActivities).toHaveLength(0);
  });

  it('lets members change their vote while open', async () => {
    await service.vote(10, 1, 2, VoteValue.NO);
    const res = await service.vote(10, 1, 2, VoteValue.YES);
    expect(res).toMatchObject({ yesCount: 2, noCount: 0 });
  });

  it('closes voting once decided', async () => {
    idea.status = IdeaStatus.ACCEPTED;
    await expect(service.vote(10, 1, 2, VoteValue.NO)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never creates two activities if two deciding votes race', async () => {
    votes.push({ ideaId: 1, userId: 2, value: VoteValue.YES } as IdeaVote);
    votes.push({ ideaId: 1, userId: 3, value: VoteValue.YES } as IdeaVote);
    await Promise.all([service.evaluate(1), service.evaluate(1)]);
    expect(createdActivities).toHaveLength(1);
  });

  it('re-counts when a member leaves (their vote no longer counts)', async () => {
    // 4 members: 1 and 2 yes → open. Member 3 leaves → 2 of 3 is a majority.
    votes.push({ ideaId: 1, userId: 2, value: VoteValue.YES } as IdeaVote);
    await service.evaluate(1);
    expect(idea.status).toBe(IdeaStatus.OPEN);

    memberIds = [1, 2, 4];
    await service.onMemberLeft(10, 3);
    expect(idea.status).toBe(IdeaStatus.ACCEPTED);
  });

  it('only the proposer or the owner can delete an open idea', async () => {
    await expect(service.remove(10, 1, 2, TripMemberRole.EDITOR)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await service.remove(10, 1, 2, TripMemberRole.OWNER);
    await service.remove(10, 1, 1, TripMemberRole.VIEWER);
    expect(ideasRepo.delete).toHaveBeenCalledTimes(2);
  });
});
