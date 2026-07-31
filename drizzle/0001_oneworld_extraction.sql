ALTER TABLE "vacancies" ADD COLUMN "hours_original" text;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "salary_basis_hours" integer;--> statement-breakpoint
ALTER TABLE "vacancies" ADD COLUMN "salary_original" text;--> statement-breakpoint
CREATE INDEX "occurrence_external_id_idx" ON "vacancy_occurrences" USING btree ("source_id", "external_id");
