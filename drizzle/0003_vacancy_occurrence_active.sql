ALTER TABLE "vacancy_occurrences" ADD COLUMN "active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE INDEX "occurrence_active_last_seen_idx" ON "vacancy_occurrences" USING btree ("active", "last_seen_at");
