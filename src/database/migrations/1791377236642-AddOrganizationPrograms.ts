import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationPrograms1791377236642 implements MigrationInterface {
  name = 'AddOrganizationPrograms1791377236642';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "CREATE TABLE `organization_programs` (`id` int NOT NULL AUTO_INCREMENT, `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `deleted_at` datetime(6) NULL, `organization_id` int NOT NULL, `program_type` enum ('activity', 'trip') NOT NULL, `title` varchar(200) NOT NULL, `description` text NULL, `destination` varchar(150) NULL, `duration_days` int NOT NULL DEFAULT '1', `content` json NOT NULL, `is_published` tinyint NOT NULL DEFAULT 0, `use_count` int NOT NULL DEFAULT '0', INDEX `IDX_org_programs_org_published` (`organization_id`, `is_published`), PRIMARY KEY (`id`)) ENGINE=InnoDB",
    );
    await queryRunner.query(
      'ALTER TABLE `organization_programs` ADD CONSTRAINT `FK_org_programs_organization` FOREIGN KEY (`organization_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `organization_programs`');
  }
}
