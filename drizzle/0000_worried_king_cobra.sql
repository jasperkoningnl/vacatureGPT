CREATE TYPE "public"."feedback_value" AS ENUM('interesting', 'maybe', 'not_suitable');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'success', 'warning', 'error');--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"vacancy_id" integer NOT NULL,
	"value" "feedback_value" NOT NULL,
	"reason_code" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"hours_min" integer NOT NULL,
	"hours_max" integer NOT NULL,
	"salary_min" integer,
	"primary_cities" jsonb NOT NULL,
	"secondary_cities" jsonb NOT NULL,
	"travel_origin" text NOT NULL,
	"max_travel_minutes" integer NOT NULL,
	"role_families" jsonb NOT NULL,
	"positive_indicators" jsonb NOT NULL,
	"negative_indicators" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"result_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"changed_count" integer DEFAULT 0 NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "vacancies" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_key" text NOT NULL,
	"title" text NOT NULL,
	"employer" text NOT NULL,
	"location" text,
	"hours_min" integer,
	"hours_max" integer,
	"salary_min" integer,
	"salary_max" integer,
	"salary_period" text,
	"deadline" timestamp with time zone,
	"description" text,
	"original_text" text NOT NULL,
	"content_hash" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vacancies_canonical_key_unique" UNIQUE("canonical_key")
);
--> statement-breakpoint
CREATE TABLE "vacancy_occurrences" (
	"id" serial PRIMARY KEY NOT NULL,
	"vacancy_id" integer NOT NULL,
	"source_id" integer NOT NULL,
	"source_run_id" integer,
	"external_id" text,
	"source_url" text NOT NULL,
	"raw_data" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "watched_employers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watched_employers_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_occurrences" ADD CONSTRAINT "vacancy_occurrences_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_occurrences" ADD CONSTRAINT "vacancy_occurrences_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vacancy_occurrences" ADD CONSTRAINT "vacancy_occurrences_source_run_id_source_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."source_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_vacancy_idx" ON "feedback" USING btree ("vacancy_id");--> statement-breakpoint
CREATE INDEX "vacancies_active_idx" ON "vacancies" USING btree ("active");--> statement-breakpoint
CREATE INDEX "vacancies_deadline_idx" ON "vacancies" USING btree ("deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "occurrence_source_url_idx" ON "vacancy_occurrences" USING btree ("source_id","source_url");