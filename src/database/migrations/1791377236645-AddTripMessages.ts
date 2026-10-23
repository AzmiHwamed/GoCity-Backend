import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTripMessages1791377236645 implements MigrationInterface {
  name = 'AddTripMessages1791377236645';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("CREATE TABLE `trip_messages` (`id` int NOT NULL AUTO_INCREMENT, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, `trip_id` int NOT NULL, `author_id` int NULL, `content` varchar(2000) NOT NULL, INDEX `IDX_trip_messages_trip_created` (`trip_id`, `created_at`), PRIMARY KEY (`id`)) ENGINE=InnoDB");
    await queryRunner.query("ALTER TABLE `trip_messages` ADD CONSTRAINT `FK_trip_messages_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION");
    await queryRunner.query("ALTER TABLE `trip_messages` ADD CONSTRAINT `FK_trip_messages_author` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION");
  }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE `trip_messages`'); }
}
