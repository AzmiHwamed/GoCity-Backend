import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Media, MediaType } from '../../media/entities/media.entity';
import { MediaService } from '../../media/media.service';
import { UserRole } from '../../users/entities/user.entity';
import { Trip } from '../entities/trip.entity';
import { TripMemberRole } from '../trip.enums';
import { TripGalleryService } from './trip-gallery.service';

const img = (id: number, extra: Partial<Media> = {}) =>
  Object.assign(new Media(), {
    id,
    filename: `${id}.png`,
    type: MediaType.TRIP,
    entityId: 10,
    ownerId: 1,
    position: id,
    ...extra,
  });
const file = (name = 'a.png') => ({ originalname: name }) as Express.Multer.File;

describe('TripGalleryService', () => {
  let service: TripGalleryService;
  let rows: Media[];
  const repo = {
    find: jest.fn(async () => rows),
    count: jest.fn(async () => rows.length),
    findOne: jest.fn(
      async ({ where }: { where: { id: number; entityId: number } }) =>
        rows.find((r) => r.id === where.id && r.entityId === where.entityId) ?? null,
    ),
    update: jest.fn(async (id: number, set: Partial<Media>) =>
      Object.assign(rows.find((r) => r.id === id) ?? {}, set),
    ),
  };
  const trips = { update: jest.fn() };
  let nextId = 100;
  const mediaService = {
    assertValidTripMedia: jest.fn(),
    upload: jest.fn(async () => {
      const m = img(nextId++, { position: null });
      rows.push(m);
      return m;
    }),
    deleteMedia: jest.fn(async (m: Media) => {
      rows = rows.filter((r) => r.id !== m.id);
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    rows = [img(1), img(2, { ownerId: 2 })];
    const moduleRef = await Test.createTestingModule({
      providers: [
        TripGalleryService,
        { provide: getRepositoryToken(Media), useValue: repo },
        { provide: getRepositoryToken(Trip), useValue: trips },
        { provide: MediaService, useValue: mediaService },
        { provide: ConfigService, useValue: { get: () => 5 } }, // MAX_TRIP_IMAGES = 5
      ],
    }).compile();
    service = moduleRef.get(TripGalleryService);
  });

  it('adds images at the end of the gallery, as trip media of that trip', async () => {
    const added = await service.add(10, 3, [file(), file()]);
    expect(mediaService.upload).toHaveBeenCalledWith(3, expect.anything(), {
      type: MediaType.TRIP,
      entityId: 10,
    });
    expect(added.map((m) => m.position)).toEqual([3, 4]);
  });

  it('validates every file before writing any', async () => {
    mediaService.assertValidTripMedia
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        throw new UnsupportedMediaTypeException();
      });
    await expect(service.add(10, 3, [file(), file('bad.txt')])).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it('enforces the per-trip limit and the per-request limit', async () => {
    await expect(service.add(10, 3, [file(), file(), file(), file()])).rejects.toThrow(
      'at most 5 images (it has 2)',
    );
    await expect(service.add(10, 3, Array(11).fill(file()))).rejects.toThrow('At most 10');
    await expect(service.add(10, 3, [])).rejects.toBeInstanceOf(BadRequestException);
    expect(mediaService.upload).not.toHaveBeenCalled();
  });

  it('removes the already-saved images if a later one fails', async () => {
    mediaService.upload
      .mockImplementationOnce(async () => {
        const m = img(nextId++);
        rows.push(m);
        return m;
      })
      .mockRejectedValueOnce(new Error('disk full'));
    await expect(service.add(10, 3, [file(), file()])).rejects.toThrow('disk full');
    expect(mediaService.deleteMedia).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.id)).toEqual([1, 2]);
  });

  describe('delete', () => {
    const editor = { id: 1, email: 'e@x', role: UserRole.USER };

    it('editors can delete their own images', async () => {
      await service.remove(10, 1, editor, TripMemberRole.EDITOR);
      expect(mediaService.deleteMedia).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
    });

    it("editors can't delete other people's images", async () => {
      await expect(service.remove(10, 2, editor, TripMemberRole.EDITOR)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('the owner can delete any image', async () => {
      await service.remove(10, 2, editor, TripMemberRole.OWNER);
      expect(mediaService.deleteMedia).toHaveBeenCalled();
    });

    it('404s for an image of another trip', async () => {
      rows.push(img(9, { entityId: 99 }));
      await expect(service.remove(10, 9, editor, TripMemberRole.OWNER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  it('reorders when given every image exactly once', async () => {
    await service.reorder(10, [2, 1]);
    expect(repo.update).toHaveBeenCalledWith(2, { position: 0 });
    expect(repo.update).toHaveBeenCalledWith(1, { position: 1 });
    await expect(service.reorder(10, [2])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reorder(10, [1, 2, 7])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cover: chosen image, else the first; must belong to the trip', async () => {
    await service.setCover(10, 2);
    expect(trips.update).toHaveBeenCalledWith(10, { coverMediaId: 2 });
    await expect(service.setCover(10, 55)).rejects.toBeInstanceOf(NotFoundException);

    const gallery = await service.findAll(10);
    expect(TripGalleryService.coverUrl({ coverMediaId: 2 } as Trip, gallery)).toBe('/files/2.png');
    expect(TripGalleryService.coverUrl({ coverMediaId: null } as Trip, gallery)).toBe(
      '/files/1.png',
    );
    expect(TripGalleryService.coverUrl({ coverMediaId: null } as Trip, [])).toBeNull();
  });
});
