CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `app_settings` (`key`, `value`, `updated_at`) VALUES
	('salary_reporting_enabled', 'true', '2026-01-01T00:00:00+02:00'),
	('salary_reporting_start_day', '25', '2026-01-01T00:00:00+02:00'),
	('salary_reporting_end_day', '5', '2026-01-01T00:00:00+02:00');
--> statement-breakpoint
ALTER TABLE `transactions` ADD `reporting_period` text;
--> statement-breakpoint
ALTER TABLE `transactions` ADD `reporting_period_locked` integer DEFAULT false NOT NULL;
