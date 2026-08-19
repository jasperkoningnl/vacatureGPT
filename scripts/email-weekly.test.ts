import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/email-weekly.ts", "utf8");
const workflow = readFileSync(".github/workflows/weekly-vacancy-email.yml", "utf8");

describe("weekly delivery persistence", () => {
  it("records the stable retry payload before sending and marks success afterwards", () => {
    const items = script.indexOf("db.insert(emailDigestItems)");
    const send = script.indexOf('fetch("https://api.resend.com/emails"');
    const sent = script.indexOf('status: "sent", sentAt: now');
    expect(items).toBeGreaterThan(0);
    expect(send).toBeGreaterThan(items);
    expect(sent).toBeGreaterThan(send);
    expect(script).toContain("retryIds");
  });

  it("marks a provider failure failed rather than sent", () => {
    expect(script).toContain('status: "failed"');
    expect(script).toContain('if (!response.ok)');
    expect(script).toContain('"Idempotency-Key": `vacaturegpt-weekly-${runKey}`');
    expect(script.indexOf('status: "sent", sentAt: now')).toBeGreaterThan(script.indexOf("if (!response.ok)"));
  });

  it("does not persist a run in disabled or no-candidate branches", () => {
    expect(script.indexOf("db.insert(emailDigestRuns)")).toBeGreaterThan(script.indexOf('process.env.ENABLE_EMAIL !== "true"'));
  });

  it("calls the existing failure-alert infrastructure on a real workflow failure", () => {
    expect(workflow).toContain("if: ${{ failure() }}");
    expect(workflow).toContain("pnpm email:pipeline-failure --weekly");
    expect(workflow).toContain("RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}");
  });
});
