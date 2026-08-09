CREATE TABLE "ai_assessments" (
	"id" serial PRIMARY KEY NOT NULL,
	"vacancy_id" integer NOT NULL,
	"vacancy_content_hash" text NOT NULL,
	"profile_hash" text NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text NOT NULL,
	"score" integer NOT NULL,
	"verdict" "feedback_value" NOT NULL,
	"summary" text NOT NULL,
	"positives" jsonb NOT NULL,
	"concerns" jsonb NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_assessments" ADD CONSTRAINT "ai_assessments_vacancy_id_vacancies_id_fk" FOREIGN KEY ("vacancy_id") REFERENCES "public"."vacancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_assessments_vacancy_idx" ON "ai_assessments" USING btree ("vacancy_id");--> statement-breakpoint
CREATE INDEX "ai_assessments_score_idx" ON "ai_assessments" USING btree ("score");
