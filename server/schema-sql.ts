/**
 * مولَّد آلياً من shared/schema.ts — لا يُحرَّر بيد.
 * أعد توليده بـ: npx tsx script/make-schema-sql.ts
 *
 * كل عبارة هنا إنشاء محض: تمرّ بلا أثر على قاعدة بيانات مكتملة، وتُنشئ
 * الناقص وحده على قاعدة متأخرة عن الشيفرة. لا حذف ولا تغيير لقائم.
 */
export const SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS "app_secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "attachments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);

CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" varchar,
	"actor_user_id" varchar,
	"actor_name" text,
	"description" text NOT NULL,
	"metadata" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "capital_allocations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"net_assets" numeric(12, 3) DEFAULT '0' NOT NULL,
	"protected_amount" numeric(12, 3) DEFAULT '0' NOT NULL,
	"emergency_amount" numeric(12, 3) DEFAULT '0' NOT NULL,
	"flexible_amount" numeric(12, 3) DEFAULT '0' NOT NULL,
	"growth_amount" numeric(12, 3) DEFAULT '0' NOT NULL,
	"flexible_used" numeric(12, 3) DEFAULT '0' NOT NULL,
	"growth_used" numeric(12, 3) DEFAULT '0' NOT NULL,
	"emergency_used" numeric(12, 3) DEFAULT '0' NOT NULL,
	"locked_at" timestamp DEFAULT now(),
	"reset_at" timestamp,
	"reset_by" varchar,
	CONSTRAINT "capital_allocations_year_unique" UNIQUE("year")
);

CREATE TABLE IF NOT EXISTS "contribution_rates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar,
	"amount" numeric(10, 3) NOT NULL,
	"effective_year" integer NOT NULL,
	"effective_month" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);

CREATE TABLE IF NOT EXISTS "contributions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"amount" numeric(10, 3) NOT NULL,
	"status" text DEFAULT 'pending_approval' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"approved_at" timestamp
);

CREATE TABLE IF NOT EXISTS "expenses" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"amount" numeric(10, 3) NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "family_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_name" text DEFAULT 'صندوق العائلة' NOT NULL,
	"currency" text DEFAULT 'ر.ع' NOT NULL,
	"protected_percent" integer DEFAULT 45 NOT NULL,
	"emergency_percent" integer DEFAULT 15 NOT NULL,
	"flexible_percent" integer DEFAULT 20 NOT NULL,
	"growth_percent" integer DEFAULT 20 NOT NULL,
	"default_monthly_contribution" numeric(10, 3) DEFAULT '0' NOT NULL,
	"zakat_nisab" numeric(12, 3) DEFAULT '0' NOT NULL,
	"emergency_mode" boolean DEFAULT false NOT NULL,
	"backup_enabled" boolean DEFAULT false NOT NULL,
	"backup_keep_days" integer DEFAULT 7 NOT NULL,
	"backup_keep_weeks_per_month" integer DEFAULT 4 NOT NULL,
	"backup_keep_months" integer DEFAULT 12 NOT NULL,
	"backup_last_run_at" timestamp
);

CREATE TABLE IF NOT EXISTS "fund_adjustments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(12, 3) NOT NULL,
	"description" text,
	"member_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);

CREATE TABLE IF NOT EXISTS "investment_valuations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investment_id" varchar NOT NULL,
	"valued_at" timestamp NOT NULL,
	"value" numeric(12, 3) NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);

CREATE TABLE IF NOT EXISTS "investments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'other' NOT NULL,
	"amount" numeric(12, 3) NOT NULL,
	"started_at" timestamp NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"exited_at" timestamp,
	"exit_value" numeric(12, 3),
	"note" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar
);

CREATE TABLE IF NOT EXISTS "loan_payments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" varchar NOT NULL,
	"amount" numeric(10, 3) NOT NULL,
	"note" text,
	"paid_at" timestamp DEFAULT now(),
	"created_by" varchar
);

CREATE TABLE IF NOT EXISTS "loan_repayments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" varchar NOT NULL,
	"installment_number" integer NOT NULL,
	"amount" numeric(10, 3) NOT NULL,
	"due_date" timestamp NOT NULL,
	"paid_at" timestamp,
	"status" text DEFAULT 'scheduled' NOT NULL
);

