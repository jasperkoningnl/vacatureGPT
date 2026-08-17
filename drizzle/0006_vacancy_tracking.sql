CREATE TYPE "public"."application_status" AS ENUM ('want_to_apply', 'applied', 'interview', 'rejected', 'no_longer_interested');
--> statement-breakpoint
CREATE TABLE "vacancy_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"vacancy_id" integer NOT NULL,
	"shortlisted_at" timestamp with time zone,
	"application_status" "application_status",
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vacancy_tracking" ADD CONSTRAINT "vacancy_tracking_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "vacancy_tracking_vacancy_idx" ON "vacancy_tracking" USING btree ("vacancy_id");
