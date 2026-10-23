import { MigrationInterface, QueryRunner } from 'typeorm';
export class AddTripChatReads1791377236646 implements MigrationInterface {
  name = 'AddTripChatReads1791377236646';
  async up(queryRunner: QueryRunner): Promise<void> { await queryRunner.query("CREATE TABLE `trip_chat_reads` (`id` int NOT NULL AUTO_INCREMENT, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, `trip_id` int NOT NULL, `user_id` int NOT NULL, `read_at` datetime(6) NOT NULL, UNIQUE INDEX `IDX_trip_chat_reads_trip_user` (`trip_id`, `user_id`), PRIMARY KEY (`id`)) ENGINE=InnoDB"); await queryRunner.query("ALTER TABLE `trip_chat_reads` ADD CONSTRAINT `FK_trip_chat_reads_trip` FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON DELETE CASCADE"); await queryRunner.query("ALTER TABLE `trip_chat_reads` ADD CONSTRAINT `FK_trip_chat_reads_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE"); }
  async down(queryRunner: QueryRunner): Promise<void> { await queryRunner.query('DROP TABLE `trip_chat_reads`'); }
}
