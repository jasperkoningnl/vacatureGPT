export type StepOutcome = "success" | "failure" | "cancelled" | "skipped" | string;

export type PipelineStep = {
  name: string;
  outcome: StepOutcome;
};

type AlertEnvironment = Record<string, string | undefined>;
type Fetch = typeof fetch;

const stepEnvironment = [
  ["Database migrations", "MIGRATION_STATUS"],
  ["OneWorld", "ONEWORLD_STATUS"],
  ["Villamedia", "VILLAMEDIA_STATUS"],
  ["Culturele Vacatures", "CULTURELE_STATUS"],
  ["Werken bij de Overheid", "OVERHEID_STATUS"],
  ["Expiry cleanup", "CLEANUP_STATUS"],
  ["AI assessment", "AI_STATUS"],
] as const;

export function pipelineSteps(env: AlertEnvironment): PipelineStep[] {
  return stepEnvironment.map(([name, variable]) => ({
    name,
    outcome: env[variable] || "skipped",
  }));
}

export async function sendPipelineFailureAlert(
  env: AlertEnvironment = process.env,
  fetchImplementation: Fetch = fetch,
): Promise<"not-needed" | "sent"> {
  const steps = pipelineSteps(env);
  const failures = steps.filter((step) => step.outcome === "failure" || step.outcome === "cancelled");

  if (failures.length === 0) {
    console.log("Pipeline succeeded; no failure alert needed.");
    return "not-needed";
  }

  const skipped = steps.filter((step) => step.outcome === "skipped");
  const apiKey = env.RESEND_API_KEY;
  const to = env.ALERT_EMAIL;
  const from = env.EMAIL_FROM;
  const runId = env.GITHUB_RUN_ID;
  const runUrl = env.GITHUB_RUN_URL;
  const event = env.GITHUB_EVENT_NAME;

  const missing = [
    ["RESEND_API_KEY", apiKey],
    ["ALERT_EMAIL", to],
    ["EMAIL_FROM", from],
    ["GITHUB_RUN_ID", runId],
    ["GITHUB_RUN_URL", runUrl],
    ["GITHUB_EVENT_NAME", event],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(`Pipeline-alert kon niet worden verstuurd: ontbrekende configuratie: ${missing.join(", ")}`);
  }

  const occurredAt = new Date().toISOString();
  const eventLabel = event === "schedule" ? "schedule" : event === "workflow_dispatch" ? "handmatig" : event;
  const failureList = failures.map((step) => `- ${step.name} (${step.outcome})`).join("\n");
  const skippedList = skipped.length > 0
    ? skipped.map((step) => `- ${step.name}`).join("\n")
    : "- Geen";
  const text = `De Daily vacancy pipeline is mislukt.

Datum/tijd (UTC): ${occurredAt}
Event: ${eventLabel}

Mislukte stappen:
${failureList}

Overgeslagen vervolgstappen:
${skippedList}

GitHub Actions-run: ${runUrl}`;

  const response = await fetchImplementation("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `vacaturegpt-daily-pipeline-${runId}`,
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "VacatureGPT: daily pipeline mislukt",
      text,
    }),
  });

  if (!response.ok) {
    const providerError = (await response.text()).slice(0, 500);
    throw new Error(`Pipeline-alert kon niet worden verstuurd: Resend HTTP ${response.status}: ${providerError}`);
  }

  console.log(`Eén pipeline-alert verstuurd voor GitHub Actions-run ${runId}.`);
  return "sent";
}

const isMainModule = process.argv[1]?.endsWith("email-pipeline-failure.ts");
if (isMainModule) {
  sendPipelineFailureAlert().catch((error) => {
    console.error(error instanceof Error ? error.message : "Pipeline-alert kon niet worden verstuurd: onbekende fout");
    process.exitCode = 1;
  });
}
