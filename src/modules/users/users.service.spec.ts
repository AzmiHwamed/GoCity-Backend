import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Favorite } from '../favorites/entities/favorite.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Interest } from '../interests/entities/interest.entity';
import { MediaService } from '../media/media.service';
import { SearchUsersDto, maskEmail } from './dto/search-users.dto';
import { User, UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
  };
  const repo = {
    findOne: jest.fn(),
    exists: jest.fn(),
    update: jest.fn(),
    create: jest.fn((dto: Partial<User>) => dto),
    save: jest.fn(async (u: Partial<User>) => ({ ...u, id: 1 })),
    createQueryBuilder: jest.fn(() => qb),
  };
  const mediaService = { assertValidImage: jest.fn(), uploadAvatar: jest.fn() };
  const refreshTokens = { update: jest.fn() };
  const trips = { count: jest.fn(async () => 0) };
  const favorites = { count: jest.fn(async () => 0) };
  const interests = { findByIds: jest.fn(async () => []) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
        { provide: getRepositoryToken(Trip), useValue: trips },
        { provide: getRepositoryToken(Favorite), useValue: favorites },
        { provide: getRepositoryToken(Interest), useValue: interests },
        { provide: MediaService, useValue: mediaService },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  const base = {
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    password: 'Str0ngPass',
  };

  it('hashes the password and defaults the role to user', async () => {
    repo.exists.mockResolvedValue(false);
    repo.findOne.mockResolvedValue({ id: 1 } as User);
    await service.create(base);
    const saved = repo.save.mock.calls[0][0] as User;
    expect(saved.password).not.toBe('Str0ngPass');
    expect(saved.password).toMatch(/^\$2[aby]\$/);
    expect(saved.role).toBe(UserRole.USER);
  });

  it('keeps organizationName only for organizations', async () => {
    repo.exists.mockResolvedValue(false);
    repo.findOne.mockResolvedValue({ id: 1 } as User);

    await service.create({ ...base, role: UserRole.ORGANIZATION, organizationName: 'Acme' });
    expect((repo.save.mock.calls[0][0] as User).organizationName).toBe('Acme');

    await service.create({ ...base, role: UserRole.USER, organizationName: 'Acme' });
    expect((repo.save.mock.calls[1][0] as User).organizationName).toBeNull();
  });

  it('rejects a duplicate email', async () => {
    repo.exists.mockResolvedValue(true);
    await expect(service.create(base)).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws NotFound for a missing user', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(service.findOne(99)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('update with avatar', () => {
    const avatar = { buffer: Buffer.from('img'), originalname: 'me.png' } as Express.Multer.File;
    const existing = () => ({ id: 1, role: UserRole.USER, email: 'jane@example.com' }) as User;

    it('updates the profile without an avatar', async () => {
      repo.findOne.mockResolvedValue(existing());
      await service.updateProfile(1, { firstName: 'Janet' });
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Janet' }));
      expect(mediaService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('saves the profile first, then the avatar', async () => {
      repo.findOne.mockResolvedValue(existing());
      const order: string[] = [];
      repo.save.mockImplementationOnce(async (u) => (order.push('save'), { ...u, id: 1 }));
      mediaService.uploadAvatar.mockImplementationOnce(async () => order.push('avatar'));

      await service.updateProfile(1, { firstName: 'Janet' }, avatar);

      expect(mediaService.assertValidImage).toHaveBeenCalledWith(avatar);
      expect(mediaService.uploadAvatar).toHaveBeenCalledWith(1, avatar);
      expect(order).toEqual(['save', 'avatar']);
    });

    it('rejects an invalid image before changing anything', async () => {
      repo.findOne.mockResolvedValue(existing());
      mediaService.assertValidImage.mockImplementationOnce(() => {
        throw new UnsupportedMediaTypeException();
      });
      await expect(service.updateProfile(1, { firstName: 'Janet' }, avatar)).rejects.toBeInstanceOf(
        UnsupportedMediaTypeException,
      );
      expect(repo.save).not.toHaveBeenCalled();
      expect(mediaService.uploadAvatar).not.toHaveBeenCalled();
    });

    it('lets an admin set another user’s avatar, owned by that user', async () => {
      repo.findOne.mockResolvedValue({ ...existing(), id: 5 });
      await service.update(5, { lastName: 'Smith' }, avatar);
      expect(mediaService.uploadAvatar).toHaveBeenCalledWith(5, avatar);
    });

    it('does not store the avatar when the admin update is rejected', async () => {
      repo.findOne.mockResolvedValue({ ...existing(), id: 5 });
      repo.exists.mockResolvedValue(true); // new email already taken
      await expect(
        service.update(5, { email: 'taken@example.com' }, avatar),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(mediaService.uploadAvatar).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    const searchQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(),
    };
    const query = (q: string, extra = {}) =>
      Object.assign(new SearchUsersDto(), { q, page: 1, limit: 10, ...extra });
    const params = () =>
      searchQb.andWhere.mock.calls.map((c) => c[1]).filter(Boolean) as Record<string, unknown>[];

    beforeEach(() => {
      repo.createQueryBuilder.mockReturnValue(searchQb as never);
      searchQb.getManyAndCount.mockResolvedValue([
        [
          Object.assign(new User(), {
            id: 2,
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@gmail.com',
            role: UserRole.USER,
            organizationName: null,
            avatar: null,
          }),
        ],
        1,
      ]);
    });
    afterEach(() => repo.createQueryBuilder.mockReturnValue(qb as never));

    it('matches each word separately ("ja sm" finds Jane Smith) and excludes me', async () => {
      await service.search(query('Ja  SM'), 1);
      expect(params()).toEqual([{ me: 1 }, { w0: '%ja%' }, { w1: '%sm%' }]);
    });

    it('escapes LIKE wildcards so they match literally', async () => {
      await service.search(query('100%_\\x'), 1);
      expect(params()).toContainEqual({ w0: '%100\\%\\_\\\\x%' });
    });

    it('masks emails unless the query is that exact address', async () => {
      const masked = await service.search(query('jane'), 1);
      expect(masked.items[0]).toMatchObject({ id: 2, email: 'ja***@gmail.com' });
      expect(masked.items[0]).not.toHaveProperty('phone');

      const exact = await service.search(query('Jane.Smith@gmail.com'), 1);
      expect(exact.items[0].email).toBe('jane.smith@gmail.com');
    });

    it("can leave out a trip's members (only if I'm in that trip)", async () => {
      await service.search(query('jane', { excludeTripId: 7 }), 1);
      const call = searchQb.andWhere.mock.calls.find((c) => String(c[0]).includes('trip_members'));
      expect(call?.[1]).toEqual({ tripId: 7, me: 1 });
      expect(String(call?.[0])).toContain('mine.user_id = :me');
    });
  });

  it.each([
    ['jane.doe@gmail.com', 'ja***@gmail.com'],
    ['jo@x.io', 'j***@x.io'],
    ['a@b.c', 'a***@b.c'],
  ])('maskEmail(%s) = %s', (email, masked) => expect(maskEmail(email)).toBe(masked));

  describe('changePassword', () => {
    beforeEach(async () => {
      qb.getOne.mockResolvedValue({ id: 1, password: await bcrypt.hash('OldPass123', 4) });
    });

    it('rejects a wrong current password', async () => {
      await expect(service.changePassword(1, 'Nope1234', 'NewPass123')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('stores a new hash and records when it changed', async () => {
      await service.changePassword(1, 'OldPass123', 'NewPass123');
      const [id, changes] = repo.update.mock.calls[0];
      expect(id).toBe(1);
      expect(await bcrypt.compare('NewPass123', changes.password)).toBe(true);
      expect(changes.passwordChangedAt).toBeInstanceOf(Date);
    });

    it('logs the user out of every device', async () => {
      await service.changePassword(1, 'OldPass123', 'NewPass123');
      expect(refreshTokens.update).toHaveBeenCalledWith(
        { userId: 1, revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });
  });

  describe('sessions are revoked when an account is disabled or deleted', () => {
    beforeEach(() => repo.findOne.mockResolvedValue({ id: 5, role: UserRole.USER } as User));

    it('on isActive=false', async () => {
      await service.update(5, { isActive: false });
      expect(refreshTokens.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }), {
        revokedAt: expect.any(Date),
      });
    });

    it('not on other admin edits', async () => {
      await service.update(5, { lastName: 'X' });
      expect(refreshTokens.update).not.toHaveBeenCalled();
    });

    it('on delete', async () => {
      (repo as unknown as { softDelete: jest.Mock }).softDelete = jest.fn();
      await service.remove(5);
      expect(refreshTokens.update).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }), {
        revokedAt: expect.any(Date),
      });
    });
  });
});
