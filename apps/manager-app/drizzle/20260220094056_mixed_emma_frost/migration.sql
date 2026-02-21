CREATE TABLE `github_accounts` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`github_user_id` text NOT NULL,
	`login` text NOT NULL,
	`name` text,
	`email` text,
	`avatar_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_github_accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `github_credentials` (
	`id` text PRIMARY KEY,
	`github_account_id` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`refresh_token_encrypted` text,
	`token_type` text NOT NULL,
	`scope` text,
	`expires_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_github_credentials_github_account_id_github_accounts_id_fk` FOREIGN KEY (`github_account_id`) REFERENCES `github_accounts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `owner_user_id` text NOT NULL REFERENCES users(id);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_github_accounts_user_id` ON `github_accounts` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_github_accounts_github_user_id` ON `github_accounts` (`github_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_github_credentials_account_id` ON `github_credentials` (`github_account_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_owner_user_id` ON `sessions` (`owner_user_id`);