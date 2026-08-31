CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"broker" text NOT NULL,
	"external_id" text,
	"currency" text NOT NULL,
	"history_backfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_broker_unique" UNIQUE("broker")
);
--> statement-breakpoint
CREATE TABLE "cash_transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reference" text NOT NULL,
	CONSTRAINT "cash_transactions_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "dividends" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"gross_amount_per_share" numeric,
	"quantity" numeric,
	"type" text NOT NULL,
	"paid_on" timestamp with time zone NOT NULL,
	"reference" text NOT NULL,
	CONSTRAINT "dividends_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" text NOT NULL,
	"currency" text NOT NULL,
	"rate" numeric NOT NULL,
	"amount" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text,
	"isin" text,
	"currency" text NOT NULL,
	"country" text,
	CONSTRAINT "instruments_ticker_unique" UNIQUE("ticker")
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"quantity" numeric NOT NULL,
	"price_per_share" numeric NOT NULL,
	"currency" text NOT NULL,
	"acquired_at" timestamp with time zone NOT NULL,
	"fee" numeric,
	"fee_currency" text,
	"reference" text NOT NULL,
	"source" text NOT NULL,
	"raw" jsonb,
	CONSTRAINT "lots_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"quantity" numeric NOT NULL,
	"average_price" numeric NOT NULL,
	"current_price" numeric,
	"current_value" numeric,
	"total_cost" numeric,
	"unrealized_pnl" numeric,
	"fx_impact" numeric,
	"value_currency" text,
	"source" text NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"instrument_id" integer NOT NULL,
	"quantity" numeric NOT NULL,
	"price_per_share" numeric NOT NULL,
	"currency" text NOT NULL,
	"sold_at" timestamp with time zone NOT NULL,
	"realized_pnl" numeric,
	"fee" numeric,
	"fee_currency" text,
	"reference" text NOT NULL,
	"source" text NOT NULL,
	"raw" jsonb,
	CONSTRAINT "sales_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"total_value" numeric,
	"cash" numeric,
	"invested" numeric,
	"unrealized_pnl" numeric,
	"realized_pnl" numeric,
	"currency" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividends" ADD CONSTRAINT "dividends_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_instrument_id_instruments_id_fk" FOREIGN KEY ("instrument_id") REFERENCES "public"."instruments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fx_rates_date_currency_idx" ON "fx_rates" USING btree ("date","currency");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_account_instrument_idx" ON "positions" USING btree ("account_id","instrument_id");