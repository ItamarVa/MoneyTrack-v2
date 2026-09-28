ALTER TABLE `users` ADD `ha_user_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_ha_user_id_unique` ON `users` (`ha_user_id`);
--> statement-breakpoint
ALTER TABLE `users` ADD `pin_hash` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `pin_failed_count` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `users` ADD `pin_locked_at` text;
