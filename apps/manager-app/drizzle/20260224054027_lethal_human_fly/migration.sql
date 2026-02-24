CREATE TABLE `session_claude_code_messages` (
	`id` text PRIMARY KEY,
	`thread_id` text NOT NULL,
	`sdk_message_json` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_session_claude_code_messages_thread_id_session_claude_code_threads_id_fk` FOREIGN KEY (`thread_id`) REFERENCES `session_claude_code_threads`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `session_claude_code_threads` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`claude_sdk_session_id` text,
	`cwd` text NOT NULL,
	`max_turns` integer NOT NULL,
	`is_running` integer DEFAULT false NOT NULL,
	`last_error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT `fk_session_claude_code_threads_session_id_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `idx_session_claude_code_messages_thread_id` ON `session_claude_code_messages` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_session_claude_code_messages_thread_id_created_at` ON `session_claude_code_messages` (`thread_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_session_claude_code_threads_session_id` ON `session_claude_code_threads` (`session_id`);--> statement-breakpoint
CREATE INDEX `idx_session_claude_code_threads_updated_at` ON `session_claude_code_threads` (`updated_at`);