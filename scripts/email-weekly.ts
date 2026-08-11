import { appendFile } from "node:fs/promises";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { aiAssessments, emailDigestItems, emailDigestRuns, feedback, vacancies } from "../lib/db/schema";
import { buildWeeklyDigest, digestBoundary, selectWeeklyVacancies, weeklyRunKey, type DigestVacancy } from "../lib/email/weekly-digest";

type Outcome = { eligible: number; included: number; status: "disabled" | "skipped" | "sent" | "failed"; message: string; runKey: string };
const now = new Date();
const runKey = weeklyRunKey(now);
const db = getDb();
let outcome: Outcome = { eligible: 0, included: 0, status: "failed", message: "Digest niet voltooid", runKey };
let activeRunId: number | null = null;

async function writeSummary(result: Outcome) {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (!summary) return;
  const noMatch = result.message === "Geen nieuwe geschikte vacatures voor deze week" ? "\nGeen nieuwe geschikte vacatures voor deze week\n" : "";
  await appendFile(summary, `## Weekly vacancy email\n\n- Eligible candidates: ${result.eligible}\n- Included: ${result.included}\n- Status: ${result.status}\n${noMatch}`);
}

try {
  const [existingRun] = await db.select().from(emailDigestRuns).where(eq(emailDigestRuns.runKey, runKey)).limit(1);
  if (existingRun?.status === "sent") {
    outcome = { eligible: 0, included: 0, status: "skipped", message: "Deze weekdigest is al succesvol verzonden", runKey };
  } else {
    const [lastSuccessful] = await db.select({ sentAt: emailDigestRuns.sentAt }).from(emailDigestRuns)
      .where(eq(emailDigestRuns.status, "sent")).orderBy(desc(emailDigestRuns.sentAt)).limit(1);
    const sentRows = await db.select({ vacancyId: emailDigestItems.vacancyId }).from(emailDigestItems)
      .innerJoin(emailDigestRuns, and(eq(emailDigestItems.runId, emailDigestRuns.id), eq(emailDigestRuns.status, "sent")));
    const rows = await db.select({
      id: vacancies.id, title: vacancies.title, employer: vacancies.employer, location: vacancies.location, active: vacancies.active,
      hoursMin: vacancies.hoursMin, hoursMax: vacancies.hoursMax, hoursOriginal: vacancies.hoursOriginal,
      salaryMin: vacancies.salaryMin, salaryMax: vacancies.salaryMax, salaryPeriod: vacancies.salaryPeriod, salaryOriginal: vacancies.salaryOriginal,
      firstSeenAt: vacancies.firstSeenAt, score: aiAssessments.score, verdict: aiAssessments.verdict, feedbackId: feedback.id,
    }).from(vacancies).innerJoin(aiAssessments, eq(vacancies.id, aiAssessments.vacancyId)).leftJoin(feedback, eq(vacancies.id, feedback.vacancyId));
    const candidates: DigestVacancy[] = rows.map(({ feedbackId, ...row }) => ({ ...row, reviewed: feedbackId !== null }));
    const selected = selectWeeklyVacancies(candidates, digestBoundary(now, lastSuccessful?.sentAt ?? null), new Set(sentRows.map((row) => row.vacancyId)));
    outcome.eligible = candidates.filter((vacancy) => vacancy.active && vacancy.firstSeenAt > digestBoundary(now, lastSuccessful?.sentAt ?? null) && vacancy.verdict !== "not_suitable" && !sentRows.some((sent) => sent.vacancyId === vacancy.id)).length;
    outcome.included = selected.length;

    if (selected.length === 0) {
      outcome = { ...outcome, status: "skipped", message: "Geen nieuwe geschikte vacatures voor deze week" };
    } else if (process.env.ENABLE_EMAIL !== "true") {
      outcome = { ...outcome, status: "disabled", message: `Preview: ${selected.length} vacatures; e-mail is uitgeschakeld` };
    } else {
      const [run] = await db.insert(emailDigestRuns).values({ runKey, status: "pending" }).onConflictDoUpdate({ target: emailDigestRuns.runKey, set: { status: "pending", error: null } }).returning();
      activeRunId = run.id;
      const apiKey = process.env.RESEND_API_KEY;
      const to = process.env.ALERT_EMAIL;
      const from = process.env.EMAIL_FROM;
      const baseUrl = process.env.APP_BASE_URL;
      if (!apiKey || !to || !from || !baseUrl) throw new Error("RESEND_API_KEY, ALERT_EMAIL, EMAIL_FROM en APP_BASE_URL zijn vereist wanneer e-mail is ingeschakeld");
      const content = buildWeeklyDigest(selected, baseUrl);
      const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `vacaturegpt-weekly-${runKey}` }, body: JSON.stringify({ from, to: [to], ...content }) });
      if (!response.ok) {
        const providerError = (await response.text()).slice(0, 500);
        await db.update(emailDigestRuns).set({ status: "failed", error: `Resend HTTP ${response.status}: ${providerError}` }).where(eq(emailDigestRuns.id, run.id));
        throw new Error(`Resend heeft verzending geweigerd (HTTP ${response.status})`);
      }
      const provider = await response.json() as { id?: string };
      await db.insert(emailDigestItems).values(selected.map((vacancy) => ({ runId: run.id, vacancyId: vacancy.id }))).onConflictDoNothing();
      await db.update(emailDigestRuns).set({ status: "sent", sentAt: now, providerMessageId: provider.id ?? null, error: null }).where(eq(emailDigestRuns.id, run.id));
      outcome = { ...outcome, status: "sent", message: `${selected.length} vacatures verzonden` };
    }
  }
} catch (error) {
  outcome = { ...outcome, status: "failed", message: error instanceof Error ? error.message : "Onbekende fout" };
  if (activeRunId !== null) await db.update(emailDigestRuns).set({ status: "failed", error: outcome.message.slice(0, 500) }).where(eq(emailDigestRuns.id, activeRunId));
  process.exitCode = 1;
} finally {
  console.log(JSON.stringify(outcome));
  await writeSummary(outcome);
}
