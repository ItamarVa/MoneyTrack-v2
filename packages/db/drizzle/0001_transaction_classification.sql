ALTER TABLE `transactions` ADD `category_id` text REFERENCES categories(id);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `classification_source` text;
