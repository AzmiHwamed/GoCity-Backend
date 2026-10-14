import { MigrationInterface, QueryRunner } from 'typeorm';

/** Creates `users` (3 roles) and `media`, linked both ways: media.owner_id and users.avatar_id. */
export class InitSchema1791377236626 implements MigrationInterface {
  name = 'InitSchema1791377236626';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`first_name\` varchar(100) NOT NULL, \`last_name\` varchar(100) NOT NULL, \`email\` varchar(255) NOT NULL, \`password\` varchar(255) NOT NULL, \`role\` enum ('user', 'organization', 'admin') NOT NULL DEFAULT 'user', \`organization_name\` varchar(150) NULL, \`phone\` varchar(30) NULL, \`is_active\` tinyint NOT NULL DEFAULT 1, \`password_changed_at\` datetime(6) NULL, \`avatar_id\` int NULL, UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`media\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`filename\` varchar(255) NOT NULL, \`original_name\` varchar(255) NOT NULL, \`mime_type\` varchar(100) NOT NULL, \`size\` int NOT NULL, \`type\` enum ('profile', 'trip', 'cover', 'document', 'other') NOT NULL DEFAULT 'other', \`owner_id\` int NOT NULL, \`entity_id\` int NULL, INDEX \`IDX_a68b48d3e48a6a6234c5fc42e9\` (\`type\`, \`entity_id\`), UNIQUE INDEX \`IDX_abc159b084b9d36de6bcabbfb8\` (\`filename\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` ADD CONSTRAINT \`FK_c3401836efedec3bec459c8f818\` FOREIGN KEY (\`avatar_id\`) REFERENCES \`media\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE \`media\` ADD CONSTRAINT \`FK_c6889397830b5ed0f2a30362065\` FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`media\` DROP FOREIGN KEY \`FK_c6889397830b5ed0f2a30362065\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_c3401836efedec3bec459c8f818\``,
    );
    await queryRunner.query(`DROP INDEX \`IDX_abc159b084b9d36de6bcabbfb8\` ON \`media\``);
    await queryRunner.query(`DROP INDEX \`IDX_a68b48d3e48a6a6234c5fc42e9\` ON \`media\``);
    await queryRunner.query(`DROP TABLE \`media\``);
    await queryRunner.query(`DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``);
    await queryRunner.query(`DROP TABLE \`users\``);
  }
}
