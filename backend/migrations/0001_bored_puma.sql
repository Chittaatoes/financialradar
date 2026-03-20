ALTER TYPE "public"."transaction_type" ADD VALUE 'investment';--> statement-breakpoint
CREATE TABLE "forex_trades" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "forex_trades_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"type" text NOT NULL,
	"lot" numeric(10, 2) NOT NULL,
	"open_price" numeric(15, 5) NOT NULL,
	"close_price" numeric(15, 5) NOT NULL,
	"profit" numeric(15, 2) NOT NULL,
	"source" text DEFAULT 'image' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_holdings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_holdings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"symbol" text NOT NULL,
	"lots" integer DEFAULT 1 NOT NULL,
	"avg_price" numeric(15, 2) DEFAULT '0' NOT NULL,
	"buy_date" date,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trading_risk_settings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trading_risk_settings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"balance" numeric(15, 2) DEFAULT '100' NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"account_type" text DEFAULT 'standard' NOT NULL,
	"risk_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "trading_risk_settings_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "trading_rules" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trading_rules_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"max_loss_percent" numeric(5, 2) DEFAULT '1' NOT NULL,
	"target_profit_percent" numeric(5, 2) DEFAULT '2' NOT NULL,
	"max_trades_per_day" integer DEFAULT 10 NOT NULL,
	"revenge_window_minutes" integer DEFAULT 5 NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "trading_rules_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "trading_stats_daily" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "trading_stats_daily_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" varchar NOT NULL,
	"date" date NOT NULL,
	"total_profit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_loss" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net" numeric(15, 2) DEFAULT '0' NOT NULL,
	"trade_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "forex_trades" ADD CONSTRAINT "forex_trades_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_holdings" ADD CONSTRAINT "stock_holdings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_risk_settings" ADD CONSTRAINT "trading_risk_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_rules" ADD CONSTRAINT "trading_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trading_stats_daily" ADD CONSTRAINT "trading_stats_daily_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;