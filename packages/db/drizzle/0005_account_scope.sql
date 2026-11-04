ALTER TABLE `accounts` ADD `scope` text DEFAULT 'household' NOT NULL;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `balance_ils` real;
--> statement-breakpoint
ALTER TABLE `accounts` ADD `balance_date` text;
