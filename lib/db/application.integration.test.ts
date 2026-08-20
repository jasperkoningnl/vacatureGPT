import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "./schema";
import { aiAssessments, feedback, sourceRuns, sources, vacancies, vacancyOccurrences } from "./schema";
import { type Database, queryVacancyList, setSourceEnabled } from "./application-queries";
import { storeFeedback, storeFeedbackReason } from "./feedback";
import { latestFeedbackPerVacancy } from "./latest-feedback";
import { REASON_REQUIRED_MESSAGE } from "../feedback-validation";
import { createDatabaseRunnerStore, runIngestSource } from "../ingestion/ingest-runner";

describe("database- en actionlaag", () => {
  let client: PGlite;
  let db: Database;

  beforeAll(async () => {
    client = new PGlite();
    const testDb = drizzle(client, { schema });
    await migrate(testDb, { migrationsFolder: "drizzle" });
    db = testDb as unknown as Database;
  }, 30_000);

  beforeEach(async () => {
    await client.exec("TRUNCATE feedback, ai_assessments, source_runs, vacancy_occurrences, vacancies, sources RESTART IDENTITY CASCADE");
  });

  afterAll(async () => client.close());

  async function source(slug: string, enabled = true) {
    const [result] = await db.insert(sources).values({ slug, name: slug, baseUrl: `https://${slug}.example`, enabled }).returning();
    return result;
  }

  async function vacancy(canonicalKey: string, values: Partial<typeof vacancies.$inferInsert> = {}) {
    const [result] = await db.insert(vacancies).values({
      canonicalKey, title: canonicalKey, employer: "NPO", location: "Amsterdam", originalText: canonicalKey, contentHash: canonicalKey,
      ...values,
    }).returning();
    return result;
  }

  it("draait de echte migratieketen en geeft vacatures met meerdere occurrences één keer terug", async () => {
    const firstSource = await source("villamedia");
    const secondSource = await source("oneworld");
    const item = await vacancy("redacteur");
    await db.insert(vacancyOccurrences).values([
      { vacancyId: item.id, sourceId: firstSource.id, sourceUrl: "https://villamedia.example/1", rawData: {} },
      { vacancyId: item.id, sourceId: secondSource.id, sourceUrl: "https://oneworld.example/1", rawData: {} },
    ]);

    const result = await queryVacancyList(db, {});

    expect(result.items).toHaveLength(1);
    expect(result.items[0].occurrences).toEqual([
      { source: "villamedia", url: "https://villamedia.example/1" },
      { source: "oneworld", url: "https://oneworld.example/1" },
    ]);
  });

  it("past geldige filters in de query toe en laat ongeldige enum- en bronfilters veilig vallen", async () => {
    const knownSource = await source("villamedia");
    const matching = await vacancy("match", { salaryMin: 4000 });
    const other = await vacancy("other", { location: "Utrecht" });
    await db.insert(vacancyOccurrences).values([
      { vacancyId: matching.id, sourceId: knownSource.id, sourceUrl: "https://villamedia.example/match", rawData: {} },
      { vacancyId: other.id, sourceId: knownSource.id, sourceUrl: "https://villamedia.example/other", rawData: {} },
    ]);

    const filtered = await queryVacancyList(db, { city: "Amsterdam", salary: "known", source: "villamedia" });
    const invalid = await queryVacancyList(db, { feedback: "kapot", ai: "'; drop table vacancies; --", source: "onbekend" });

    expect(filtered.items.map(({ id }) => id)).toEqual([matching.id]);
    expect(invalid.items).toHaveLength(2);
    expect(invalid.filters).toMatchObject({ feedback: undefined, ai: undefined, source: undefined });
  });

  it("bewaart feedback append-only en exposeert het nieuwste oordeel", async () => {
    const item = await vacancy("feedback");

    await storeFeedback(db, { vacancyId: item.id, value: "maybe", note: "Eerst" });
    await storeFeedback(db, { vacancyId: item.id, value: "interesting", note: "Daarna" });

    const rows = await db.select().from(feedback).where(eq(feedback.vacancyId, item.id));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ value: "maybe", note: "Eerst" });
    const latest = latestFeedbackPerVacancy(db);
    const [current] = await db.select().from(latest).where(eq(latest.vacancyId, item.id));
    expect(current).toMatchObject({ value: "interesting", note: "Daarna", learningEligible: true });
  });

  async function assess(vacancyId: number, verdict: "interesting" | "maybe" | "not_suitable") {
    await db.insert(aiAssessments).values({ vacancyId, vacancyContentHash: "h", profileHash: "p", promptVersion: "v1", model: "test", score: 70, verdict, summary: "s", positives: [], concerns: [] });
  }

  async function listedIds(filters: Parameters<typeof queryVacancyList>[1]) {
    const { items } = await queryVacancyList(db, filters);
    return items.map(({ id }) => id);
  }

  it("houdt expliciet afgewezen vacatures uit de lijst en telt ze apart", async () => {
    const listSource = await source("villamedia");
    const kept = await vacancy("behouden");
    const rejected = await vacancy("afgewezen");
    await db.insert(vacancyOccurrences).values([
      { vacancyId: kept.id, sourceId: listSource.id, sourceUrl: "https://villamedia.example/behouden", rawData: {} },
      { vacancyId: rejected.id, sourceId: listSource.id, sourceUrl: "https://villamedia.example/afgewezen", rawData: {} },
    ]);
    await storeFeedback(db, { vacancyId: rejected.id, value: "not_suitable" });

    const standard = await queryVacancyList(db, {});
    expect(standard.items.map(({ id }) => id)).toEqual([kept.id]);
    expect(standard.rejectedCount).toBe(1);
  });

  it("toont afgewezen vacatures weer na een expliciete keuze, zonder de opgeslagen feedback te wijzigen", async () => {
    const listSource = await source("villamedia");
    const rejected = await vacancy("afgewezen");
    await db.insert(vacancyOccurrences).values({ vacancyId: rejected.id, sourceId: listSource.id, sourceUrl: "https://villamedia.example/afgewezen", rawData: {} });
    await storeFeedback(db, { vacancyId: rejected.id, value: "not_suitable", note: "Te ver weg" });
    const before = await db.select().from(feedback).where(eq(feedback.vacancyId, rejected.id));

    expect(await listedIds({ rejected: "show" })).toEqual([rejected.id]);
    expect(await listedIds({ feedback: "not_suitable" })).toEqual([rejected.id]);
    expect(await listedIds({ feedback: "unreviewed" })).toEqual([]);
    expect(await db.select().from(feedback).where(eq(feedback.vacancyId, rejected.id))).toEqual(before);
  });

  it("weigert een afwijkend oordeel zonder reden op de detailpagina en bewaart het mét reden wel", async () => {
    const item = await vacancy("afwijking");
    await assess(item.id, "not_suitable");

    await expect(storeFeedback(db, { vacancyId: item.id, value: "interesting" })).rejects.toThrow(REASON_REQUIRED_MESSAGE);
    expect(await db.select().from(feedback).where(eq(feedback.vacancyId, item.id))).toHaveLength(0);

    const stored = await storeFeedback(db, { vacancyId: item.id, value: "interesting", reasonCode: "role" });
    expect(stored).toMatchObject({ value: "interesting", learningEligible: true });
  });

  it("bewaart een blind kalibratieoordeel zonder reden, maar pas als leersignaal na de aanvulling", async () => {
    const item = await vacancy("blind");
    await assess(item.id, "not_suitable");

    const blind = await storeFeedback(db, { vacancyId: item.id, value: "interesting" }, { requireReason: false });
    expect(blind).toMatchObject({ value: "interesting", learningEligible: false });

    const completed = await storeFeedbackReason(db, { vacancyId: item.id, reasonCode: "role" });
    expect(completed.learningEligible).toBe(true);
    const [row] = await db.select().from(feedback).where(eq(feedback.vacancyId, item.id));
    expect(row).toMatchObject({ reasonCode: "role", aiVerdict: "not_suitable", learningEligible: true });
  });

  it("laat een oordeel dat mét de AI meegaat meteen leersignaal zijn", async () => {
    const item = await vacancy("eens");
    await assess(item.id, "maybe");

    expect(await storeFeedback(db, { vacancyId: item.id, value: "maybe" })).toMatchObject({ learningEligible: true });
  });


  it("zoekt in vacaturetekst en gebruikt alleen het nieuwste oordeel in de lijst", async () => {
    const listSource = await source("search");
    const item = await vacancy("zoekbaar", { title: "Redacteur", description: "Digitale cultuur en erfgoed" });
    await db.insert(vacancyOccurrences).values({ vacancyId: item.id, sourceId: listSource.id, sourceUrl: "https://search.example/zoekbaar", rawData: {} });
    await storeFeedback(db, { vacancyId: item.id, value: "not_suitable" });
    await storeFeedback(db, { vacancyId: item.id, value: "interesting" });
    const result = await queryVacancyList(db, { query: "erfgoed" });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ id: item.id, feedback: "interesting" });
  });

  it("bewaart enabled en slaat ingest daadwerkelijk over voor een uitgeschakelde bron", async () => {
    const storedSource = await source("disabled");
    await setSourceEnabled(db, storedSource.id, false);
    const ingest = vi.fn();

    const result = await runIngestSource(
      { slug: "disabled", name: "disabled", baseUrl: "https://disabled.example" },
      ingest,
      createDatabaseRunnerStore(db),
    );

    const [savedSource] = await db.select().from(sources).where(eq(sources.id, storedSource.id));
    const [run] = await db.select().from(sourceRuns).where(eq(sourceRuns.sourceId, storedSource.id));
    expect(savedSource.enabled).toBe(false);
    expect(run.status).toBe("skipped");
    expect(ingest).not.toHaveBeenCalled();
    expect(result.status).toBe("skipped");
  });
});
