CREATE TYPE "public"."category_scope" AS ENUM('IN', 'OUT', 'BOTH');--> statement-breakpoint
CREATE TYPE "public"."observation_channel" AS ENUM('ANDROID_NOTIFICATION', 'EMAIL');--> statement-breakpoint
CREATE TYPE "public"."observation_source" AS ENUM('VIETCOMBANK', 'MBBANK', 'MOMO');--> statement-breakpoint
CREATE TYPE "public"."observation_status" AS ENUM('PENDING', 'PARSED', 'REJECTED', 'DUPLICATE');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('IN', 'OUT');--> statement-breakpoint
CREATE TYPE "public"."transaction_origin" AS ENUM('MANUAL', 'PARSER');--> statement-breakpoint
CREATE TYPE "public"."wallet_type" AS ENUM('BANK', 'EWALLET', 'CASH');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" "category_scope" DEFAULT 'BOTH' NOT NULL,
	"icon" text,
	"color" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid,
	"transaction_id" uuid,
	"source" "observation_source" NOT NULL,
	"channel" "observation_channel" NOT NULL,
	"raw_text" text NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"status" "observation_status" DEFAULT 'PENDING' NOT NULL,
	"parser_rule" text,
	"parse_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"category_id" uuid,
	"amount" bigint NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"reference_code" text,
	"merchant_name" text,
	"note" text,
	"origin" "transaction_origin" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "wallet_type" NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_observations" ADD CONSTRAINT "transaction_observations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_observations" ADD CONSTRAINT "transaction_observations_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_observations" ADD CONSTRAINT "transaction_observations_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_wallet_id_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_user_name_uidx" ON "categories" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "categories_user_id_idx" ON "categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "observations_user_hash_uidx" ON "transaction_observations" USING btree ("user_id","payload_hash");--> statement-breakpoint
CREATE INDEX "observations_user_time_idx" ON "transaction_observations" USING btree ("user_id","observed_at");--> statement-breakpoint
CREATE INDEX "observations_status_idx" ON "transaction_observations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "observations_transaction_idx" ON "transaction_observations" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "transactions_user_time_idx" ON "transactions" USING btree ("user_id","transaction_time");--> statement-breakpoint
CREATE INDEX "transactions_wallet_time_idx" ON "transactions" USING btree ("wallet_id","transaction_time");--> statement-breakpoint
CREATE INDEX "transactions_category_idx" ON "transactions" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "transactions_reference_idx" ON "transactions" USING btree ("reference_code");--> statement-breakpoint
CREATE UNIQUE INDEX "wallets_user_name_uidx" ON "wallets" USING btree ("user_id","name");--> statement-breakpoint
CREATE INDEX "wallets_user_id_idx" ON "wallets" USING btree ("user_id");