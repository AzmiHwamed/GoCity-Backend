import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddOrganizationLocation1791377236643 implements MigrationInterface {
  name = 'AddOrganizationLocation1791377236643';
  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `users` ADD `organization_location_name` varchar(255) NULL, ADD `organization_latitude` decimal(10,7) NULL, ADD `organization_longitude` decimal(10,7) NULL',
    );
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE `users` DROP COLUMN `organization_longitude`, DROP COLUMN `organization_latitude`, DROP COLUMN `organization_location_name`',
    );
  }
}
