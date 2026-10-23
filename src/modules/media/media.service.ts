import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, join } from 'path';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Paginated } from '../../common/dto/paginated-response.dto';
import { AuthUser } from '../auth/interfaces/auth-user.interface';
import { User, UserRole } from '../users/entities/user.entity';
import { QueryMediaDto, UploadMediaDto } from './dto';
import { Media, MediaType } from './entities/media.entity';
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_TRIP_MEDIA_TYPES,
  ALLOWED_VIDEO_TYPES,
  UPLOAD_DIR_TOKEN,
  detectImageType,
} from './media.constants';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectRepository(Media)
    private readonly mediaRepository: Repository<Media>,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @Inject(UPLOAD_DIR_TOKEN) private readonly uploadDir: string,
  ) {}

  /**
   * Checks the upload is a real jpeg/png/webp/gif (by its bytes, not its Content-Type) and
   * returns the detected MIME type. Call it before changing anything else in a request.
   */
  assertValidImage(file: Express.Multer.File | undefined): string {
    if (!file?.buffer?.length) throw new BadRequestException('file is required');
    const mimeType = detectImageType(file.buffer);
    if (!mimeType) {
      throw new UnsupportedMediaTypeException(
        `Only ${Object.keys(ALLOWED_IMAGE_TYPES).join(', ')} images are allowed`,
      );
    }
    return mimeType;
  }

  /** Accepts verified images and short MP4/WebM clips for trip galleries. */
  assertValidTripMedia(file: Express.Multer.File | undefined): string {
    if (!file?.buffer?.length) throw new BadRequestException('file is required');
    const image = detectImageType(file.buffer);
    if (image) return image;
    if (!file?.buffer?.length || !(file.mimetype in ALLOWED_VIDEO_TYPES)) {
      throw new UnsupportedMediaTypeException(
        `Only ${Object.keys(ALLOWED_TRIP_MEDIA_TYPES).join(', ')} media files are allowed`,
      );
    }
    const header = file.buffer.subarray(0, 16).toString('ascii');
    const isMp4 = file.mimetype === 'video/mp4' && header.includes('ftyp');
    const isWebm =
      file.mimetype === 'video/webm' &&
      file.buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (!isMp4 && !isWebm)
      throw new UnsupportedMediaTypeException('The video file is invalid or unsupported');
    return file.mimetype;
  }

  /** Writes the file to public/uploads and records it. type=profile also becomes the owner's avatar. */
  async upload(
    ownerId: number,
    upload: Express.Multer.File | undefined,
    dto: UploadMediaDto,
  ): Promise<Media> {
    const mimeType = this.assertValidTripMedia(upload);
    const file = upload as Express.Multer.File;

    const filename = `${randomUUID()}${ALLOWED_TRIP_MEDIA_TYPES[mimeType]}`;
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(join(this.uploadDir, filename), file.buffer);

    let media: Media;
    try {
      media = await this.mediaRepository.save(
        this.mediaRepository.create({
          filename,
          originalName: basename(file.originalname).slice(0, 255),
          mimeType,
          size: file.size,
          type: dto.type,
          ownerId,
          entityId: dto.entityId ?? null,
        }),
      );
    } catch (err) {
      await this.deleteFile(filename); // don't leave orphan files behind
      throw err;
    }

    if (dto.type === MediaType.PROFILE) await this.replaceAvatar(ownerId, media.id);
    return media;
  }

  /** Saves the image as the user's avatar (type=profile) and removes the previous one. */
  uploadAvatar(userId: number, file: Express.Multer.File): Promise<Media> {
    return this.upload(userId, file, { type: MediaType.PROFILE });
  }

  async findAll(user: AuthUser, query: QueryMediaDto): Promise<Paginated<Media>> {
    const { page, limit, skip, type, entityId, ownerId } = query;
    const where: FindOptionsWhere<Media> = {
      ownerId: user.role === UserRole.ADMIN && ownerId ? ownerId : user.id,
    };
    if (type) where.type = type;
    if (entityId) where.entityId = entityId;

    const [items, total] = await this.mediaRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return new Paginated(items, total, page, limit);
  }

  async findOne(id: number): Promise<Media> {
    const media = await this.mediaRepository.findOne({ where: { id } });
    if (!media) throw new NotFoundException(`Media #${id} not found`);
    return media;
  }

  /** Deletes the record and the file. Only the owner or an admin may do this. */
  async remove(id: number, user: AuthUser): Promise<void> {
    const media = await this.findOne(id);
    if (media.ownerId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('You can only delete your own files');
    }
    await this.deleteMedia(media);
  }

  /** Deletes the record and its file, without permission checks (callers check first). */
  async deleteMedia(media: Media): Promise<void> {
    await this.mediaRepository.delete(media.id); // FKs pointing at it (avatar, cover) become NULL
    await this.deleteFile(media.filename);
  }

  /** Deletes every file attached to a record, e.g. all images of a deleted trip. */
  async removeByEntity(type: MediaType, entityId: number): Promise<void> {
    const items = await this.mediaRepository.find({ where: { type, entityId } });
    if (!items.length) return;
    await this.mediaRepository.delete(items.map((m) => m.id));
    for (const m of items) await this.deleteFile(m.filename);
  }

  /** Points the user's avatar at the new image and deletes the previous one. */
  private async replaceAvatar(userId: number, mediaId: number): Promise<void> {
    const user = await this.usersRepository.findOne({
      where: { id: userId },
      select: { id: true, avatarId: true },
      loadEagerRelations: false,
    });
    const previousId = user?.avatarId;
    await this.usersRepository.update(userId, { avatarId: mediaId });

    if (previousId && previousId !== mediaId) {
      const previous = await this.mediaRepository.findOne({ where: { id: previousId } });
      if (previous) {
        await this.mediaRepository.delete(previous.id);
        await this.deleteFile(previous.filename);
      }
    }
  }

  private async deleteFile(filename: string): Promise<void> {
    try {
      await unlink(join(this.uploadDir, basename(filename)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger.warn(`Could not delete file ${filename}: ${(err as Error).message}`);
      }
    }
  }
}
