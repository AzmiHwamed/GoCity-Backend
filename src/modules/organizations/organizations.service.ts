import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { ActivityDetailsDto } from '../trips/dto/activity.dto';
import { TripActivity } from '../trips/entities/trip-activity.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripMember } from '../trips/entities/trip-member.entity';
import { TripMemberRole } from '../trips/trip.enums';
import { validateActivityDetails } from '../trips/services/activity-validation';
import {
  CreateOrganizationProgramDto,
  UpdateOrganizationProgramDto,
} from './dto/organization-program.dto';
import {
  OrganizationProgram,
  OrganizationProgramType,
} from './entities/organization-program.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Media, MediaType } from '../media/entities/media.entity';
import { MediaService } from '../media/media.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(OrganizationProgram)
    private readonly programs: Repository<OrganizationProgram>,
    @InjectRepository(Trip) private readonly trips: Repository<Trip>,
    @InjectRepository(TripMember) private readonly members: Repository<TripMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Media) private readonly media: Repository<Media>,
    private readonly mediaService: MediaService,
    private readonly dataSource: DataSource,
  ) {}

  async findMine(organizationId: number) {
    const programs = await this.programs.find({ where: { organizationId }, order: { createdAt: 'DESC' } });
    return this.withImages(programs);
  }
  async findPublished() {
    const programs = await this.programs.find({
      where: { isPublished: true },
      relations: { organization: true },
      order: { createdAt: 'DESC' },
    });
    return this.withImages(programs);
  }
  browseOrganizations() {
    return this.users.find({
      where: { role: UserRole.ORGANIZATION, isActive: true },
      relations: { avatar: true },
      order: { organizationName: 'ASC' },
    });
  }
  async organizationProfile(id: number) {
    const organization = await this.users.findOne({
      where: { id, role: UserRole.ORGANIZATION, isActive: true },
      relations: { avatar: true },
    });
    if (!organization) throw new NotFoundException(`Organization #${id} not found`);
    const [gallery, programs] = await Promise.all([
      this.media.find({
        where: { ownerId: id, entityId: id, type: MediaType.OTHER },
        order: { createdAt: 'DESC' },
      }),
      this.programs.find({
        where: { organizationId: id, isPublished: true },
        order: { createdAt: 'DESC' },
      }),
    ]);
    return { ...organization, gallery, programs };
  }
  addGallery(organizationId: number, files: Express.Multer.File[]) {
    return Promise.all(
      files.map((file) =>
        this.mediaService.upload(organizationId, file, {
          type: MediaType.OTHER,
          entityId: organizationId,
        }),
      ),
    );
  }
  gallery(organizationId: number) {
    return this.media.find({
      where: { ownerId: organizationId, entityId: organizationId, type: MediaType.OTHER },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, organizationId?: number) {
    const program = await this.programs.findOne({
      where: { id },
      relations: { organization: true },
    });
    if (!program || (!program.isPublished && program.organizationId !== organizationId))
      throw new NotFoundException(`Program #${id} not found`);
    const [images, moreFromOrganization] = await Promise.all([
      this.programImages(program.id, program.coverImageId),
      this.programs.find({
        where: { organizationId: program.organizationId, isPublished: true, id: Not(program.id) },
        order: { useCount: 'DESC', createdAt: 'DESC' },
        take: 3,
      }),
    ]);
    return { ...program, images, moreFromOrganization: await this.withImages(moreFromOrganization) };
  }

  async removeProgramImage(programId: number, organizationId: number, imageId: number) {
    const program = await this.owned(programId, organizationId);
    const image = await this.media.findOne({
      where: { id: imageId, type: MediaType.PROGRAM, entityId: programId },
    });
    if (!image) throw new NotFoundException(`Image #${imageId} not found on this program`);
    await this.mediaService.deleteMedia(image);
    if (program.coverImageId === imageId) {
      program.coverImageId = null;
      await this.programs.save(program);
    }
  }

  async setProgramCover(programId: number, organizationId: number, imageId: number) {
    const program = await this.owned(programId, organizationId);
    const exists = await this.media.exists({
      where: { id: imageId, type: MediaType.PROGRAM, entityId: programId },
    });
    if (!exists) throw new NotFoundException(`Image #${imageId} not found on this program`);
    program.coverImageId = imageId;
    await this.programs.save(program);
    return { ...program, images: await this.programImages(program.id, imageId) };
  }

  async addProgramImages(programId: number, organizationId: number, files: Express.Multer.File[]) {
    if (!files.length) throw new BadRequestException('At least one image is required');
    await this.owned(programId, organizationId);
    // Validate every file before writing any of them, so a bad selection is all-or-nothing.
    files.forEach((file) => this.mediaService.assertValidImage(file));
    return Promise.all(files.map((file) => this.mediaService.upload(organizationId, file, {
      type: MediaType.PROGRAM, entityId: programId,
    })));
  }

  async create(organizationId: number, dto: CreateOrganizationProgramDto) {
    const content = this.content(dto);
    return this.programs.save(
      this.programs.create({
        ...dto,
        durationDays: dto.durationDays ?? 1,
        currency: dto.currency?.toUpperCase() ?? null,
        content,
        organizationId,
      }),
    );
  }

  async update(id: number, organizationId: number, dto: UpdateOrganizationProgramDto) {
    const program = await this.owned(id, organizationId);
    const combined = { ...program, ...dto } as CreateOrganizationProgramDto;
    Object.assign(
      program,
      dto,
      dto.activity || dto.itinerary || dto.programType ? { content: this.content(combined) } : {},
      dto.currency ? { currency: dto.currency.toUpperCase() } : {},
    );
    return this.programs.save(program);
  }

  async remove(id: number, organizationId: number) {
    await this.programs.remove(await this.owned(id, organizationId));
    await this.mediaService.removeByEntity(MediaType.PROGRAM, id);
  }

  async apply(
    id: number,
    userId: number,
    targetTripId: number,
    startDay = 1,
    startTime?: string,
    endTime?: string,
  ) {
    const program = await this.findOne(id, userId);
    const member = await this.members.findOne({ where: { tripId: targetTripId, userId } });
    if (!member || ![TripMemberRole.OWNER, TripMemberRole.EDITOR].includes(member.role))
      throw new ForbiddenException('You need editor access to the target trip');
    const trip = await this.trips.findOne({ where: { id: targetTripId } });
    if (!trip) throw new NotFoundException(`Trip #${targetTripId} not found`);
    const entries: Record<string, unknown>[] =
      program.programType === OrganizationProgramType.ACTIVITY
        ? [program.content as Record<string, unknown>]
        : (program.content as Record<string, unknown>[]);
    const activities = entries.map((entry, index) => {
      const template = entry as unknown as ActivityDetailsDto;
      const input = {
        ...template,
        dayNumber: startDay + ((template.dayNumber ?? index + 1) - 1),
        ...(program.programType === OrganizationProgramType.ACTIVITY && startTime
          ? { startTime }
          : {}),
        ...(program.programType === OrganizationProgramType.ACTIVITY && endTime ? { endTime } : {}),
      };
      const activity = this.dataSource.manager.create(TripActivity, {
        ...input,
        tripId: targetTripId,
        createdById: userId,
      });
      validateActivityDetails(activity, trip.durationDays);
      return activity;
    });
    const saved = await this.dataSource.transaction(async (em) => {
      const created = await em.save(activities);
      await em.increment(OrganizationProgram, { id: program.id }, 'useCount', 1);
      return created;
    });
    return saved;
  }

  async analytics(organizationId: number) {
    const all = await this.programs.find({ where: { organizationId } });
    const activityPrograms = all.filter((p) => p.programType === OrganizationProgramType.ACTIVITY);
    const tripPrograms = all.filter((p) => p.programType === OrganizationProgramType.TRIP);
    return {
      totalPrograms: all.length,
      publishedPrograms: all.filter((p) => p.isPublished).length,
      activityPrograms: activityPrograms.length,
      tripPrograms: tripPrograms.length,
      totalUses: all.reduce((sum, p) => sum + p.useCount, 0),
      mostUsedPrograms: [...all].sort((a, b) => b.useCount - a.useCount).slice(0, 5),
    };
  }

  private async owned(id: number, organizationId: number) {
    const program = await this.programs.findOne({ where: { id, organizationId } });
    if (!program) throw new NotFoundException(`Program #${id} not found`);
    return program;
  }
  /** Program images in upload order, with the chosen cover image first. */
  private async programImages(programId: number, coverImageId?: number | null) {
    const images = await this.media.find({ where: { type: MediaType.PROGRAM, entityId: programId }, order: { createdAt: 'ASC', id: 'ASC' } });
    const cover = images.findIndex((image) => image.id === coverImageId);
    return cover > 0 ? [images[cover], ...images.slice(0, cover), ...images.slice(cover + 1)] : images;
  }
  private async withImages(programs: OrganizationProgram[]) {
    const images = await Promise.all(programs.map((program) => this.programImages(program.id, program.coverImageId)));
    return programs.map((program, index) => ({ ...program, images: images[index] }));
  }
  private content(dto: CreateOrganizationProgramDto) {
    if (dto.programType === OrganizationProgramType.ACTIVITY && dto.activity)
      return dto.activity as unknown as Record<string, unknown>;
    if (dto.programType === OrganizationProgramType.TRIP && dto.itinerary?.length)
      return dto.itinerary as unknown as Record<string, unknown>[];
    throw new BadRequestException(
      dto.programType === OrganizationProgramType.ACTIVITY
        ? 'activity is required for an activity program'
        : 'itinerary is required for a trip program',
    );
  }
}
