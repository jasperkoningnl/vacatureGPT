DO $$ BEGIN
	CREATE TYPE "public"."application_status" AS ENUM ('want_to_apply', 'applied', 'interview', 'rejected', 'no_longer_interested');
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vacancy_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"vacancy_id" integer NOT NULL,
	"shortlisted_at" timestamp with time zone,
	"application_status" "application_status",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "vacancy_tracking" ADD CONSTRAINT "vacancy_tracking_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vacancy_tracking_vacancy_idx" ON "vacancy_tracking" USING btree ("vacancy_id");
