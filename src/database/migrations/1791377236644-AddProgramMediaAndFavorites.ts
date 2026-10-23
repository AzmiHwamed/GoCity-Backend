import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProgramMediaAndFavorites1791377236644 implements MigrationInterface {
  name = 'AddProgramMediaAndFavorites1791377236644';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `media` MODIFY `type` enum ('profile', 'trip', 'cover', 'document', 'program', 'other') NOT NULL DEFAULT 'other'");
    await queryRunner.query("ALTER TABLE `favorites` MODIFY `type` enum ('trip', 'activity', 'hotel', 'place', 'program') NOT NULL");
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("ALTER TABLE `favorites` MODIFY `type` enum ('trip', 'activity', 'hotel', 'place') NOT NULL");
    await queryRunner.query("ALTER TABLE `media` MODIFY `type` enum ('profile', 'trip', 'cover', 'document', 'other') NOT NULL DEFAULT 'other'");
  }
}
