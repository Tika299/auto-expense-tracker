CREATE TYPE "public"."categorization_match_field" AS ENUM('MERCHANT_NAME', 'COUNTERPARTY_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."categorization_operator" AS ENUM('EXACT', 'CONTAINS');--> statement-breakpoint
CREATE TYPE "public"."categorization_source" AS ENUM('MANUAL', 'USER_RULE', 'DEFAULT_KEYWORD', 'NONE');--> statement-breakpoint
CREATE TYPE "public"."transaction_kind" AS ENUM('NORMAL', 'INTERNAL_TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."transaction_link_status" AS ENUM('AUTO_CONFIRMED', 'PENDING_REVIEW', 'USER_CONFIRMED', 'USER_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."transaction_link_type" AS ENUM('POSSIBLE_DUPLICATE', 'INTERNAL_TRANSFER');--> statement-breakpoint
CREATE TYPE "public"."transaction_review_status" AS ENUM('CONFIRMED', 'PENDING_REVIEW');--> statement-breakpoint
ALTER TYPE "public"."observation_status" ADD VALUE 'PENDING_REVIEW';--> statement-breakpoint
CREATE TABLE "categorization_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"match_field" "categorization_match_field" NOT NULL,
	"operator" "categorization_operator" NOT NULL,
	"pattern" text NOT NULL,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"primary_transaction_id" uuid NOT NULL,
	"related_transaction_id" uuid NOT NULL,
	"link_type" "transaction_link_type" NOT NULL,
	"status" "transaction_link_status" DEFAULT 'PENDING_REVIEW' NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "transaction_observations" ADD COLUMN "source_message_id" text;--> statement-breakpoint
ALTER TABLE "transaction_observations" ADD COLUMN "normalized_content_hash" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "kind" "transaction_kind" DEFAULT 'NORMAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "review_status" "transaction_review_status" DEFAULT 'CONFIRMED' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterparty_account" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "categorization_source" "categorization_source" DEFAULT 'NONE' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "matched_rule_id" uuid;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categorization_rules" ADD CONSTRAINT "categorization_rules_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_primary_transaction_id_transactions_id_fk" FOREIGN KEY ("primary_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_related_transaction_id_transactions_id_fk" FOREIGN KEY ("related_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorization_rules_user_match_uidx" ON "categorization_rules" USING btree ("user_id","match_field","operator","pattern");--> statement-breakpoint
CREATE INDEX "categorization_rules_user_active_priority_idx" ON "categorization_rules" USING btree ("user_id","is_active","priority");--> statement-breakpoint
CREATE INDEX "categorization_rules_category_idx" ON "categorization_rules" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_links_pair_type_uidx" ON "transaction_links" USING btree ("primary_transaction_id","related_transaction_id","link_type");--> statement-breakpoint
CREATE INDEX "transaction_links_user_status_idx" ON "transaction_links" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "transaction_links_primary_idx" ON "transaction_links" USING btree ("primary_transaction_id");--> statement-breakpoint
CREATE INDEX "transaction_links_related_idx" ON "transaction_links" USING btree ("related_transaction_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_matched_rule_id_categorization_rules_id_fk" FOREIGN KEY ("matched_rule_id") REFERENCES "public"."categorization_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "observations_source_message_uidx" ON "transaction_observations" USING btree ("user_id","source","channel","source_message_id");--> statement-breakpoint
CREATE INDEX "observations_normalized_hash_time_idx" ON "transaction_observations" USING btree ("user_id","normalized_content_hash","observed_at");--> statement-breakpoint
CREATE INDEX "transactions_user_match_idx" ON "transactions" USING btree ("user_id","amount","direction","transaction_time");--> statement-breakpoint
CREATE INDEX "transactions_review_status_idx" ON "transactions" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "transactions_kind_idx" ON "transactions" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "transactions_matched_rule_idx" ON "transactions" USING btree ("matched_rule_id");