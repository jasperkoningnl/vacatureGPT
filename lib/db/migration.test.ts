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
