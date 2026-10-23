import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSharedActivityToMessages1791377236648 implements MigrationInterface {
  name = 'AddSharedActivityToMessages1791377236648';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `trip_messages` ADD `shared_activity_id` int NULL');
    await queryRunner.query('ALTER TABLE `trip_messages` ADD CONSTRAINT `FK_trip_messages_shared_activity` FOREIGN KEY (`shared_activity_id`) REFERENCES `trip_activities`(`id`) ON DELETE SET NULL');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `trip_messages` DROP FOREIGN KEY `FK_trip_messages_shared_activity`');
    await queryRunner.query('ALTER TABLE `trip_messages` DROP COLUMN `shared_activity_id`');
  }
}
