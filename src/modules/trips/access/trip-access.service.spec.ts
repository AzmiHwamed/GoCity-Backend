import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UserRole } from '../../users/entities/user.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { TripMemberRole, TripVisibility } from '../trip.enums';
import { TripAccessService } from './trip-access.service';
import { TRIP_ROLE_KEY, TripRoleGuard } from './trip-role.guard';

const { OWNER, EDITOR, VIEWER } = TripMemberRole;

describe('Trip permissions', () => {
  let access: TripAccessService;
  const trips = { exists: jest.fn() };
  const members = { findOne: jest.fn() };
  const user = { id: 5, email: 'u@x.com', role: UserRole.USER };

  beforeEach(async () => {
    jest.clearAllMocks();
    trips.exists.mockResolvedValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripAccessService,
        { provide: getRepositoryToken(Trip), useValue: trips },
        { provide: getRepositoryToken(TripMember), useValue: members },
      ],
    }).compile();
    access = moduleRef.get(TripAccessService);
  });

  // Rows: the member's role. Columns: what the route needs. Cell: allowed?
  describe.each([
    [OWNER, { [VIEWER]: true, [EDITOR]: true, [OWNER]: true }],
    [EDITOR, { [VIEWER]: true, [EDITOR]: true, [OWNER]: false }],
    [VIEWER, { [VIEWER]: true, [EDITOR]: false, [OWNER]: false }],
  ])('%s', (memberRole, expected) => {
    it.each([VIEWER, EDITOR, OWNER])('needs %s', async (needed) => {
      members.findOne.mockResolvedValue({ role: memberRole });
      const call = access.assertRole(1, user, needed);
      if (expected[needed]) await expect(call).resolves.toBe(memberRole);
      else await expect(call).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  it('hides trips from non-members (404, not 403)', async () => {
    members.findOne.mockResolvedValue(null);
    await expect(access.assertRole(1, user, VIEWER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s for a trip that does not exist', async () => {
    trips.exists.mockResolvedValue(false);
    await expect(access.assertRole(99, user, VIEWER)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('treats site admins as owners', async () => {
    members.findOne.mockResolvedValue(null);
    await expect(access.assertRole(1, { ...user, role: UserRole.ADMIN }, OWNER)).resolves.toBe(
      OWNER,
    );
  });

  describe('canView (read-only access for non-members)', () => {
    const trip = (visibility: TripVisibility, shareCode: string | null = 'Code1234567') =>
      Object.assign(new Trip(), { id: 1, visibility, shareCode });
    const stranger = { id: 50, email: 's@x.com', role: UserRole.USER };

    it.each([
      // visibility, share code sent, member?, expected
      [TripVisibility.PRIVATE, undefined, false, false],
      [TripVisibility.PRIVATE, 'Code1234567', false, false], // private ignores the share link
      [TripVisibility.PRIVATE, undefined, true, true],
      [TripVisibility.LINK, undefined, false, false],
      [TripVisibility.LINK, 'WrongCode00', false, false],
      [TripVisibility.LINK, 'Code1234567', false, true],
      [TripVisibility.LINK, undefined, true, true],
      [TripVisibility.PUBLIC, undefined, false, true],
    ])('%s, code=%s, member=%s → %s', async (visibility, code, isMember, expected) => {
      members.findOne.mockResolvedValue(isMember ? { role: VIEWER } : null);
      await expect(access.canView(trip(visibility), stranger, code)).resolves.toBe(expected);
    });

    it('never matches a missing share code', async () => {
      members.findOne.mockResolvedValue(null);
      await expect(access.canView(trip(TripVisibility.LINK, null), stranger, '')).resolves.toBe(
        false,
      );
    });

    it('admins can view anything', async () => {
      await expect(
        access.canView(trip(TripVisibility.PRIVATE), { ...stranger, role: UserRole.ADMIN }),
      ).resolves.toBe(true);
    });
  });

  describe('TripRoleGuard', () => {
    const ctx = (params: Record<string, string>, req: Record<string, unknown> = {}) => {
      const request = { user, params, ...req };
      return {
        request,
        context: {
          getHandler: () => undefined,
          getClass: () => undefined,
          switchToHttp: () => ({ getRequest: () => request }),
        } as never,
      };
    };

    it('lets routes without @TripRole through', async () => {
      const guard = new TripRoleGuard({ getAllAndOverride: () => undefined } as never, access);
      await expect(guard.canActivate(ctx({}).context)).resolves.toBe(true);
    });

    it('checks the :tripId param and stores the role on the request', async () => {
      const reflector = { getAllAndOverride: (key: string) => key === TRIP_ROLE_KEY && EDITOR };
      const guard = new TripRoleGuard(reflector as unknown as Reflector, access);
      members.findOne.mockResolvedValue({ role: OWNER });
      const { context, request } = ctx({ tripId: '7' });
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(members.findOne).toHaveBeenCalledWith({ where: { tripId: 7, userId: 5 } });
      expect((request as { tripRole?: string }).tripRole).toBe(OWNER);
    });
  });
});
