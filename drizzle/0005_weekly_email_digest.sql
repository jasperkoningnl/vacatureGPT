CREATE TYPE "email_digest_status" AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE "email_digest_runs" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_key" text NOT NULL,
  "status" "email_digest_status" DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "sent_at" timestamp with time zone,
  "provider_message_id" text,
  "error" text
);

CREATE TABLE "email_digest_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_id" integer NOT NULL REFERENCES "email_digest_runs"("id"),
  "vacancy_id" integer NOT NULL REFERENCES "vacancies"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "email_digest_runs_run_key_idx" ON "email_digest_runs" ("run_key");
CREATE UNIQUE INDEX "email_digest_items_run_vacancy_idx" ON "email_digest_items" ("run_id", "vacancy_id");
CREATE INDEX "email_digest_items_vacancy_idx" ON "email_digest_items" ("vacancy_id");
