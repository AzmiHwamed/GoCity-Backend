import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotifications1791377236635 implements MigrationInterface {
  name = 'AddNotifications1791377236635';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`notifications\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`user_id\` int NOT NULL, \`title\` varchar(150) NOT NULL, \`body\` text NOT NULL, \`type\` varchar(50) NOT NULL, \`data_json\` json NULL, \`read_at\` datetime NULL, INDEX \`IDX_notifications_user_read\` (\`user_id\`, \`read_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`notifications\` ADD CONSTRAINT \`FK_notifications_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `CREATE TABLE \`device_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, \`user_id\` int NOT NULL, \`token\` text NOT NULL, \`token_hash\` varchar(64) NOT NULL, \`platform\` varchar(32) NOT NULL DEFAULT 'web', INDEX \`IDX_device_tokens_user\` (\`user_id\`), UNIQUE INDEX \`IDX_device_tokens_token_hash\` (\`token_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`device_tokens\` ADD CONSTRAINT \`FK_device_tokens_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`device_tokens\` DROP FOREIGN KEY \`FK_device_tokens_user\``,
    );
    await queryRunner.query(`DROP TABLE \`device_tokens\``);
    await queryRunner.query(
      `ALTER TABLE \`notifications\` DROP FOREIGN KEY \`FK_notifications_user\``,
    );
    await queryRunner.query(`DROP TABLE \`notifications\``);
  }
}
