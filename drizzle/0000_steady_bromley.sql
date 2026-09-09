CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`broker` text NOT NULL,
	`external_id` text,
	`currency` text NOT NULL,
	`history_backfilled_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_broker_unique` ON `accounts` (`broker`);--> statement-breakpoint
CREATE TABLE `cash_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`reference` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cash_transactions_reference_unique` ON `cash_transactions` (`reference`);--> statement-breakpoint
CREATE TABLE `dividends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`gross_amount_per_share` text,
	`quantity` text,
	`type` text NOT NULL,
	`paid_on` integer NOT NULL,
	`reference` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dividends_reference_unique` ON `dividends` (`reference`);--> statement-breakpoint
CREATE TABLE `fx_rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`currency` text NOT NULL,
	`rate` text NOT NULL,
	`amount` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fx_rates_date_currency_idx` ON `fx_rates` (`date`,`currency`);--> statement-breakpoint
CREATE TABLE `instruments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ticker` text NOT NULL,
	`name` text,
	`isin` text,
	`currency` text NOT NULL,
	`country` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instruments_ticker_unique` ON `instruments` (`ticker`);--> statement-breakpoint
CREATE TABLE `lots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer NOT NULL,
	`quantity` text NOT NULL,
	`price_per_share` text NOT NULL,
	`currency` text NOT NULL,
	`acquired_at` integer NOT NULL,
	`fee` text,
	`fee_currency` text,
	`reference` text NOT NULL,
	`source` text NOT NULL,
	`raw` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lots_reference_unique` ON `lots` (`reference`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer NOT NULL,
	`quantity` text NOT NULL,
	`average_price` text NOT NULL,
	`current_price` text,
	`current_value` text,
	`total_cost` text,
	`unrealized_pnl` text,
	`fx_impact` text,
	`value_currency` text,
	`source` text NOT NULL,
	`synced_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_account_instrument_idx` ON `positions` (`account_id`,`instrument_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`instrument_id` integer NOT NULL,
	`quantity` text NOT NULL,
	`price_per_share` text NOT NULL,
	`currency` text NOT NULL,
	`sold_at` integer NOT NULL,
	`realized_pnl` text,
	`fee` text,
	`fee_currency` text,
	`reference` text NOT NULL,
	`source` text NOT NULL,
	`raw` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`instrument_id`) REFERENCES `instruments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_reference_unique` ON `sales` (`reference`);--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer NOT NULL,
	`taken_at` integer NOT NULL,
	`total_value` text,
	`cash` text,
	`invested` text,
	`unrealized_pnl` text,
	`realized_pnl` text,
	`currency` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE no action
);
