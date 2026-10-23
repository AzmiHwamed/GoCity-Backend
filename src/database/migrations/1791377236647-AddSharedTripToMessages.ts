import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddSharedTripToMessages1791377236647 implements MigrationInterface {
  name = 'AddSharedTripToMessages1791377236647';
  async up(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('ALTER TABLE `trip_messages` ADD `shared_trip_id` int NULL'); await queryRunner.query('ALTER TABLE `trip_messages` ADD CONSTRAINT `FK_trip_messages_shared_trip` FOREIGN KEY (`shared_trip_id`) REFERENCES `trips`(`id`) ON DELETE SET NULL'); }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('ALTER TABLE `trip_messages` DROP FOREIGN KEY `FK_trip_messages_shared_trip`'); await queryRunner.query('ALTER TABLE `trip_messages` DROP COLUMN `shared_trip_id`'); }
}
