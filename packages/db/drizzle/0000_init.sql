-- MoneyTrack v2 initial schema (SQLite)
-- Generated for Phase 0 contract freeze

CREATE TABLE `scrape_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `connection_id` text NOT NULL,
  `provider_code` text NOT NULL,
  `started_at` text NOT NULL,
  `finished_at` text,
  `status` text NOT NULL,
  `error_class` text,
  `error_message_redacted` text,
  `library_version` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `raw_transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES scrape_runs(id),
  `provider_account_number` text NOT NULL,
  `payload_json` text NOT NULL,
  `payload_sha256` text NOT NULL,
  `ingested_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `raw_tx_run_sha` ON `raw_transactions` (`run_id`, `payload_sha256`);
--> statement-breakpoint
CREATE INDEX `raw_tx_run_idx` ON `raw_transactions` (`run_id`);
--> statement-breakpoint

CREATE TABLE `raw_accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES scrape_runs(id),
  `provider_account_number` text NOT NULL,
  `balance` real,
  `balance_date` text,
  `card_frame` text,
  `card_type` text,
  `currency` text NOT NULL,
  `savings_account` integer DEFAULT false NOT NULL,
  `ingested_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `people` (
  `id` text PRIMARY KEY NOT NULL,
  `display_name` text NOT NULL,
  `is_child` integer DEFAULT false NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `users` (
  `id` text PRIMARY KEY NOT NULL,
  `person_id` text NOT NULL REFERENCES people(id),
  `username` text NOT NULL UNIQUE,
  `password_hash` text NOT NULL,
  `must_change_password` integer DEFAULT false NOT NULL,
  `totp_secret_encrypted` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES users(id),
  `token_hash` text NOT NULL,
  `created_at` text NOT NULL,
  `last_seen_at` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `login_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `username` text NOT NULL,
  `success` integer NOT NULL,
  `ip_address` text,
  `attempted_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `audit_log` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text REFERENCES users(id),
  `action` text NOT NULL,
  `resource_type` text,
  `resource_id` text,
  `metadata` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `connections` (
  `id` text PRIMARY KEY NOT NULL,
  `provider_code` text NOT NULL,
  `credential_ref` text NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `schedule_cron` text,
  `last_run_id` text,
  `puppeteer_profile_dir` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `accounts` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `connection_id` text REFERENCES connections(id),
  `institution_code` text NOT NULL,
  `display_name` text NOT NULL,
  `number_last4` text,
  `currency` text DEFAULT 'ILS' NOT NULL,
  `owner_person_id` text REFERENCES people(id),
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `cards` (
  `id` text PRIMARY KEY NOT NULL,
  `settlement_account_id` text NOT NULL REFERENCES accounts(id),
  `last4` text NOT NULL,
  `cardholder_person_id` text NOT NULL REFERENCES people(id),
  `brand` text,
  `display_name` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `merchants` (
  `id` text PRIMARY KEY NOT NULL,
  `canonical_name` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `purchases` (
  `id` text PRIMARY KEY NOT NULL,
  `original_total_amount` real NOT NULL,
  `purchase_date` text NOT NULL,
  `installment_total` integer NOT NULL,
  `card_id` text NOT NULL REFERENCES cards(id),
  `merchant_id` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `transactions` (
  `id` text PRIMARY KEY NOT NULL,
  `first_seen_raw_id` text REFERENCES raw_transactions(id),
  `account_id` text NOT NULL REFERENCES accounts(id),
  `card_id` text REFERENCES cards(id),
  `identity_hash` text NOT NULL,
  `transaction_date` text NOT NULL,
  `charge_date` text NOT NULL,
  `status` text NOT NULL,
  `direction` text NOT NULL,
  `amount_ils` real NOT NULL,
  `original_amount` real NOT NULL,
  `original_currency` text NOT NULL,
  `fx_rate` real,
  `fx_fee_ils` real,
  `description_raw` text NOT NULL,
  `description_normalized` text NOT NULL,
  `merchant_id` text,
  `kind` text NOT NULL,
  `purchase_id` text REFERENCES purchases(id),
  `installment_index` integer,
  `installment_total` integer,
  `excluded_from_totals` integer DEFAULT false NOT NULL,
  `exclusion_reason` text,
  `user_note` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tx_identity_hash_idx` ON `transactions` (`identity_hash`);
