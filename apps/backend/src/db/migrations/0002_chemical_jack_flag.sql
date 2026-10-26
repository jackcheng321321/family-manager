CREATE TABLE `member_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`token_prefix` text NOT NULL,
	`last_used_at` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `member_tokens_token_hash_unique` ON `member_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_member_tokens_member` ON `member_tokens` (`member_id`);