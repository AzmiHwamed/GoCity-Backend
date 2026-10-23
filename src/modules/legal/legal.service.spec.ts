import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { LegalDocument, LegalType } from './entities/legal-document.entity';
import { LEGAL_DEFAULTS } from './legal.defaults';
import { LegalService } from './legal.service';

const doc = (extra: Partial<LegalDocument> = {}) =>
  Object.assign(new LegalDocument(), {
    id: 1,
    type: LegalType.TERMS_OF_USE,
    version: '1.0',
    title: 'Terms of Use',
    content: '# Terms',
    effectiveDate: '2026-10-15',
    isCurrent: true,
    ...extra,
  });

describe('LegalService', () => {
  let service: LegalService;
  const docsRepo = {
    exists: jest.fn(async (): Promise<boolean> => false),
    find: jest.fn(async (): Promise<Partial<LegalDocument>[]> => []),
    findOne: jest.fn(async (): Promise<LegalDocument | null> => null),
    create: jest.fn((d: Partial<LegalDocument>) => d),
    save: jest.fn(async (d: Partial<LegalDocument>) => d),
    delete: jest.fn(),
  };
  const usersRepo = { update: jest.fn(), findOne: jest.fn() };
  const em = {
    update: jest.fn(),
    create: jest.fn((_e: unknown, d: Partial<LegalDocument>) => d),
    save: jest.fn(async (d: Partial<LegalDocument>) => d),
  };
  const currents = (terms: string | null, privacy: string | null) =>
    docsRepo.find.mockResolvedValue([
      ...(terms ? [{ type: LegalType.TERMS_OF_USE, version: terms }] : []),
      ...(privacy ? [{ type: LegalType.PRIVACY_POLICY, version: privacy }] : []),
    ]);

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LegalService,
        { provide: getRepositoryToken(LegalDocument), useValue: docsRepo },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        {
          provide: DataSource,
          useValue: { transaction: (cb: (m: typeof em) => unknown) => cb(em) },
        },
      ],
    }).compile();
    service = moduleRef.get(LegalService);
  });

  describe('seeding', () => {
    it('creates version 1.0 of each document when none exists', async () => {
      await service.onApplicationBootstrap();
      expect(docsRepo.save).toHaveBeenCalledTimes(2);
      expect(docsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: LegalType.PRIVACY_POLICY,
          version: '1.0',
          isCurrent: true,
          title: 'Privacy Policy',
        }),
      );
    });

    it('leaves existing documents alone', async () => {
      docsRepo.exists.mockResolvedValue(true);
      await service.onApplicationBootstrap();
      expect(docsRepo.save).not.toHaveBeenCalled();
    });

    it('ships templates with placeholders and a review note', () => {
      for (const { content } of Object.values(LEGAL_DEFAULTS)) {
        expect(content).toContain('[Contact email]');
        expect(content).toContain('reviewed by a qualified lawyer');
      }
    });
  });

  it('404s when nothing is published', async () => {
    await expect(service.current(LegalType.TERMS_OF_USE)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('publish', () => {
    it('makes the new version current and keeps the previous title by default', async () => {
      docsRepo.exists.mockResolvedValue(false);
      docsRepo.findOne.mockResolvedValue(doc({ title: 'GoCity Terms' }));
      const created = await service.publish(LegalType.TERMS_OF_USE, {
        version: '1.1',
        content: '# New',
      });
      expect(em.update).toHaveBeenCalledWith(
        LegalDocument,
        { type: LegalType.TERMS_OF_USE, isCurrent: true },
        { isCurrent: false },
      );
      expect(created).toEqual(
        expect.objectContaining({ version: '1.1', title: 'GoCity Terms', isCurrent: true }),
      );
      expect(created.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('refuses a version that already exists', async () => {
      docsRepo.exists.mockResolvedValue(true);
      await expect(
        service.publish(LegalType.TERMS_OF_USE, { version: '1.0', content: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('admin edits', () => {
    it('edits the current version in place, keeping its number', async () => {
      docsRepo.findOne.mockResolvedValue(doc());
      const saved = await service.update(LegalType.TERMS_OF_USE, null, {
        content: '# Fixed',
        title: undefined,
      });
      expect(saved).toEqual(
        expect.objectContaining({ version: '1.0', content: '# Fixed', title: 'Terms of Use' }),
      );
    });

    it('refuses an empty edit and unknown versions', async () => {
      docsRepo.findOne.mockResolvedValueOnce(doc());
      await expect(service.update(LegalType.TERMS_OF_USE, null, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      docsRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.update(LegalType.TERMS_OF_USE, '7.0', { content: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('switches the current version', async () => {
      docsRepo.findOne.mockResolvedValue(doc({ isCurrent: false }));
      const now = await service.makeCurrent(LegalType.TERMS_OF_USE, '1.0');
      expect(em.update).toHaveBeenCalledWith(
        LegalDocument,
        { type: LegalType.TERMS_OF_USE, isCurrent: true },
        { isCurrent: false },
      );
      expect(now.isCurrent).toBe(true);
    });

    it('deletes old versions but not the current one', async () => {
      docsRepo.findOne.mockResolvedValueOnce(doc({ isCurrent: true }));
      await expect(service.removeVersion(LegalType.TERMS_OF_USE, '1.0')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      docsRepo.findOne.mockResolvedValueOnce(doc({ id: 4, version: '0.9', isCurrent: false }));
      await service.removeVersion(LegalType.TERMS_OF_USE, '0.9');
      expect(docsRepo.delete).toHaveBeenCalledWith(4);
    });
  });

  describe('acceptance', () => {
    it('needs acceptance until the current versions are accepted', async () => {
      currents('1.1', '1.0');
      const status = await service.statusFor({
        acceptedTermsVersion: '1.0',
        acceptedTermsAt: new Date(),
        acceptedPrivacyVersion: '1.0',
        acceptedPrivacyAt: new Date(),
      });
      expect(status.terms).toEqual(
        expect.objectContaining({
          currentVersion: '1.1',
          acceptedVersion: '1.0',
          needsAcceptance: true,
        }),
      );
      expect(status.privacy.needsAcceptance).toBe(false);
      expect(status.needsAcceptance).toBe(true);
    });

    it('nothing to accept when nothing is published', async () => {
      currents(null, null);
      const status = await service.statusFor({
        acceptedTermsVersion: null,
        acceptedTermsAt: null,
        acceptedPrivacyVersion: null,
        acceptedPrivacyAt: null,
      });
      expect(status.needsAcceptance).toBe(false);
    });

    it('records the current versions and the time', async () => {
      currents('1.1', '1.0');
      usersRepo.findOne.mockResolvedValue({ id: 3 });
      await service.accept(3);
      expect(usersRepo.update).toHaveBeenCalledWith(3, {
        acceptedTermsVersion: '1.1',
        acceptedTermsAt: expect.any(Date),
        acceptedPrivacyVersion: '1.0',
        acceptedPrivacyAt: expect.any(Date),
      });
    });

    it('can accept just one document', async () => {
      currents('1.1', '1.0');
      usersRepo.findOne.mockResolvedValue({ id: 3 });
      await service.accept(3, [LegalType.PRIVACY_POLICY]);
      expect(usersRepo.update).toHaveBeenCalledWith(3, {
        acceptedPrivacyVersion: '1.0',
        acceptedPrivacyAt: expect.any(Date),
      });
    });
  });
});
