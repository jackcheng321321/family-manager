CREATE TABLE `installment_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`total_amount` real NOT NULL,
	`periods` integer NOT NULL,
	`fee_per_period` real DEFAULT 0 NOT NULL,
	`first_date` text NOT NULL,
	`category_id` text NOT NULL,
	`member_id` text NOT NULL,
	`note` text,
	`payoff_date` text,
	`created_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	`updated_at` text DEFAULT '(datetime(''now''))' NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `installment_plan_id` text REFERENCES installment_plans(id);--> statement-breakpoint
ALTER TABLE `transactions` ADD `installment_index` integer;--> statement-breakpoint
CREATE INDEX `idx_transactions_installment_plan` ON `transactions` (`installment_plan_id`);