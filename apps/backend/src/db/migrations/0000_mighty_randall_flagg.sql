CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`icon` text,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `asset_valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	`note` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_asset_valuations_asset` ON `asset_valuations` (`asset_id`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'CNY' NOT NULL,
	`allocation_bucket` text DEFAULT 'stable' NOT NULL,
	`account_info` text,
	`cost_basis` real,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`frequency` text,
	`member_id` text,
	`start_date` text,
	`end_date` text,
	`note` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`icon` text,
	`color` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `financial_analyses` (
	`id` text PRIMARY KEY NOT NULL,
	`month` text NOT NULL,
	`analysis` text NOT NULL,
	`snapshot` text NOT NULL,
	`generated_at` text NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `financial_analyses_month_unique` ON `financial_analyses` (`month`);--> statement-breakpoint
CREATE TABLE `health_checkup_items` (
	`id` text PRIMARY KEY NOT NULL,
	`checkup_id` text NOT NULL,
	`group_name` text,
	`item_name` text NOT NULL,
	`result` text,
	`unit` text,
	`reference_range` text,
	`flag` text DEFAULT 'unknown' NOT NULL,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`checkup_id`) REFERENCES `health_checkups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_health_checkup_items_checkup` ON `health_checkup_items` (`checkup_id`);--> statement-breakpoint
CREATE TABLE `health_checkups` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`checkup_date` text NOT NULL,
	`institution` text,
	`parsed_name` text,
	`file_path` text,
	`original_file_name` text,
	`overall_summary` text,
	`abnormal_summary` text,
	`raw_text` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`ai_model` text,
	`parse_message` text,
	`note` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_health_checkups_member` ON `health_checkups` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_health_checkups_date` ON `health_checkups` (`checkup_date`);--> statement-breakpoint
CREATE TABLE `installations` (
	`id` text PRIMARY KEY NOT NULL,
	`app_token` text NOT NULL,
	`webhook_secret` text NOT NULL,
	`bot_id` text NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `insurance_policies` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`insured_member_id` text,
	`insurer` text,
	`coverage_amount` real,
	`premium` real,
	`premium_frequency` text,
	`cash_value` real,
	`start_date` text,
	`end_date` text,
	`note` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`insured_member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `liabilities` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`balance` real NOT NULL,
	`original_amount` real,
	`interest_rate` real,
	`monthly_payment` real,
	`member_id` text,
	`linked_asset_id` text,
	`note` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `medical_visit_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`type` text DEFAULT 'other' NOT NULL,
	`file_path` text NOT NULL,
	`original_file_name` text,
	`ocr_text` text,
	`caption` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `medical_visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_medical_visit_attachments_visit` ON `medical_visit_attachments` (`visit_id`);--> statement-breakpoint
CREATE TABLE `medical_visit_medications` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`drug_name` text NOT NULL,
	`spec` text,
	`dosage` text,
	`quantity` text,
	`note` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `medical_visits`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_medical_visit_medications_visit` ON `medical_visit_medications` (`visit_id`);--> statement-breakpoint
CREATE TABLE `medical_visits` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`visit_date` text NOT NULL,
	`hospital` text,
	`department` text,
	`chief_complaint` text,
	`examinations` text,
	`diagnosis` text,
	`treatment` text,
	`follow_up` text,
	`cost` real,
	`note` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_medical_visits_member` ON `medical_visits` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_medical_visits_date` ON `medical_visits` (`visit_date`);--> statement-breakpoint
CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`wechat_user_id` text,
	`name` text NOT NULL,
	`avatar_url` text,
	`role` text DEFAULT 'member' NOT NULL,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_wechat_user_id_unique` ON `members` (`wechat_user_id`);--> statement-breakpoint
CREATE TABLE `message_log` (
	`id` text PRIMARY KEY NOT NULL,
	`installation_id` text NOT NULL,
	`trace_id` text,
	`sender_id` text,
	`message_type` text NOT NULL,
	`raw_content` text,
	`parsed_result` text,
	`status` text DEFAULT 'received' NOT NULL,
	`error_message` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`description` text NOT NULL,
	`category_id` text NOT NULL,
	`account_id` text,
	`member_id` text NOT NULL,
	`transaction_date` text NOT NULL,
	`note` text,
	`source` text DEFAULT 'admin' NOT NULL,
	`ai_raw_input` text,
	`ai_confidence` real,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_transactions_date` ON `transactions` (`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_transactions_type` ON `transactions` (`type`);--> statement-breakpoint
CREATE INDEX `idx_transactions_member` ON `transactions` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_transactions_category` ON `transactions` (`category_id`);