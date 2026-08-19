import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const script = readFileSync("scripts/email-weekly-test.ts", "utf8");
const workflow = readFileSync(".github/workflows/test-weekly-vacancy-email.yml", "utf8");

describe("weekly test email isolation", () => {
  it("uses the shared selection and template with a limit of 15", () => {
    expect(script).toContain("selectTestWeeklyVacancies(rows");
    expect(script).toContain("eligible.slice(0, 15)");
    expect(script).toContain("buildWeeklyDigest(selected, baseUrl)");
  });

  it("never accesses digest history or the production run key", () => {
    expect(script).not.toMatch(/emailDigest(?:Runs|Items)/);
    expect(script).not.toContain("weeklyRunKey");
    expect(script).not.toContain("db.insert");
    expect(script).not.toContain("db.update");
  });

  it("uses the GitHub run id for test idempotency", () => {
    expect(script).toContain('testEmailIdempotencyKey(process.env.GITHUB_RUN_ID ?? "")');
    expect(script).toContain('"Idempotency-Key": idempotencyKey');
  });

  it("is manual-only and uses the existing configuration", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).not.toContain("schedule:");
    for (const name of ["RESEND_API_KEY", "ALERT_EMAIL", "EMAIL_FROM", "ENABLE_EMAIL", "APP_BASE_URL"]) expect(workflow).toContain(name);
  });
});
