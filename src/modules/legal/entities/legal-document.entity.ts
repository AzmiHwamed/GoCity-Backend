import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum LegalType {
  PRIVACY_POLICY = 'privacy_policy',
  TERMS_OF_USE = 'terms_of_use',
}

/** URL slug per type: /legal/privacy-policy, /legal/terms. */
export const LEGAL_SLUGS: Record<string, LegalType> = {
  'privacy-policy': LegalType.PRIVACY_POLICY,
  terms: LegalType.TERMS_OF_USE,
};

/**
 * One published version of the privacy policy or the terms of use. Versions are never edited
 * after publishing; publishing a new one makes it the current version.
 */
@Entity('legal_documents')
@Index(['type', 'version'], { unique: true })
export class LegalDocument extends BaseEntity {
  @ApiProperty({ enum: LegalType })
  @Column({ type: 'enum', enum: LegalType })
  type: LegalType;

  @ApiProperty({ example: '1.0' })
  @Column({ length: 20 })
  version: string;

  @ApiProperty({ example: 'Privacy Policy' })
  @Column({ length: 150 })
  title: string;

  @ApiProperty({ description: 'Markdown: # headings, paragraphs, - lists, **bold**, [links](url)' })
  @Column({ type: 'mediumtext' })
  content: string;

  @ApiProperty({ example: '2026-10-15', description: 'Date the version takes effect' })
  @Column({ name: 'effective_date', type: 'date' })
  effectiveDate: string;

  @ApiProperty({ description: 'The version shown to users and that they are asked to accept' })
  @Column({ name: 'is_current', default: false })
  isCurrent: boolean;
}
