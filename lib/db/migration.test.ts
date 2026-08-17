import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const statementBreakpoint = "--> statement-breakpoint";

function expectNeonHttpCompatible(sql: string) {
  const statementsPerBatch = sql.split(statementBreakpoint).map((batch) =>
    batch
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .filter((statement) => statement.trim().length > 0),
  );

  expect(statementsPerBatch.every((statements) => statements.length <= 1)).toBe(true);
}

describe("Neon HTTP migration compatibility", () => {
  it.each(["0004_feedback_learning_eligible.sql", "0005_weekly_email_digest.sql"])(
    "%s separates every executable statement",
    (migration) => {
      expectNeonHttpCompatible(readFileSync(`drizzle/${migration}`, "utf8"));
    },
  );

  it("keeps every migration compatible with prepared statements", () => {
    for (const migration of readdirSync("drizzle").filter((file) => file.endsWith(".sql"))) {
      expectNeonHttpCompatible(readFileSync(`drizzle/${migration}`, "utf8"));
    }
  });
});

describe("feedback learning migration", () => {
  it("adds a false, non-null default without rewriting old feedback", () => {
    const sql = readFileSync("drizzle/0004_feedback_learning_eligible.sql", "utf8");
    expect(sql).toContain('ADD COLUMN "learning_eligible" boolean DEFAULT false NOT NULL');
    expect(sql).toMatch(/learning_eligible[^;]+;\s*--> statement-breakpoint\s*ALTER TABLE[\s\S]+ai_verdict/);
    expect(sql).toContain('ADD COLUMN "ai_verdict" "feedback_value";');
    expect(sql).not.toMatch(/ai_verdict[^;]*NOT NULL/i);
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

describe("vacancy tracking migration", () => {
  const migration = "drizzle/0006_vacancy_tracking.sql";

  it("defines exactly the supported application statuses", () => {
    const sql = readFileSync(migration, "utf8");
    const enumDefinition = sql.match(/CREATE TYPE "public"\."application_status" AS ENUM \(([^)]+)\)/);

    expect(enumDefinition?.[1].match(/'[^']+'/g)?.map((value) => value.slice(1, -1))).toEqual([
      "want_to_apply",
      "applied",
      "interview",
      "rejected",
      "no_longer_interested",
    ]);
  });

  it("allows only one tracking record per vacancy", () => {
    const sql = readFileSync(migration, "utf8");

    expect(sql).toContain(
      'CREATE UNIQUE INDEX "vacancy_tracking_vacancy_idx" ON "vacancy_tracking" USING btree ("vacancy_id")',
    );
  });

  it("models shortlist independently from the nullable application status", () => {
    const sql = readFileSync(migration, "utf8");

    expect(sql).toMatch(/"shortlisted_at" timestamp with time zone,\s*"application_status" "application_status",/);
    expect(sql).not.toMatch(/application_status[^;]*shortlist/i);
    expect(sql).not.toMatch(/^\s*(?:INSERT|UPDATE)\s+/im);
  });
});
