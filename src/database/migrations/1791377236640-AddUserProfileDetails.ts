import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileDetails1791377236640 implements MigrationInterface {
  name = 'AddUserProfileDetails1791377236640';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `users` ADD `about_me` text NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `users` DROP COLUMN `about_me`');
  }
}
