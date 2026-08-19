import { describe, expect, it, vi } from "vitest";
import { sendPipelineFailureAlert, sendWeeklyDigestFailureAlert } from "./email-pipeline-failure";

const successfulSteps = {
  MIGRATION_STATUS: "success",
  ONEWORLD_STATUS: "success",
  VILLAMEDIA_STATUS: "success",
  CULTURELE_STATUS: "success",
  OVERHEID_STATUS: "success",
  CLEANUP_STATUS: "success",
  AI_STATUS: "success",
};

function environment(overrides: Record<string, string> = {}) {
  return {
    ...successfulSteps,
    RESEND_API_KEY: "resend-key",
    ALERT_EMAIL: "alert@example.com",
    EMAIL_FROM: "VacatureGPT <alerts@example.com>",
    GITHUB_RUN_ID: "12345",
    GITHUB_RUN_URL: "https://github.com/example/vacaturegpt/actions/runs/12345",
    GITHUB_EVENT_NAME: "schedule",
    ...overrides,
  };
}

function resendSuccess() {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response("{}", { status: 200 }));
}

function sentMessage(fetchMock: ReturnType<typeof resendSuccess>) {
  const [, init] = fetchMock.mock.calls[0];
  return {
    headers: init?.headers as Record<string, string>,
    body: JSON.parse(String(init?.body)) as { text: string; subject: string },
  };
}

describe("daily pipeline failure alert", () => {
  it("does not send mail when every pipeline step succeeded", async () => {
    const fetchMock = resendSuccess();
    await expect(sendPipelineFailureAlert(environment(), fetchMock)).resolves.toBe("not-needed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a migration failure and the skipped subsequent steps in one mail", async () => {
    const fetchMock = resendSuccess();
    const skipped = Object.fromEntries(Object.keys(successfulSteps).filter((key) => key !== "MIGRATION_STATUS").map((key) => [key, "skipped"]));
    await sendPipelineFailureAlert(environment({ ...skipped, MIGRATION_STATUS: "failure" }), fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentMessage(fetchMock).body.text).toContain("Database migrations (failure)");
    expect(sentMessage(fetchMock).body.text).toContain("- OneWorld");
    expect(sentMessage(fetchMock).body.text).toContain("- AI assessment");
  });

  it("reports the correct single ingestion failure", async () => {
    const fetchMock = resendSuccess();
    await sendPipelineFailureAlert(environment({ VILLAMEDIA_STATUS: "failure" }), fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentMessage(fetchMock).body.text).toContain("Villamedia (failure)");
    expect(sentMessage(fetchMock).body.text).not.toContain("OneWorld (failure)");
  });

  it("combines multiple failures into one mail", async () => {
    const fetchMock = resendSuccess();
    await sendPipelineFailureAlert(environment({ ONEWORLD_STATUS: "failure", AI_STATUS: "failure" }), fetchMock);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentMessage(fetchMock).body.text).toContain("OneWorld (failure)");
    expect(sentMessage(fetchMock).body.text).toContain("AI assessment (failure)");
  });

  it("uses GITHUB_RUN_ID for the Resend idempotency key", async () => {
    const fetchMock = resendSuccess();
    await sendPipelineFailureAlert(environment({ CLEANUP_STATUS: "failure", GITHUB_RUN_ID: "98765" }), fetchMock);
    expect(sentMessage(fetchMock).headers["Idempotency-Key"]).toBe("vacaturegpt-daily-pipeline-98765");
  });

  it("ignores ENABLE_EMAIL=false for failure alerts", async () => {
    const fetchMock = resendSuccess();
    await expect(sendPipelineFailureAlert(environment({ AI_STATUS: "failure", ENABLE_EMAIL: "false" }), fetchMock)).resolves.toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives a clear error when Resend configuration is missing", async () => {
    const fetchMock = resendSuccess();
    await expect(sendPipelineFailureAlert(environment({ MIGRATION_STATUS: "failure", RESEND_API_KEY: "", ALERT_EMAIL: "" }), fetchMock))
      .rejects.toThrow("Pipeline-alert kon niet worden verstuurd: ontbrekende configuratie: RESEND_API_KEY, ALERT_EMAIL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("weekly digest failure alert", () => {
  it("sends an idempotent alert regardless of ENABLE_EMAIL", async () => {
    const fetchMock = resendSuccess();
    await expect(sendWeeklyDigestFailureAlert(environment({ ENABLE_EMAIL: "false" }), fetchMock)).resolves.toBe("sent");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentMessage(fetchMock).headers["Idempotency-Key"]).toBe("vacaturegpt-weekly-failure-12345");
    expect(sentMessage(fetchMock).body.subject).toContain("wekelijkse vacaturemail mislukt");
  });
});