--> statement-breakpoint
CREATE INDEX `tx_account_date_idx` ON `transactions` (`account_id`, `transaction_date`);
--> statement-breakpoint
CREATE INDEX `tx_charge_date_idx` ON `transactions` (`charge_date`);
--> statement-breakpoint
CREATE INDEX `tx_merchant_idx` ON `transactions` (`merchant_id`);
--> statement-breakpoint

CREATE TABLE `transaction_revisions` (
  `id` text PRIMARY KEY NOT NULL,
  `transaction_id` text NOT NULL REFERENCES transactions(id),
  `run_id` text REFERENCES scrape_runs(id),
  `field_name` text NOT NULL,
  `old_value` text,
  `new_value` text,
  `revised_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `transaction_links` (
  `id` text PRIMARY KEY NOT NULL,
  `from_id` text NOT NULL REFERENCES transactions(id),
  `to_id` text NOT NULL REFERENCES transactions(id),
  `link_type` text NOT NULL,
  `confidence` real NOT NULL,
  `source` text NOT NULL,
  `confirmed_at` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `merchant_aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text NOT NULL REFERENCES merchants(id),
  `raw_descriptor` text NOT NULL,
  `normalization_version` integer NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `categories` (
  `id` text PRIMARY KEY NOT NULL,
  `parent_id` text,
  `name` text NOT NULL,
  `sort_order` integer DEFAULT 0 NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `tags` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL UNIQUE,
  `color` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `transaction_tags` (
  `transaction_id` text NOT NULL REFERENCES transactions(id),
  `tag_id` text NOT NULL REFERENCES tags(id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tx_tag_unique` ON `transaction_tags` (`transaction_id`, `tag_id`);
--> statement-breakpoint

CREATE TABLE `transaction_splits` (
  `id` text PRIMARY KEY NOT NULL,
  `transaction_id` text NOT NULL REFERENCES transactions(id),
  `category_id` text NOT NULL REFERENCES categories(id),
  `amount` real NOT NULL,
  `note` text
);
--> statement-breakpoint

CREATE TABLE `categorization_rules` (
  `id` text PRIMARY KEY NOT NULL,
  `pattern` text NOT NULL,
  `category_id` text NOT NULL REFERENCES categories(id),
  `priority` integer DEFAULT 0 NOT NULL,
  `enabled` integer DEFAULT true NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `merchant_category_learned` (
  `merchant_id` text NOT NULL REFERENCES merchants(id),
  `category_id` text NOT NULL REFERENCES categories(id),
  `observation_count` integer NOT NULL,
  `confidence` real NOT NULL,
  `last_seen` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mcl_merchant_idx` ON `merchant_category_learned` (`merchant_id`);
--> statement-breakpoint

CREATE TABLE `categorization_decisions` (
  `id` text PRIMARY KEY NOT NULL,
  `transaction_id` text NOT NULL REFERENCES transactions(id),
  `decided_by` text NOT NULL,
  `rule_id` text REFERENCES categorization_rules(id),
  `confidence` real,
  `previous_category_id` text,
  `category_id` text,
  `decided_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `loans` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES accounts(id),
  `kind` text NOT NULL,
  `lender` text NOT NULL,
  `origination_date` text NOT NULL,
  `original_principal` real NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `loan_tracks` (
  `id` text PRIMARY KEY NOT NULL,
  `loan_id` text NOT NULL REFERENCES loans(id),
  `rate_type` text NOT NULL,
  `margin` real,
  `fixed_rate` real,
  `term_months` integer NOT NULL,
  `principal` real NOT NULL,
  `amortization_method` text NOT NULL,
  `cpi_base_index_value` real,
  `cpi_convention` text,
  `rate_reset_months` integer,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `loan_schedule_rows` (
  `id` text PRIMARY KEY NOT NULL,
  `track_id` text NOT NULL REFERENCES loan_tracks(id),
  `period_index` integer NOT NULL,
  `due_date` text NOT NULL,
  `principal_part` real NOT NULL,
  `interest_part` real NOT NULL,
  `cpi_adjustment` real NOT NULL,
  `remaining_principal` real NOT NULL,
  `computed_at` text NOT NULL,
  `assumption_set_id` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `early_repayment_scenarios` (
  `id` text PRIMARY KEY NOT NULL,
  `loan_id` text NOT NULL REFERENCES loans(id),
  `name` text NOT NULL,
  `extra_payment` real NOT NULL,
  `assumption_set_id` text NOT NULL,
  `saved_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `instruments` (
  `id` text PRIMARY KEY NOT NULL,
  `symbol` text NOT NULL,
  `name` text NOT NULL,
  `instrument_type` text NOT NULL,
  `currency` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `holdings` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES accounts(id),
  `instrument_id` text NOT NULL REFERENCES instruments(id),
  `quantity` real NOT NULL,
  `cost_basis_ils` real,
  `as_of` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `price_observations` (
  `id` text PRIMARY KEY NOT NULL,
  `instrument_id` text NOT NULL REFERENCES instruments(id),
  `as_of` text NOT NULL,
  `price` real NOT NULL,
  `currency` text NOT NULL,
  `source` text NOT NULL,
  `fetched_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `contributions` (
  `id` text PRIMARY KEY NOT NULL,
  `account_id` text NOT NULL REFERENCES accounts(id),
  `amount` real NOT NULL,
  `contributed_at` text NOT NULL,
  `note` text
);
--> statement-breakpoint

CREATE TABLE `net_worth_snapshots` (
  `id` text PRIMARY KEY NOT NULL,
  `as_of` text NOT NULL,
  `total_assets_ils` real NOT NULL,
  `total_liabilities_ils` real NOT NULL,
  `net_worth_ils` real NOT NULL,
  `computed_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `reference_series` (
  `id` text PRIMARY KEY NOT NULL,
  `series_code` text NOT NULL UNIQUE,
  `display_name` text NOT NULL,
  `unit` text NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `reference_observations` (
  `id` text PRIMARY KEY NOT NULL,
  `series_id` text NOT NULL REFERENCES reference_series(id),
  `as_of` text NOT NULL,
  `value` real NOT NULL,
  `source_url` text NOT NULL,
  `fetched_at` text NOT NULL,
  `raw_response_sha256` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `budgets` (
  `id` text PRIMARY KEY NOT NULL,
  `category_id` text NOT NULL REFERENCES categories(id),
  `period` text NOT NULL,
  `amount` real NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `recurring_instruments` (
  `id` text PRIMARY KEY NOT NULL,
  `merchant_id` text REFERENCES merchants(id),
  `account_id` text NOT NULL REFERENCES accounts(id),
  `cadence` text NOT NULL,
  `expected_amount` real NOT NULL,
  `last_seen` text,
  `status` text NOT NULL,
  `price_history` text DEFAULT '[]' NOT NULL,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `alerts` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `severity` text NOT NULL,
  `title` text NOT NULL,
  `message` text NOT NULL,
  `transaction_id` text REFERENCES transactions(id),
  `status` text NOT NULL,
  `metadata` text,
  `created_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `jobs` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `payload_json` text NOT NULL,
  `status` text NOT NULL,
  `otp_prompt` text,
  `otp_response` text,
  `attempts` integer DEFAULT 0 NOT NULL,
  `error_class` text,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint

CREATE TABLE `rollup_monthly` (
  `period` text NOT NULL,
  `date_basis` text NOT NULL,
  `category_id` text,
  `card_id` text,
  `person_id` text,
  `total_amount_ils` real NOT NULL,
  `transaction_count` integer NOT NULL,
  `computed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rollup_unique` ON `rollup_monthly` (`period`, `date_basis`, `category_id`, `card_id`, `person_id`);
--> statement-breakpoint

CREATE TABLE `egress_log` (
  `id` text PRIMARY KEY NOT NULL,
  `host` text NOT NULL,
  `path` text NOT NULL,
  `purpose` text NOT NULL,
  `status` integer NOT NULL,
  `bytes` integer NOT NULL,
  `duration_ms` integer NOT NULL,
  `at` text NOT NULL
);