CREATE TABLE IF NOT EXISTS "loan_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"loan_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"voter_name" text NOT NULL,
	"vote" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "loans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" varchar NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"amount" numeric(10, 3) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"repayment_type" text DEFAULT 'scheduled' NOT NULL,
	"repayment_months" integer DEFAULT 12,
	"created_at" timestamp DEFAULT now(),
	"approved_at" timestamp
);

CREATE TABLE IF NOT EXISTS "members" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"avatar" text,
	"expected_monthly" numeric(10, 3),
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"url" text DEFAULT '/' NOT NULL,
	"audience" text NOT NULL,
	"target_user_id" varchar,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp,
	"sent_at" timestamp,
	"delivered_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_by" varchar,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now(),
	"dedupe_key" text
);

CREATE TABLE IF NOT EXISTS "password_reset_requests" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar NOT NULL,
	"user_id" varchar,
	"status" text DEFAULT 'pending' NOT NULL,
	"code_hash" varchar,
	"code_expires_at" timestamp,
	"attempts_left" integer DEFAULT 5 NOT NULL,
	"requested_at" timestamp DEFAULT now(),
	"resolved_at" timestamp,
	"resolved_by" varchar
);

CREATE TABLE IF NOT EXISTS "proposal_votes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"voter_name" text NOT NULL,
	"vote" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "proposals" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"description" text,
	"amount" numeric(12, 3),
	"status" text DEFAULT 'open' NOT NULL,
	"closes_at" timestamp,
	"decided_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"created_by" varchar,
	"created_by_name" text
);

CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"platform" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now(),
	"last_used_at" timestamp
);

CREATE TABLE IF NOT EXISTS "system_backups" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"backup_date" timestamp DEFAULT now() NOT NULL,
	"backup_level" text DEFAULT 'snapshot' NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"week_of_month" integer,
	"is_month_end_snapshot" boolean DEFAULT false NOT NULL,
	"size_bytes" integer,
	"created_by" varchar,
	"payload" jsonb DEFAULT 'null'::jsonb
);

CREATE TABLE IF NOT EXISTS "zakat_cycles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_start" timestamp NOT NULL,
	"due_at" timestamp,
	"net_assets_at_due" numeric(12, 3) DEFAULT '0' NOT NULL,
	"nisab_used" numeric(12, 3) DEFAULT '0' NOT NULL,
	"amount_due" numeric(12, 3) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"expense_id" varchar,
	"paid_at" timestamp,
	"paid_by" varchar,
	"note" text,
	"created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar NOT NULL,
	"password" varchar NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'user' NOT NULL,
	"member_id" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);

DO $$ BEGIN
  ALTER TABLE "contribution_rates" ADD CONSTRAINT "contribution_rates_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "contributions" ADD CONSTRAINT "contributions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "fund_adjustments" ADD CONSTRAINT "fund_adjustments_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "investment_valuations" ADD CONSTRAINT "investment_valuations_investment_id_investments_id_fk" FOREIGN KEY ("investment_id") REFERENCES "public"."investments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loan_repayments" ADD CONSTRAINT "loan_repayments_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loan_votes" ADD CONSTRAINT "loan_votes_loan_id_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."loans"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "loans" ADD CONSTRAINT "loans_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "proposal_votes" ADD CONSTRAINT "proposal_votes_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "zakat_cycles" ADD CONSTRAINT "zakat_cycles_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "contribution_rates_scope_month_unique" ON "contribution_rates" USING btree ("member_id","effective_year","effective_month");

CREATE UNIQUE INDEX IF NOT EXISTS "contributions_member_year_month_unique" ON "contributions" USING btree ("member_id","year","month");

CREATE UNIQUE INDEX IF NOT EXISTS "loan_votes_loan_user_unique" ON "loan_votes" USING btree ("loan_id","user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_key_unique" ON "notifications" USING btree ("dedupe_key");

CREATE UNIQUE INDEX IF NOT EXISTS "proposal_votes_proposal_user_unique" ON "proposal_votes" USING btree ("proposal_id","user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpoint_unique" ON "push_subscriptions" USING btree ("endpoint");

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" USING btree ("expire");
`;
