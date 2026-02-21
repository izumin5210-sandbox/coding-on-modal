CREATE TABLE IF NOT EXISTS `sessions` (
	`id` text PRIMARY KEY,
	`provider_session_id` text NOT NULL,
	`name` text NOT NULL,
	`repo_url` text NOT NULL,
	`repo_ref` text NOT NULL,
	`status` text NOT NULL,
	`workspace_path` text NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_sessions_updated_at` ON `sessions` (`updated_at`);
