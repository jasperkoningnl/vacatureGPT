import { appendFile } from "node:fs/promises";
import OpenAI from "openai";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../lib/db";
import { latestFeedbackPerVacancy } from "../lib/db/latest-feedback";
import { aiAssessments, preferences, vacancies, watchedEmployers } from "../lib/db/schema";
import { assessVacancy, ASSESSMENT_CONFIG } from "../lib/ai/vacancy-assessment";
import { buildAssessmentProfile, hashProfile } from "../lib/ai/profile";
import { buildCalibrationContext } from "../lib/ai/calibration-context";
import { parseAssessmentMode, selectAssessmentCandidates } from "../lib/ai/assessment-run";
import { vacancyContentDepth } from "../lib/vacancy-depth";

const mode = parseAssessmentMode(process.argv.slice(2));
const db = getDb();
const activeVacancies = await db.select().from(vacancies).where(eq(vacancies.active, true));

if (mode === "preview") {
  const summary = `## Preview: actieve vacature-backlog herbeoordelen\n\n| Resultaat | Aantal |\n|---|---:|\n| Actieve vacatures die herbeoordeeld zouden worden | ${activeVacancies.length} |\n\n**Preview voltooid: er zijn geen OpenAI-calls gedaan en er is geen data gewijzigd.**\n`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exit(0);
}

const [preference] = await db.select().from(preferences).orderBy(desc(preferences.updatedAt)).limit(1);
if (!preference) throw new Error("Geen preferences-rij gevonden; voer eerst de bestaande seed uit.");
const employerRows = await db.select({ name: watchedEmployers.name }).from(watchedEmployers).where(eq(watchedEmployers.enabled, true));
const profile = buildAssessmentProfile(preference, employerRows.map(({ name }) => name));
const profileHash = hashProfile(profile);
const feedback = latestFeedbackPerVacancy(db);
const calibrationRows = await db.select({
  id: feedback.id, learningEligible: feedback.learningEligible, aiVerdict: feedback.aiVerdict,
  userVerdict: feedback.value, reasonCode: feedback.reasonCode, note: feedback.note,
  vacancyTitle: vacancies.title, employer: vacancies.employer, updatedAt: feedback.updatedAt, originalText: vacancies.originalText,
}).from(feedback).innerJoin(vacancies, eq(vacancies.id, feedback.vacancyId)).where(eq(feedback.learningEligible, true));
// Een oordeel op een metadata-only vacature is geen volwaardig kalibratievoorbeeld; de diepte wordt live bepaald.
const calibrationContext = buildCalibrationContext(calibrationRows.map((row) => ({ ...row, contentDepth: vacancyContentDepth(row) })));
const existing = activeVacancies.length ? await db.select().from(aiAssessments).where(inArray(aiAssessments.vacancyId, activeVacancies.map(({ id }) => id))) : [];
const existingByVacancy = new Map(existing.map((assessment) => [assessment.vacancyId, assessment]));
const pending = selectAssessmentCandidates(activeVacancies, existing, profileHash, mode);
const stats = { active: activeVacancies.length, skipped: activeVacancies.length - pending.length, newlyAssessed: 0, reassessed: 0, failed: 0, metadataOnly: 0, inputTokens: 0, outputTokens: 0, verdicts: { interesting: 0, maybe: 0, not_suitable: 0 } };
const client = new OpenAI();

async function processVacancy(vacancy: (typeof activeVacancies)[number]) {
  try {
    const result = await assessVacancy(client.responses, {
      title: vacancy.title, employer: vacancy.employer, location: vacancy.location,
      hoursMin: vacancy.hoursMin, hoursMax: vacancy.hoursMax, salaryMin: vacancy.salaryMin,
      salaryMax: vacancy.salaryMax, salaryPeriod: vacancy.salaryPeriod, deadline: vacancy.deadline,
      description: vacancy.description, originalText: vacancy.originalText,
    }, profile, calibrationContext);
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
    if (result.contentDepth === "metadata_only") stats.metadataOnly++;
    stats.inputTokens += result.inputTokens; stats.outputTokens += result.outputTokens;
    stats.verdicts[result.verdict]++;
    console.log(`Beoordeeld: ${vacancy.id} — ${vacancy.title} (${result.score}, ${result.contentDepth})`);
  } catch (error) {
    stats.failed++;
    console.error(`Mislukt: ${vacancy.id} — ${vacancy.title}`, error);
  }
}

for (let index = 0; index < pending.length; index += 3) await Promise.all(pending.slice(index, index + 3).map(processVacancy));

const counts = mode === "reassess" ? stats.verdicts : { interesting: 0, maybe: 0, not_suitable: 0 };
if (mode === "normal" && activeVacancies.length) {
  const rows = await db.select({ verdict: aiAssessments.verdict }).from(aiAssessments).innerJoin(vacancies, and(eq(aiAssessments.vacancyId, vacancies.id), eq(vacancies.active, true)));
  for (const row of rows) counts[row.verdict]++;
}
const heading = mode === "reassess" ? "Herbeoordeling actieve vacature-backlog" : "AI-vacaturebeoordeling";
const summary = `## ${heading}

| Resultaat | Aantal |
|---|---:|
| Actieve vacatures | ${stats.active} |
| Al actueel / overgeslagen | ${stats.skipped} |
| Nieuw beoordeeld | ${stats.newlyAssessed} |
| Succesvol herbeoordeeld | ${stats.newlyAssessed + stats.reassessed} |
| Mislukt | ${stats.failed} |
| Beoordeeld op alleen metadata | ${stats.metadataOnly} |
| Interessant | ${counts.interesting} |
| Misschien | ${counts.maybe} |
| Niet passend | ${counts.not_suitable} |
| Inputtokens | ${stats.inputTokens} |
| Outputtokens | ${stats.outputTokens} |
`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
if (pending.length > 0 && stats.failed / pending.length >= 0.25) process.exitCode = 1;
