import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Paginated } from '../../common/dto/paginated-response.dto';
import { MediaService } from '../media/media.service';
import { Favorite } from '../favorites/entities/favorite.entity';
import { Trip } from '../trips/entities/trip.entity';
import { TripVisibility } from '../trips/trip.enums';
import { Interest } from '../interests/entities/interest.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import {
  SearchUsersDto,
  UserSearchResultDto,
  escapeLike,
  maskEmail,
  toUserSummary,
} from './dto/search-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';

export const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(Trip)
    private readonly trips: Repository<Trip>,
    @InjectRepository(Favorite)
    private readonly favorites: Repository<Favorite>,
    @InjectRepository(Interest)
    private readonly interests: Repository<Interest>,
    private readonly mediaService: MediaService,
  ) {}

  async create(dto: CreateUserDto, isActive = true): Promise<User> {
    await this.ensureEmailIsFree(dto.email);
    const role = dto.role ?? UserRole.USER;
    const user = this.usersRepository.create({
      ...dto,
      role,
      organizationName: role === UserRole.ORGANIZATION ? dto.organizationName : null,
      isActive,
      password: await bcrypt.hash(dto.password, SALT_ROUNDS),
    });
    const saved = await this.usersRepository.save(user);
    return this.findOne(saved.id);
  }

  async activate(id: number): Promise<User> {
    await this.usersRepository.update(id, { isActive: true });
    return this.findOne(id);
  }

  async findAll(query: QueryUserDto): Promise<Paginated<User>> {
    const { page, limit, skip, search, role } = query;
    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.avatar', 'avatar');

    if (role) qb.andWhere('user.role = :role', { role });
    if (search) {
      qb.andWhere(
        new Brackets((w) => {
          w.where('user.firstName LIKE :s', { s: `%${search}%` })
            .orWhere('user.lastName LIKE :s', { s: `%${search}%` })
            .orWhere('user.email LIKE :s', { s: `%${search}%` })
            .orWhere('user.organizationName LIKE :s', { s: `%${search}%` });
        }),
      );
    }

    const [items, total] = await qb
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return new Paginated(items, total, page, limit);
  }

  /**
   * Finds active users by part of their name, organization or email. Every word of the query
   * must match one of those ("jo sm" finds John Smith). Emails come back masked unless the
   * query is that exact address, so the search can't be used to collect everyone's email.
   */
  async search(query: SearchUsersDto, me: number): Promise<Paginated<UserSearchResultDto>> {
    const { page, limit, skip } = query;
    const words = query.q.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 5);

    const qb = this.usersRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.avatar', 'avatar')
      .where('user.isActive = :active', { active: true })
      .andWhere('user.id != :me', { me });

    words.forEach((word, i) => {
      const p = `w${i}`;
      qb.andWhere(
        new Brackets((w) => {
          w.where(`LOWER(user.firstName) LIKE :${p}`)
            .orWhere(`LOWER(user.lastName) LIKE :${p}`)
            .orWhere(`LOWER(user.organizationName) LIKE :${p}`)
            .orWhere(`LOWER(user.email) LIKE :${p}`);
        }),
        { [p]: `%${escapeLike(word)}%` },
      );
    });

    if (query.excludeTripId) {
      // Only applied if the caller belongs to that trip, so it can't reveal other trips' members.
      qb.andWhere(
        `user.id NOT IN (
          SELECT tm.user_id FROM trip_members tm
          WHERE tm.trip_id = :tripId
            AND EXISTS (SELECT 1 FROM trip_members mine WHERE mine.trip_id = :tripId AND mine.user_id = :me)
        )`,
        { tripId: query.excludeTripId, me },
      );
    }

    const [users, total] = await qb
      .orderBy('user.firstName', 'ASC')
      .addOrderBy('user.lastName', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const exact = query.q.trim().toLowerCase();
    const items = users.map((u) => ({
      ...toUserSummary(u),
      email: u.email === exact ? u.email : maskEmail(u.email),
    }));
    return new Paginated(items, total, page, limit);
  }

  async findOne(id: number): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`User #${id} not found`);
    const [tripCount, savedCount, sharedTripCount] = await Promise.all([
      this.trips.count({ where: { ownerId: id } }),
      this.favorites.count({ where: { userId: id } }),
      this.trips.count({
        where: { ownerId: id, visibility: In([TripVisibility.LINK, TripVisibility.PUBLIC]) },
      }),
    ]);
    Object.assign(user, { tripCount, savedCount, sharedTripCount });
    return user;
  }

  findById(id: number): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /** Same as findByEmail but includes the password hash (for login). */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  /** Admin update; an optional image becomes the user's avatar. */
  async update(id: number, dto: UpdateUserDto, avatar?: Express.Multer.File): Promise<User> {
    const user = await this.findOne(id);
    if (avatar) this.mediaService.assertValidImage(avatar);
    if (dto.email && dto.email !== user.email) await this.ensureEmailIsFree(dto.email);
    // PATCH treats null as "leave this field unchanged" rather than clearing profile data.
    Object.assign(user, Object.fromEntries(Object.entries(dto).filter(([, value]) => value != null)));

    if (user.role === UserRole.ORGANIZATION && !user.organizationName) {
      throw new BadRequestException('organizationName is required for organizations');
    }
    if (user.role !== UserRole.ORGANIZATION) user.organizationName = null;

    const saved = await this.saveWithAvatar(user, avatar);
    if (dto.isActive === false) await this.revokeSessions(id); // log a disabled user out everywhere
    return saved;
  }

  /** Self-service profile update; an optional image becomes the user's avatar. */
  async updateProfile(
    id: number,
    dto: UpdateProfileDto,
    avatar?: Express.Multer.File,
  ): Promise<User> {
    const user = await this.findOne(id);
    if (avatar) this.mediaService.assertValidImage(avatar);
    const { organizationName, interests, ...rest } = dto;
    Object.assign(user, Object.fromEntries(Object.entries(rest).filter(([, value]) => value != null)));
    if (organizationName != null && user.role === UserRole.ORGANIZATION) {
      user.organizationName = organizationName;
    }
    if (interests != null) {
      const uniqueIds = [...new Set(interests)];
      const selected = await this.interests.findByIds(uniqueIds);
      if (selected.length !== uniqueIds.length) {
        throw new BadRequestException('One or more interests do not exist');
      }
      user.interests = selected;
    }
    return this.saveWithAvatar(user, avatar);
  }

  /**
   * Saves the user, then stores the avatar (if any). The avatar goes last: saving the user
   * afterwards would write the previously loaded avatar back. All validation must happen before.
   */
  private async saveWithAvatar(user: User, avatar?: Express.Multer.File): Promise<User> {
    await this.usersRepository.save(user);
    if (avatar) await this.mediaService.uploadAvatar(user.id, avatar);
    return this.findOne(user.id);
  }

  /** Verifies the current password, then sets the new one. */
  async changePassword(id: number, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.id = :id', { id })
      .getOne();
    if (!user) throw new NotFoundException(`User #${id} not found`);

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      throw new BadRequestException('Current password is incorrect');
    }
    await this.setPassword(id, newPassword);
  }

  /** Hashes and stores a new password; invalidates tokens issued before now. */
  async setPassword(id: number, newPassword: string): Promise<void> {
    await this.usersRepository.update(id, {
      password: await bcrypt.hash(newPassword, SALT_ROUNDS),
      passwordChangedAt: new Date(),
    });
    await this.revokeSessions(id);
  }

  /** Revokes every refresh token of the user (all devices must log in again). */
  async revokeSessions(userId: number): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  async remove(id: number): Promise<void> {
    await this.findOne(id);
    await this.usersRepository.softDelete(id);
    await this.revokeSessions(id);
  }

  private async ensureEmailIsFree(email: string): Promise<void> {
    const exists = await this.usersRepository.exists({ where: { email }, withDeleted: true });
    if (exists) throw new ConflictException('Email is already registered');
  }
}
