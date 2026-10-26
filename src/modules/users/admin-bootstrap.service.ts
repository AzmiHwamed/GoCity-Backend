import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { SALT_ROUNDS } from './users.service';
import { User, UserRole } from './entities/user.entity';

/** Creates the configured first administrator when the API starts. */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL')?.trim().toLowerCase();
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email || !password) {
      this.logger.warn('Admin bootstrap skipped: set ADMIN_EMAIL and ADMIN_PASSWORD to create the first admin.');
      return;
    }
    if (password.length < 8) {
      this.logger.error('Admin bootstrap skipped: ADMIN_PASSWORD must be at least 8 characters.');
      return;
    }

    const existing = await this.users.findOne({ where: { email }, withDeleted: true });
    if (existing) {
      if (existing.role !== UserRole.ADMIN) {
        this.logger.warn(`Admin bootstrap skipped: ${email} already belongs to a non-admin account.`);
      }
      return;
    }

    await this.users.save(
      this.users.create({
        firstName: 'Admin',
        lastName: 'User',
        email,
        password: await bcrypt.hash(password, SALT_ROUNDS),
        role: UserRole.ADMIN,
        isActive: true,
      }),
    );
    this.logger.log(`Created initial administrator: ${email}`);
  }
}
