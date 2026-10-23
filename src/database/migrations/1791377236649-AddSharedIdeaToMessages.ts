import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSharedIdeaToMessages1791377236649 implements MigrationInterface {
  name = 'AddSharedIdeaToMessages1791377236649';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `trip_messages` ADD `shared_idea_id` int NULL');
    await queryRunner.query('ALTER TABLE `trip_messages` ADD CONSTRAINT `FK_trip_messages_shared_idea` FOREIGN KEY (`shared_idea_id`) REFERENCES `trip_ideas`(`id`) ON DELETE SET NULL');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `trip_messages` DROP FOREIGN KEY `FK_trip_messages_shared_idea`');
    await queryRunner.query('ALTER TABLE `trip_messages` DROP COLUMN `shared_idea_id`');
  }
}
