import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInterests1791377236641 implements MigrationInterface {
  name = 'AddInterests1791377236641';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE `interests` (`id` int NOT NULL AUTO_INCREMENT, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, `name` varchar(40) NOT NULL, UNIQUE INDEX `IDX_interests_name` (`name`), PRIMARY KEY (`id`)) ENGINE=InnoDB',
    );
    await queryRunner.query(
      'CREATE TABLE `user_interests` (`user_id` int NOT NULL, `interest_id` int NOT NULL, INDEX `IDX_user_interests_user` (`user_id`), INDEX `IDX_user_interests_interest` (`interest_id`), PRIMARY KEY (`user_id`, `interest_id`)) ENGINE=InnoDB',
    );
    await queryRunner.query('ALTER TABLE `user_interests` ADD CONSTRAINT `FK_user_interests_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE');
    await queryRunner.query('ALTER TABLE `user_interests` ADD CONSTRAINT `FK_user_interests_interest` FOREIGN KEY (`interest_id`) REFERENCES `interests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `user_interests`');
    await queryRunner.query('DROP TABLE `interests`');
  }
}
