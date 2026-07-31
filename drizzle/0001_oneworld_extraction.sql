ALTER TABLE "vacancies" ADD COLUMN "hours_original" text;
ALTER TABLE "vacancies" ADD COLUMN "salary_basis_hours" integer;
ALTER TABLE "vacancies" ADD COLUMN "salary_original" text;
CREATE INDEX "occurrence_external_id_idx" ON "vacancy_occurrences" USING btree ("source_id", "external_id");
