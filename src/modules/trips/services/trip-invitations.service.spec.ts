import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MailService } from '../../mail/mail.service';
import { UserRole } from '../../users/entities/user.entity';
import { UsersService } from '../../users/users.service';
import { TripInvitation } from '../entities/trip-invitation.entity';
import { TripMember } from '../entities/trip-member.entity';
import { Trip } from '../entities/trip.entity';
import { InvitationStatus, TripMemberRole } from '../trip.enums';
import { TripIdeasService } from './trip-ideas.service';
import { TripInvitationsService } from './trip-invitations.service';
import { TripMembersService } from './trip-members.service';

const owner = { id: 1, email: 'owner@x.com', role: UserRole.USER };
const friend = { id: 2, email: 'friend@x.com', firstName: 'Fr', lastName: 'Iend', isActive: true };

describe('Trip invitations and invite link', () => {
  let invitations: TripInvitationsService;
  let membersService: TripMembersService;

  const tripsRepo = {
    findOne: jest.fn(async () =>
      Object.assign(new Trip(), {
        id: 10,
        name: 'Lisbon',
        startDate: '2026-11-01',
        endDate: '2026-11-03',
        inviteCode: 'abc',
        owner: { firstName: 'Jane', lastName: 'Doe' },
      }),
    ),
  };
  const membersRepo = {
    exists: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(async () => 2),
    create: jest.fn((m: Partial<TripMember>) => m),
    save: jest.fn(async (m: Partial<TripMember>) => m),
  };
  const invitationsRepo = {
    exists: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((i: Partial<TripInvitation>) => i),
    save: jest.fn(async (i: Partial<TripInvitation>) => ({ ...i, id: 50 })),
    update: jest.fn(),
  };
  const usersService = { findById: jest.fn(), findByEmail: jest.fn() };
  const mailService = { sendTripInvitation: jest.fn() };
  const em = {
    findOne: jest.fn(),
    create: jest.fn((_e: unknown, d: object) => d),
    save: jest.fn(async (d: object) => d),
    update: jest.fn(),
  };
  const dataSource = { transaction: jest.fn(async (cb: (m: typeof em) => unknown) => cb(em)) };

  beforeEach(async () => {
    jest.clearAllMocks();
    membersRepo.exists.mockResolvedValue(false);
    invitationsRepo.exists.mockResolvedValue(false);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripInvitationsService,
        TripMembersService,
        { provide: getRepositoryToken(Trip), useValue: tripsRepo },
        { provide: getRepositoryToken(TripMember), useValue: membersRepo },
        { provide: getRepositoryToken(TripInvitation), useValue: invitationsRepo },
        { provide: UsersService, useValue: usersService },
        { provide: MailService, useValue: mailService },
        { provide: TripIdeasService, useValue: { onMemberLeft: jest.fn() } },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: { get: () => 'https://app.example.com' } },
      ],
    }).compile();
    invitations = moduleRef.get(TripInvitationsService);
    membersService = moduleRef.get(TripMembersService);
  });

  describe('send', () => {
    it('invites an existing user by id with the chosen role and emails them', async () => {
      usersService.findById.mockImplementation(async (id: number) =>
        id === 2 ? friend : { id: 1, firstName: 'Jane', lastName: 'Doe' },
      );
      const inv = await invitations.send(10, owner, { userId: 2, role: TripMemberRole.EDITOR });
      expect(inv).toMatchObject({
        inviteeUserId: 2,
        inviteeEmail: 'friend@x.com',
        role: TripMemberRole.EDITOR,
        status: InvitationStatus.PENDING,
      });
      expect(mailService.sendTripInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'friend@x.com', hasAccount: true, tripName: 'Lisbon' }),
      );
    });

    it('invites an email without an account (viewer by default)', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      const inv = await invitations.send(10, owner, { email: 'new@x.com' });
      expect(inv).toMatchObject({
        inviteeUserId: null,
        inviteeEmail: 'new@x.com',
        role: TripMemberRole.VIEWER,
      });
      expect(mailService.sendTripInvitation).toHaveBeenCalledWith(
        expect.objectContaining({ hasAccount: false }),
      );
    });

    it('needs exactly one of email or userId', async () => {
      await expect(invitations.send(10, owner, {})).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        invitations.send(10, owner, { email: 'a@b.c', userId: 2 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects inviting yourself, members, and people already invited', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      await expect(invitations.send(10, owner, { email: 'owner@x.com' })).rejects.toBeInstanceOf(
        BadRequestException,
      );

      usersService.findById.mockResolvedValue(friend);
      membersRepo.exists.mockResolvedValueOnce(true);
      await expect(invitations.send(10, owner, { userId: 2 })).rejects.toBeInstanceOf(
        ConflictException,
      );

      invitationsRepo.exists.mockResolvedValueOnce(true);
      await expect(invitations.send(10, owner, { userId: 2 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('still creates the invitation if the email fails', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      mailService.sendTripInvitation.mockRejectedValueOnce(new Error('SMTP down'));
      await expect(invitations.send(10, owner, { email: 'new@x.com' })).resolves.toMatchObject({
        id: 50,
      });
    });
  });

  describe('accept', () => {
    const me = { id: 3, email: 'new@x.com', role: UserRole.USER };

    it('adds me as a member with the invitation role', async () => {
      invitationsRepo.findOne.mockResolvedValue({
        id: 50,
        tripId: 10,
        role: TripMemberRole.EDITOR,
        inviteeUserId: null,
        inviteeEmail: 'new@x.com',
      });
      em.findOne.mockResolvedValue(null);
      await expect(invitations.accept(50, me)).resolves.toEqual({
        tripId: 10,
        role: TripMemberRole.EDITOR,
        alreadyMember: false,
      });
      expect(em.save).toHaveBeenCalledWith({ tripId: 10, userId: 3, role: TripMemberRole.EDITOR });
      expect(em.update).toHaveBeenCalledWith(
        TripInvitation,
        50,
        expect.objectContaining({
          status: InvitationStatus.ACCEPTED,
          inviteeUserId: 3,
        }),
      );
    });

    it('only finds pending invitations addressed to me (by id or by email)', async () => {
      invitationsRepo.findOne.mockResolvedValue(null);
      await expect(invitations.accept(50, me)).rejects.toBeInstanceOf(NotFoundException);
      const where = invitationsRepo.findOne.mock.calls[0][0].where;
      expect(where).toEqual([
        { inviteeUserId: 3, status: InvitationStatus.PENDING, id: 50 },
        expect.objectContaining({
          inviteeEmail: 'new@x.com',
          status: InvitationStatus.PENDING,
          id: 50,
        }),
      ]);
    });
  });

  describe('invite link', () => {
    it('joins as editor', async () => {
      membersRepo.findOne.mockResolvedValue(null);
      await expect(membersService.joinByCode('abc', 2)).resolves.toEqual({
        tripId: 10,
        role: TripMemberRole.EDITOR,
        alreadyMember: false,
      });
      expect(membersRepo.save).toHaveBeenCalledWith({
        tripId: 10,
        userId: 2,
        role: TripMemberRole.EDITOR,
      });
    });

    it("doesn't change anything for an existing member", async () => {
      membersRepo.findOne.mockResolvedValue({ role: TripMemberRole.VIEWER });
      await expect(membersService.joinByCode('abc', 2)).resolves.toEqual({
        tripId: 10,
        role: TripMemberRole.VIEWER,
        alreadyMember: true,
      });
      expect(membersRepo.save).not.toHaveBeenCalled();
    });

    it('404s for an unknown or reset code', async () => {
      tripsRepo.findOne.mockResolvedValueOnce(null as never);
      await expect(membersService.joinByCode('old', 2)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('previews the trip', async () => {
      membersRepo.exists.mockResolvedValue(false);
      await expect(membersService.preview('abc', 2)).resolves.toMatchObject({
        tripId: 10,
        name: 'Lisbon',
        durationDays: 3,
        ownerName: 'Jane Doe',
        memberCount: 2,
        alreadyMember: false,
      });
    });
  });

  describe('members', () => {
    it("can't remove, demote or let the owner leave", async () => {
      membersRepo.findOne.mockResolvedValue({ id: 1, role: TripMemberRole.OWNER });
      await expect(membersService.remove(10, 1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(membersService.leave(10, 1)).rejects.toBeInstanceOf(BadRequestException);
      await expect(membersService.updateRole(10, 1, TripMemberRole.VIEWER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
