CREATE TABLE `claude_credentials` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token_encrypted` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_claude_credentials_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_claude_credentials_user_id` ON `claude_credentials` (`user_id`);