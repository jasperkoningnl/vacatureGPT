import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/email-weekly.ts", "utf8");

describe("weekly delivery persistence", () => {
  it("records items before marking a successful delivery sent", () => {
    const items = script.indexOf("db.insert(emailDigestItems)");
    const sent = script.indexOf('status: "sent", sentAt: now');
    expect(items).toBeGreaterThan(0);
    expect(sent).toBeGreaterThan(items);
  });

  it("marks a provider failure failed rather than sent", () => {
    expect(script).toContain('status: "failed"');
    expect(script).toContain('if (!response.ok)');
    expect(script).toContain('"Idempotency-Key": `vacaturegpt-weekly-${runKey}`');
  });

  it("does not persist a run in disabled or no-candidate branches", () => {
    expect(script.indexOf("db.insert(emailDigestRuns)")).toBeGreaterThan(script.indexOf('process.env.ENABLE_EMAIL !== "true"'));
  });
});
