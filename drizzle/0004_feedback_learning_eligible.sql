-- Existing rows deliberately retain the false default: only feedback touched after
-- this deployment may calibrate future assessments.
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "learning_eligible" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN IF NOT EXISTS "ai_verdict" "feedback_value";
