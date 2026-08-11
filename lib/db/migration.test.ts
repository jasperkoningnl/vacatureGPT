import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("feedback learning migration", () => {
  it("adds a false, non-null default without rewriting old feedback", () => {
    const sql = readFileSync("drizzle/0004_feedback_learning_eligible.sql", "utf8");
    expect(sql).toContain('ADD COLUMN "learning_eligible" boolean DEFAULT false NOT NULL');
    expect(sql).not.toMatch(/UPDATE\s+"?feedback"?/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
  });
});

describe("weekly digest migration", () => {
  it("only adds durable digest history tables and never changes vacancies", () => {
    const sql = readFileSync("drizzle/0005_weekly_email_digest.sql", "utf8");
    expect(sql).toContain('CREATE TABLE "email_digest_runs"');
    expect(sql).toContain('CREATE TABLE "email_digest_items"');
    expect(sql).toContain('UNIQUE INDEX "email_digest_runs_run_key_idx"');
    expect(sql).not.toMatch(/DELETE|DROP|ALTER\s+TABLE\s+"vacancies"/i);
  });
});
