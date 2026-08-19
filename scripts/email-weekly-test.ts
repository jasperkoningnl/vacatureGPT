import { appendFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { aiAssessments, feedback, vacancies } from "../lib/db/schema";
import { buildWeeklyDigest, selectTestWeeklyVacancies, testEmailIdempotencyKey, type DigestVacancy } from "../lib/email/weekly-digest";

type Outcome = { eligible: number; included: number; status: "sent" | "disabled" | "failed"; message: string };
let outcome: Outcome = { eligible: 0, included: 0, status: "failed", message: "Testmail niet voltooid" };

async function writeSummary(result: Outcome) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const detail = result.status === "failed" ? `\n- Error: ${result.message.replaceAll("\n", " ")}` : "";
  await appendFile(summary, `## Test weekly vacancy email\n\n- Eligible: ${result.eligible}\n- Included: ${result.included}\n- Status: ${result.status}${detail}\n`);
}

try {
  const db = getDb();
  const rows: DigestVacancy[] = await db.select({
    id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, active: vacancies.active,
    hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, hoursOriginal: vacancies.hoursOriginal,
    salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax, salaryPeriod: vacancies.salaryPeriod, salaryOriginal: vacancies.salaryOriginal,
    deadline: vacancies.deadline,
    firstSeenAt: vacancies.firstSeenAt, score: aiAssessments.score, verdict: aiAssessments.verdict, feedbackValue: feedback.value,
  }).from(vacancies).innerJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId)).leftJoin(feedback, eq(vacancies.id, feedback.vacancyId));
  const eligible = selectTestWeeklyVacancies(rows, Number.MAX_SAFE_INTEGER);
  const selected = eligible.slice(0, 15);
  outcome = { ...outcome, eligible: eligible.length, included: selected.length };

  if (process.env.ENABLE_EMAIL !== "true") {
    outcome = { ...outcome, status: "disabled", message: "E-mail is uitgeschakeld" };
  } else {
    const apiKey = process.env.RESEND_API_KEY;
    const to = process.env.ALERT_EMAIL;
    const from = process.env.EMAIL_FROM;
    const baseUrl = process.env.APP_BASE_URL;
    if (!apiKey || !to || !from || !baseUrl) throw new Error("RESEND_API_KEY, ALERT_EMAIL, EMAIL_FROM en APP_BASE_URL zijn vereist wanneer e-mail is ingeschakeld");
    const idempotencyKey = testEmailIdempotencyKey(process.env.GITHUB_RUN_ID ?? "");
    const content = buildWeeklyDigest(selected, baseUrl);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify({ from, to: [to], ...content }),
    });
    if (!response.ok) throw new Error(`Resend heeft verzending geweigerd (HTTP ${response.status}): ${(await response.text()).slice(0, 500)}`);
    outcome = { ...outcome, status: "sent", message: `${selected.length} vacatures verzonden` };
  }
} catch (error) {
  outcome = { ...outcome, status: "failed", message: error instanceof Error ? error.message : "Onbekende fout" };
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(outcome));
  await writeSummary(outcome);
}
