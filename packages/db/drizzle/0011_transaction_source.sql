-- Provenance of a transaction row: 'sync' (scraper, manual entry, every row before this migration)
-- or 'file' (card statement upload). A file row is a stand-in until a sync covers its charge month.
ALTER TABLE `transactions` ADD `source` text DEFAULT 'sync' NOT NULL;
