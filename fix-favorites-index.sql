-- One-time fix for: "Cannot drop index 'IDX_c6406c7f3c8bff3cc0f0c0a7da': needed in a foreign key constraint"
-- Run against the nestjs_app database, then start the backend again. Both statements keep all existing rows.
USE nestjs_app;

-- 1. Give the user_id foreign key its own index, so MySQL no longer depends on the unique (user_id, type, target_id) index.
CREATE INDEX `IDX_favorites_user_id` ON `favorites` (`user_id`);

-- 2. Add the new 'program' favourite type in place, so synchronize doesn't drop and rebuild the column.
ALTER TABLE `favorites` MODIFY `type` ENUM('trip','activity','hotel','place','program') NOT NULL;
