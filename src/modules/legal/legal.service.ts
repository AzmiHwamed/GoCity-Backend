import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  LegalAcceptanceDto,
  LegalStatusDto,
  LegalVersionDto,
  PublishLegalDto,
  UpdateLegalDto,
} from './dto';
import { LegalDocument, LegalType } from './entities/legal-document.entity';
import { DEFAULT_LEGAL_VERSION, LEGAL_DEFAULTS } from './legal.defaults';
import { LEGAL_TRANSLATIONS, LegalLanguage } from './legal.translations';

const ALL_TYPES = [LegalType.TERMS_OF_USE, LegalType.PRIVACY_POLICY];
const today = () => new Date().toISOString().slice(0, 10);

/** Where each document's acceptance is stored on the user. */
const ACCEPTANCE = {
  [LegalType.TERMS_OF_USE]: { version: 'acceptedTermsVersion', at: 'acceptedTermsAt' },
  [LegalType.PRIVACY_POLICY]: { version: 'acceptedPrivacyVersion', at: 'acceptedPrivacyAt' },
} as const;

type Acceptance = Pick<
  User,
  'acceptedTermsVersion' | 'acceptedTermsAt' | 'acceptedPrivacyVersion' | 'acceptedPrivacyAt'
>;

/** Versioned privacy policy and terms of use, and who accepted which version. */
@Injectable()
export class LegalService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LegalService.name);

  constructor(
    @InjectRepository(LegalDocument) private readonly docs: Repository<LegalDocument>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
  ) {}

  /** Seeds version 1.0 of each document when none exists yet. */
  async onApplicationBootstrap(): Promise<void> {
    for (const type of ALL_TYPES) {
      try {
        if (await this.docs.exists({ where: { type } })) continue;
        await this.docs.save(
          this.docs.create({
            type,
            version: DEFAULT_LEGAL_VERSION,
            ...LEGAL_DEFAULTS[type],
            effectiveDate: today(),
            isCurrent: true,
          }),
        );
        this.logger.log(
          `Seeded ${type} v${DEFAULT_LEGAL_VERSION} (template: review before launch)`,
        );
      } catch (err) {
        this.logger.error(`Could not seed ${type}`, (err as Error).message);
      }
    }
  }

  async current(type: LegalType, language: LegalLanguage = 'en'): Promise<LegalDocument> {
    const doc = await this.docs.findOne({ where: { type, isCurrent: true } });
    if (!doc) throw new NotFoundException('This document has not been published yet');
    const translation = LEGAL_TRANSLATIONS[language]?.[type];
    return translation ? Object.assign(doc, translation) : doc;
  }

  async versions(type: LegalType): Promise<LegalVersionDto[]> {
    const rows = await this.docs.find({
      where: { type },
      select: { version: true, title: true, effectiveDate: true, isCurrent: true, createdAt: true },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return rows.map(({ version, title, effectiveDate, isCurrent, createdAt }) => ({
      version,
      title,
      effectiveDate,
      isCurrent,
      createdAt,
    }));
  }

  async version(type: LegalType, version: string): Promise<LegalDocument> {
    const doc = await this.docs.findOne({ where: { type, version } });
    if (!doc) throw new NotFoundException(`Version ${version} not found`);
    return doc;
  }

  /** Publishes a new version and makes it current. Users are asked to accept it again. */
  async publish(type: LegalType, dto: PublishLegalDto): Promise<LegalDocument> {
    if (await this.docs.exists({ where: { type, version: dto.version } })) {
      throw new ConflictException(`Version ${dto.version} already exists`);
    }
    const previous = await this.docs.findOne({ where: { type, isCurrent: true } });
    return this.dataSource.transaction(async (em) => {
      await em.update(LegalDocument, { type, isCurrent: true }, { isCurrent: false });
      return em.save(
        em.create(LegalDocument, {
          type,
          version: dto.version,
          title: dto.title ?? previous?.title ?? LEGAL_DEFAULTS[type].title,
          content: dto.content,
          effectiveDate: dto.effectiveDate ?? today(),
          isCurrent: true,
        }),
      );
    });
  }

  /** Edits a version in place (the current one when `version` is null). Keeps acceptances. */
  async update(
    type: LegalType,
    version: string | null,
    dto: UpdateLegalDto,
  ): Promise<LegalDocument> {
    const doc = version ? await this.version(type, version) : await this.current(type);
    const changes = Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
    if (!Object.keys(changes).length) throw new BadRequestException('Nothing to change');
    Object.assign(doc, changes);
    return this.docs.save(doc);
  }

  /**
   * Makes an existing version the current one (e.g. to roll back). Users who accepted a different
   * version are asked to accept again.
   */
  async makeCurrent(type: LegalType, version: string): Promise<LegalDocument> {
    const doc = await this.version(type, version);
    if (doc.isCurrent) return doc;
    return this.dataSource.transaction(async (em) => {
      await em.update(LegalDocument, { type, isCurrent: true }, { isCurrent: false });
      doc.isCurrent = true;
      return em.save(doc);
    });
  }

  /** Deletes an old version. The current one can't be deleted (make another current first). */
  async removeVersion(type: LegalType, version: string): Promise<void> {
    const doc = await this.version(type, version);
    if (doc.isCurrent) {
      throw new BadRequestException(
        'The current version cannot be deleted; make another version current first',
      );
    }
    await this.docs.delete(doc.id);
  }

  /** Records that the user accepts the current version of these documents (default: both). */
  async accept(userId: number, types: LegalType[] = ALL_TYPES): Promise<LegalStatusDto> {
    const currents = await this.currentVersions();
    const changes: Partial<Acceptance> = {};
    const now = new Date();
    for (const type of types) {
      const version = currents[type];
      if (!version) continue; // nothing published: nothing to accept
      Object.assign(changes, { [ACCEPTANCE[type].version]: version, [ACCEPTANCE[type].at]: now });
    }
    if (Object.keys(changes).length) await this.users.update(userId, changes);
    return this.status(userId);
  }

  async status(userId: number): Promise<LegalStatusDto> {
    const user = await this.users.findOne({
      where: { id: userId },
      select: {
        id: true,
        acceptedTermsVersion: true,
        acceptedTermsAt: true,
        acceptedPrivacyVersion: true,
        acceptedPrivacyAt: true,
      },
    });
    if (!user) throw new NotFoundException(`User #${userId} not found`);
    return this.statusFor(user);
  }

  /** Status from a loaded user (avoids a second user query on /me). */
  async statusFor(user: Acceptance): Promise<LegalStatusDto> {
    const currents = await this.currentVersions();
    const one = (type: LegalType): LegalAcceptanceDto => {
      const currentVersion = currents[type] ?? null;
      const acceptedVersion = user[ACCEPTANCE[type].version] ?? null;
      return {
        currentVersion,
        acceptedVersion,
        acceptedAt: user[ACCEPTANCE[type].at] ?? null,
        needsAcceptance: !!currentVersion && currentVersion !== acceptedVersion,
      };
    };
    const terms = one(LegalType.TERMS_OF_USE);
    const privacy = one(LegalType.PRIVACY_POLICY);
    return { terms, privacy, needsAcceptance: terms.needsAcceptance || privacy.needsAcceptance };
  }

  private async currentVersions(): Promise<Partial<Record<LegalType, string>>> {
    const rows = await this.docs.find({
      where: { isCurrent: true },
      select: { type: true, version: true },
    });
    return Object.fromEntries(rows.map((r) => [r.type, r.version]));
  }
}
