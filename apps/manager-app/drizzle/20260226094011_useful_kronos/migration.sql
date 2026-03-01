CREATE TABLE `slack_link_tokens` (
	`id` text PRIMARY KEY,
	`token` text NOT NULL UNIQUE,
	`slack_user_id` text NOT NULL,
	`slack_team_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `slack_thread_sessions` (
	`id` text PRIMARY KEY,
	`slack_team_id` text NOT NULL,
	`slack_channel_id` text NOT NULL,
	`slack_thread_ts` text NOT NULL,
	`session_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`last_posted_message_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_slack_thread_sessions_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_slack_thread_sessions_owner_user_id_users_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `slack_user_mappings` (
	`id` text PRIMARY KEY,
	`slack_user_id` text NOT NULL,
	`slack_team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_slack_user_mappings_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_slack_thread_sessions_thread` ON `slack_thread_sessions` (`slack_team_id`,`slack_channel_id`,`slack_thread_ts`);--> statement-breakpoint
CREATE INDEX `idx_slack_thread_sessions_session_id` ON `slack_thread_sessions` (`session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_slack_user_mappings_slack_user` ON `slack_user_mappings` (`slack_user_id`,`slack_team_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_user_mappings_user_id` ON `slack_user_mappings` (`user_id`);