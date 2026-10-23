import {
  BadRequestException,
  ForbiddenException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { User, UserRole } from '../users/entities/user.entity';
import { Media, MediaType } from './entities/media.entity';
import { UPLOAD_DIR_TOKEN } from './media.constants';
import { MediaService } from './media.service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const file = (buffer: Buffer, mimetype = 'image/png') =>
  ({ buffer, mimetype, size: buffer.length, originalname: 'photo.png' }) as Express.Multer.File;

describe('MediaService', () => {
  let service: MediaService;
  let dir: string;
  const owner: AuthUser = { id: 1, email: 'a@b.c', role: UserRole.USER };
  const repo = {
    create: jest.fn((m: Partial<Media>) => m),
    save: jest.fn(async (m: Partial<Media>) => ({ ...m, id: 10 })),
    findOne: jest.fn(),
    delete: jest.fn(),
  };
  const usersRepo = { findOne: jest.fn(), update: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    dir = mkdtempSync(join(tmpdir(), 'media-'));
    usersRepo.findOne.mockResolvedValue({ id: 1, avatarId: null });
    const moduleRef = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: getRepositoryToken(Media), useValue: repo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: UPLOAD_DIR_TOKEN, useValue: dir },
      ],
    }).compile();
    service = moduleRef.get(MediaService);
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes the file and stores only its generated name', async () => {
    const media = await service.upload(owner.id, file(PNG), { type: MediaType.TRIP, entityId: 5 });
    expect(media.filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(existsSync(join(dir, media.filename))).toBe(true);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MediaType.TRIP,
        ownerId: 1,
        entityId: 5,
        mimeType: 'image/png',
      }),
    );
    expect(usersRepo.update).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    await expect(
      service.upload(owner.id, undefined, { type: MediaType.OTHER }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a non-image that claims to be a png', async () => {
    await expect(
      service.upload(owner.id, file(Buffer.from('<script>alert(1)</script>')), {
        type: MediaType.OTHER,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('accepts real mp4/webm clips for trip media and rejects fakes', () => {
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypisom'),
      Buffer.alloc(8),
    ]);
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(12)]);
    expect(service.assertValidTripMedia(file(mp4, 'video/mp4'))).toBe('video/mp4');
    expect(service.assertValidTripMedia(file(webm, 'video/webm'))).toBe('video/webm');
    expect(() =>
      service.assertValidTripMedia(file(Buffer.from('not a video at all'), 'video/mp4')),
    ).toThrow(UnsupportedMediaTypeException);
    expect(() => service.assertValidTripMedia(file(mp4, 'video/quicktime'))).toThrow(
      UnsupportedMediaTypeException,
    );
  });

  it('removes the written file if saving the record fails', async () => {
    repo.save.mockRejectedValueOnce(new Error('db down'));
    await expect(service.upload(owner.id, file(PNG), { type: MediaType.OTHER })).rejects.toThrow(
      'db down',
    );
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('sets a profile upload as the avatar and deletes the previous one', async () => {
    writeFileSync(join(dir, 'old.png'), PNG);
    usersRepo.findOne.mockResolvedValue({ id: 1, avatarId: 3 });
    repo.findOne.mockResolvedValue({ id: 3, filename: 'old.png' });

    await service.upload(owner.id, file(PNG), { type: MediaType.PROFILE });

    expect(usersRepo.update).toHaveBeenCalledWith(1, { avatarId: 10 });
    expect(repo.delete).toHaveBeenCalledWith(3);
    expect(existsSync(join(dir, 'old.png'))).toBe(false);
  });

  it("doesn't let a user delete someone else's file", async () => {
    repo.findOne.mockResolvedValue({ id: 4, ownerId: 2, filename: 'x.png' });
    await expect(service.remove(4, owner)).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('lets the owner delete the record and the file', async () => {
    writeFileSync(join(dir, 'mine.png'), PNG);
    repo.findOne.mockResolvedValue({ id: 4, ownerId: 1, filename: 'mine.png' });
    await service.remove(4, owner);
    expect(repo.delete).toHaveBeenCalledWith(4);
    expect(existsSync(join(dir, 'mine.png'))).toBe(false);
  });

  it('lets an admin delete any file', async () => {
    repo.findOne.mockResolvedValue({ id: 4, ownerId: 2, filename: 'gone.png' });
    await service.remove(4, { id: 9, email: 'admin@x.y', role: UserRole.ADMIN });
    expect(repo.delete).toHaveBeenCalledWith(4);
  });
});
