import { appendFile } from "node:fs/promises";
import OpenAI from "openai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { aiAssessments, preferences, vacancies, watchedEmployers } from "../lib/db/schema";
import { assessVacancy, assessmentIsCurrent, ASSESSMENT_CONFIG } from "../lib/ai/vacancy-assessment";
import { buildAssessmentProfile, hashProfile } from "../lib/ai/profile";

const db = getDb();
const [preference] = await db.select().from(preferences).orderBy(desc(preferences.updatedAt)).limit(1);
if (!preference) throw new Error("Geen preferences-rij gevonden; voer eerst de bestaande seed uit.");
const employerRows = await db.select({ name: watchedEmployers.name }).from(watchedEmployers).where(eq(watchedEmployers.enabled, true));
const profile = buildAssessmentProfile(preference, employerRows.map(({ name }) => name));
const profileHash = hashProfile(profile);
const activeVacancies = await db.select().from(vacancies).where(eq(vacancies.active, true));
const existing = activeVacancies.length ? await db.select().from(aiAssessments).where(inArray(aiAssessments.vacancyId, activeVacancies.map(({ id }) => id))) : [];
const existingByVacancy = new Map(existing.map((assessment) => [assessment.vacancyId, assessment]));
const pending = activeVacancies.filter((vacancy) => !assessmentIsCurrent(existingByVacancy.get(vacancy.id), vacancy.contentHash, profileHash));
const stats = { active: activeVacancies.length, skipped: activeVacancies.length - pending.length, newlyAssessed: 0, reassessed: 0, failed: 0, inputTokens: 0, outputTokens: 0 };
const client = new OpenAI();

async function processVacancy(vacancy: (typeof activeVacancies)[number]) {
  try {
    const result = await assessVacancy(client.responses, {
      title: vacancy.title, employer: vacancy.employer, location: vacancy.location,
      hoursMin: vacancy.hoursMin, hoursMax: vacancy.hoursMax, salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax, salaryPeriod: vacancy.salaryPeriod, deadline: vacancy.deadline,
      description: vacancy.description, originalText: vacancy.originalText,
    }, profile);
    const now = new Date();
    await db.insert(aiAssessments).values({
      vacancyId: vacancy.id, vacancyContentHash: vacancy.contentHash, profileHash,
      promptVersion: ASSESSMENT_CONFIG.promptVersion, model: ASSESSMENT_CONFIG.model,
      score: result.score, verdict: result.verdict, summary: result.summary,
      positives: result.positives, concerns: result.concerns, assessedAt: now, updatedAt: now,
    }).onConflictDoUpdate({ target: aiAssessments.vacancyId, set: {
      vacancyContentHash: vacancy.contentHash, profileHash, promptVersion: ASSESSMENT_CONFIG.promptVersion,
      model: ASSESSMENT_CONFIG.model, score: result.score, verdict: result.verdict,
      summary: result.summary, positives: result.positives, concerns: result.concerns,
      assessedAt: now, updatedAt: now,
    } });
    if (existingByVacancy.has(vacancy.id)) stats.reassessed++; else stats.newlyAssessed++;
    stats.inputTokens += result.inputTokens; stats.outputTokens += result.outputTokens;
    console.log(`Beoordeeld: ${vacancy.id} — ${vacancy.title} (${result.score})`);
  } catch (error) {
    stats.failed++;
    console.error(`Mislukt: ${vacancy.id} — ${vacancy.title}`, error);
  }
}

for (let index = 0; index < pending.length; index += 3) await Promise.all(pending.slice(index, index + 3).map(processVacancy));

const currentCounts = { interesting: 0, maybe: 0, not_suitable: 0 };
if (activeVacancies.length) {
  const rows = await db.select({ verdict: aiAssessments.verdict }).from(aiAssessments).innerJoin(vacancies, and(eq(aiAssessments.vacancyId, vacancies.id), eq(vacancies.active, true)));
  for (const row of rows) currentCounts[row.verdict]++;
}
const summary = `## AI-vacaturebeoordeling\n\n| Resultaat | Aantal |\n|---|---:|\n| Actieve vacatures | ${stats.active} |\n| Al actueel / overgeslagen | ${stats.skipped} |\n| Nieuw beoordeeld | ${stats.newlyAssessed} |\n| Herbeoordeeld | ${stats.reassessed} |\n| Mislukt | ${stats.failed} |\n| Interessant | ${currentCounts.interesting} |\n| Misschien | ${currentCounts.maybe} |\n| Niet passend | ${currentCounts.not_suitable} |\n| Inputtokens | ${stats.inputTokens} |\n| Outputtokens | ${stats.outputTokens} |\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
if (pending.length > 0 && stats.failed / pending.length >= 0.25) process.exitCode = 1;
