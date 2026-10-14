import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../../auth/interfaces/auth-user.interface';
import { Media, MediaType } from '../../media/entities/media.entity';
import { MediaService } from '../../media/media.service';
import { TripAccessService } from '../access/trip-access.service';
import { MAX_IMAGES_PER_REQUEST } from '../dto/share-details.dto';
import { Trip } from '../entities/trip.entity';
import { TripMemberRole } from '../trip.enums';

/**
 * A trip's images: Media rows with type=trip and entityId=tripId, ordered by `position`.
 * The cover is trip.coverMediaId, or the first image when none is chosen.
 */
@Injectable()
export class TripGalleryService {
  private readonly maxImages: number;

  constructor(
    @InjectRepository(Media) private readonly media: Repository<Media>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    private readonly mediaService: MediaService,
    config: ConfigService,
  ) {
    this.maxImages = config.get<number>('upload.maxTripImages', 30);
  }

  findAll(tripId: number): Promise<Media[]> {
    return this.findForTrips([tripId]);
  }

  /** Images of several trips at once, each trip's in gallery order. */
  async findForTrips(tripIds: number[]): Promise<Media[]> {
    if (!tripIds.length) return [];
    const items = await this.media.find({
      where: { type: MediaType.TRIP, entityId: In(tripIds) },
      order: { position: 'ASC', id: 'ASC' },
    });
    // MySQL sorts NULL first; images without a position go last.
    return [...items].sort(
      (a, b) =>
        (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
        a.id - b.id,
    );
  }

  /**
   * Checks every file and the gallery limit before anything is written,
   * so a bad file in the batch means nothing is saved.
   */
  async assertCanAdd(tripId: number, files: Express.Multer.File[]): Promise<void> {
    if (!files.length) throw new BadRequestException('Add at least one image');
    if (files.length > MAX_IMAGES_PER_REQUEST) {
      throw new BadRequestException(`At most ${MAX_IMAGES_PER_REQUEST} images per request`);
    }
    files.forEach((f) => this.mediaService.assertValidTripMedia(f));
    const existing = await this.media.count({ where: { type: MediaType.TRIP, entityId: tripId } });
    if (existing + files.length > this.maxImages) {
      throw new BadRequestException(
        `A trip can have at most ${this.maxImages} images (it has ${existing})`,
      );
    }
  }

  /** Adds images to the end of the gallery. If one fails to save, the others are removed too. */
  async add(tripId: number, uploaderId: number, files: Express.Multer.File[]): Promise<Media[]> {
    await this.assertCanAdd(tripId, files);
    const existing = await this.findAll(tripId);
    let position = Math.max(-1, ...existing.map((m) => m.position ?? -1)) + 1;

    const added: Media[] = [];
    try {
      for (const file of files) {
        const item = await this.mediaService.upload(uploaderId, file, {
          type: MediaType.TRIP,
          entityId: tripId,
        });
        item.position = position++;
        await this.media.update(item.id, { position: item.position });
        added.push(item);
      }
    } catch (err) {
      for (const item of added) await this.mediaService.deleteMedia(item);
      throw err;
    }
    return added;
  }

  /** The owner can delete any image; editors only the ones they uploaded. */
  async remove(
    tripId: number,
    mediaId: number,
    user: AuthUser,
    role: TripMemberRole,
  ): Promise<void> {
    const item = await this.getImage(tripId, mediaId);
    if (!TripAccessService.hasRole(role, TripMemberRole.OWNER) && item.ownerId !== user.id) {
      throw new ForbiddenException('Only the owner can delete images uploaded by others');
    }
    await this.mediaService.deleteMedia(item); // trip.cover_media_id becomes NULL if it was the cover
  }

  /** Reorders the gallery. The list must contain every image of the trip exactly once. */
  async reorder(tripId: number, mediaIds: number[]): Promise<Media[]> {
    const items = await this.findAll(tripId);
    const current = new Set(items.map((m) => m.id));
    if (mediaIds.length !== current.size || !mediaIds.every((id) => current.has(id))) {
      throw new BadRequestException(
        `mediaIds must list each of the trip's ${current.size} images exactly once`,
      );
    }
    for (const [position, id] of mediaIds.entries()) await this.media.update(id, { position });
    return this.findAll(tripId);
  }

  /** Picks the cover image; null goes back to "first image". */
  async setCover(tripId: number, mediaId: number | null): Promise<void> {
    if (mediaId !== null) await this.getImage(tripId, mediaId);
    await this.trips.update(tripId, { coverMediaId: mediaId });
  }

  /** The chosen cover, or the first image. */
  static coverUrl(trip: Trip, gallery: Media[]): string | null {
    const cover = gallery.find((m) => m.id === trip.coverMediaId) ?? gallery[0];
    return cover?.url ?? null;
  }

  private async getImage(tripId: number, mediaId: number): Promise<Media> {
    const item = await this.media.findOne({
      where: { id: mediaId, type: MediaType.TRIP, entityId: tripId },
    });
    if (!item) throw new NotFoundException(`Image #${mediaId} is not in this trip's gallery`);
    return item;
  }
}
