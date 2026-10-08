import { randomUUID } from "node:crypto";
import { sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { groupArticle, recallForEvaluation, receiptsForEvaluation, type GroupResult } from "@aihot/backend/events/group";
import { reportText } from "@aihot/backend/events/relate";
import { identityKeyForUrl } from "@aihot/backend/lib/url";
import { publishArticle } from "@aihot/backend/publication/publish";
import { rebaseFixtureTimes, storyPairKey, type EventRelationCase, type RecallObservation, type StoryAssignment } from "./event-grouping-eval-core.ts";

function assertScratchDatabase(): void {
  const database = new URL(process.env.DATABASE_URL ?? "postgres://unset/unset").pathname.slice(1);
  if (!/_(test|ci)$/.test(database)) throw new Error(`grouping fixtures require a throwaway *_test or *_ci database (got "${database}")`);
}

async function analyzeAndPublish(articleId: string, title: string, summary: string | null, factTitle: string) {
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, output)
            VALUES (${articleId}, 1, 'rule', 'pass', 'vulnerability', ${title}, ${summary ?? ""}, 80, false,
                    ${sql.json({ fact: { title: factTitle, subject: null, action: null, object: null } })})`;
  await publishArticle(articleId);
}

export async function recallFixture(caseRow: EventRelationCase, runStart = new Date()): Promise<RecallObservation> {
  assertScratchDatabase();
  const token = randomUUID(), sourceId = `eval-group-${token}`;
  const articleIds: string[] = [], factIds: number[] = [], storyIds: number[] = [];
  const reportByFact = new Map<number, string>();
  const rebased = rebaseFixtureTimes([caseRow], runStart).reports;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
            VALUES (${sourceId}, ${`Eval ${caseRow.caseId}`}, 'rss', 'T1', 'editorial', '2100-01-01')`;
  try {
    for (const candidate of caseRow.candidates) {
      const time = rebased.get(candidate.reportId)!;
      const inserted = await upsertMaterial({ sourceId, url: `https://eval.invalid/${token}/${candidate.reportId}`,
        title: candidate.title, excerpt: candidate.summary, bodyStatus: "none", via: "fetch",
        publishedAt: time.publishedAt, discoveredAt: time.discoveredAt });
      articleIds.push(inserted.articleId);
      await analyzeAndPublish(inserted.articleId, candidate.title, candidate.summary, candidate.factTitle);
      const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at)
        VALUES (${randomUUID()}, ${candidate.factTitle}, ${time.discoveredAt}, ${time.discoveredAt}) RETURNING id`;
      storyIds.push(story!.id);
      const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title)
        VALUES (${`f-${randomUUID()}`}, ${story!.id}, ${candidate.factTitle}) RETURNING id`;
      factIds.push(fact!.id);
      await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${inserted.articleId}, 'report')`;
      reportByFact.set(fact!.id, candidate.reportId);
    }
    const time = rebased.get(caseRow.query.reportId)!;
    const query = await upsertMaterial({ sourceId, url: `https://eval.invalid/${token}/${caseRow.query.reportId}`,
      title: caseRow.query.title, excerpt: caseRow.query.summary, bodyStatus: "none", via: "fetch",
      publishedAt: time.publishedAt, discoveredAt: time.discoveredAt });
    articleIds.push(query.articleId);
    await analyzeAndPublish(query.articleId, caseRow.query.title, caseRow.query.summary, caseRow.query.title);
    const recalled = await recallForEvaluation(query.articleId, reportText(caseRow.query.title, caseRow.query.summary));
    return { caseId: caseRow.caseId, stratum: caseRow.samplingStratum, branch: recalled.branch,
      expected: caseRow.candidates.filter((candidate) => candidate.expectedInRecall).map((candidate) => candidate.reportId),
      recalled: recalled.candidates.flatMap((candidate) => reportByFact.get(candidate.factId) ?? []),
      scores: Object.fromEntries(recalled.candidates.flatMap((candidate) => {
        const reportId = reportByFact.get(candidate.factId);
        return reportId ? [[reportId, candidate.score]] : [];
      })) };
  } finally {
    if (articleIds.length) await sql`DELETE FROM articles WHERE id = ANY(${articleIds})`;
    if (factIds.length) await sql`DELETE FROM facts WHERE id = ANY(${factIds})`;
    if (storyIds.length) await sql`DELETE FROM stories WHERE id = ANY(${storyIds})`;
    await sql`DELETE FROM sources WHERE id = ${sourceId}`;
  }
}

export async function sameUrlDiagnostic(): Promise<{ identityFolded: true; articleFolded: true }> {
  assertScratchDatabase();
  const token = randomUUID(), sourceId = `eval-url-${token}`;
  const firstUrl = `https://example.test/${token}/notice?utm_source=feed`;
  const secondUrl = `https://EXAMPLE.test/${token}/notice`;
  if (identityKeyForUrl(firstUrl) !== identityKeyForUrl(secondUrl)) throw new Error("diagnostic URLs do not normalize to one identity");
  await sql`INSERT INTO sources (id, name, kind, next_fetch_at) VALUES (${sourceId}, 'Eval URL folding', 'rss', '2100-01-01')`;
  let articleId: string | null = null;
  try {
    const first = await upsertMaterial({ sourceId, url: firstUrl, title: "Notice", via: "fetch" });
    articleId = first.articleId;
    const second = await upsertMaterial({ sourceId, url: secondUrl, title: "Notice", via: "fetch" });
    if (first.articleId !== second.articleId || !first.created || second.created) throw new Error("normal ingestion did not fold the normalized URL");
    return { identityFolded: true, articleFolded: true };
  } finally {
    if (articleId) await sql`DELETE FROM articles WHERE id = ${articleId}`;
    await sql`DELETE FROM sources WHERE id = ${sourceId}`;
  }
}

export interface EndToEndObservation {
  caseId: string;
  stratum: string;
  result: GroupResult;
  assignments: StoryAssignment[];
  receiptIds: number[];
}

export async function endToEndFixture(caseRow: EventRelationCase, runStart = new Date()): Promise<EndToEndObservation> {
  assertScratchDatabase();
  const token = randomUUID();
  const articleIds: string[] = [], factIds: number[] = [], storyIds: number[] = [], sourceIds: string[] = [];
  const articleByReport = new Map<string, string>();
  const storyByKey = new Map<string, number>(), factByKey = new Map<string, number>();
  const rebased = rebaseFixtureTimes([caseRow], runStart).reports;
  const sourceFor = async (reportId: string, name: string, firstParty: boolean) => {
    const id = `eval-e2e-${token}-${sourceIds.length}`;
    sourceIds.push(id);
    await sql`INSERT INTO sources (id, name, kind, tier, first_party, participation_mode, next_fetch_at)
              VALUES (${id}, ${name}, 'rss', 'T1', ${firstParty}, 'editorial', '2100-01-01')`;
    return id;
  };
  const insert = async (report: EventRelationCase["query"], factTitle: string) => {
    const time = rebased.get(report.reportId)!;
    const sourceId = await sourceFor(report.reportId, report.sourceName, report.firstParty);
    const row = await upsertMaterial({ sourceId, url: `https://eval.invalid/${token}/${report.reportId}`, title: report.title,
      excerpt: report.summary, bodyStatus: "none", via: "fetch", publishedAt: time.publishedAt, discoveredAt: time.discoveredAt });
    articleIds.push(row.articleId);
    articleByReport.set(report.reportId, row.articleId);
    await analyzeAndPublish(row.articleId, report.title, report.summary, factTitle);
    return row.articleId;
  };
  try {
    for (const candidate of caseRow.candidates) {
      const articleId = await insert(candidate, candidate.factTitle);
      let storyId = storyByKey.get(candidate.identity.storyKey);
      if (!storyId) {
        const time = rebased.get(candidate.reportId)!;
        const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, first_report_at, latest_at)
          VALUES (${randomUUID()}, ${candidate.factTitle}, ${time.discoveredAt}, ${time.discoveredAt}) RETURNING id`;
        storyId = story!.id; storyIds.push(storyId); storyByKey.set(candidate.identity.storyKey, storyId);
      }
      const factKey = `${candidate.identity.storyKey}:${candidate.identity.eventKey}`;
      let factId = factByKey.get(factKey);
      if (!factId) {
        const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title)
          VALUES (${`f-${randomUUID()}`}, ${storyId}, ${candidate.factTitle}) RETURNING id`;
        factId = fact!.id; factIds.push(factId); factByKey.set(factKey, factId);
      }
      await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${factId}, ${articleId}, 'report')`;
    }
    const queryId = await insert(caseRow.query, caseRow.query.title);
    const result = await groupArticle(queryId);
    if (result.factId && !factIds.includes(result.factId)) factIds.push(result.factId);
    if (result.storyId && !storyIds.includes(result.storyId)) storyIds.push(result.storyId);
    const liveStory = async (articleId: string) => {
      const [row] = await sql<{ id: number }[]>`WITH RECURSIVE chain AS (
        SELECT st.id, st.merged_into FROM fact_articles fa JOIN facts f ON f.id=fa.fact_id JOIN stories st ON st.id=f.story_id
        WHERE fa.article_id=${articleId}
        UNION ALL SELECT st.id, st.merged_into FROM stories st JOIN chain c ON st.id=c.merged_into)
        SELECT id FROM chain WHERE merged_into IS NULL LIMIT 1`;
      return row ? String(row.id) : `standalone:${articleId}`;
    };
    const assignments: StoryAssignment[] = [{ reportId: caseRow.query.reportId, goldStoryKey: caseRow.query.identity.storyKey,
      predictedStoryId: await liveStory(queryId), constrained: true }];
    for (const candidate of caseRow.candidates) assignments.push({ reportId: candidate.reportId,
      goldStoryKey: candidate.identity.storyKey, predictedStoryId: await liveStory(articleByReport.get(candidate.reportId)!),
      constrained: candidate.gold.relation !== "ROUNDUP" });
    const receipts = receiptsForEvaluation(result);
    return { caseId: caseRow.caseId, stratum: caseRow.samplingStratum, result, assignments,
      receiptIds: [...new Set(receipts)] };
  } finally {
    if (articleIds.length) await sql`DELETE FROM articles WHERE id = ANY(${articleIds})`;
    if (factIds.length) await sql`DELETE FROM facts WHERE id = ANY(${factIds})`;
    if (storyIds.length) await sql`DELETE FROM stories WHERE id = ANY(${storyIds})`;
    if (sourceIds.length) await sql`DELETE FROM sources WHERE id = ANY(${sourceIds})`;
  }
}

/** Full Stage C: ingest each unique report once, globally ordered by real ingestion time. */
export async function endToEndDatasetFixture(cases: EventRelationCase[], runStart = new Date()): Promise<{
  assignments: StoryAssignment[]; excludedPairs: string[];
  verdicts: Array<{ reportId: string; verdict: GroupResult["verdict"] }>; receiptIds: number[];
}> {
  assertScratchDatabase();
  const token = randomUUID();
  const reports = new Map<string, EventRelationCase["query"]>();
  const excludedPairs = new Set<string>();
  for (const row of cases) {
    reports.set(row.query.reportId, row.query);
    for (const candidate of row.candidates) {
      reports.set(candidate.reportId, candidate);
      if (candidate.gold.relation === "ROUNDUP") excludedPairs.add(storyPairKey(row.query.reportId, candidate.reportId));
    }
  }
  const rebased = rebaseFixtureTimes(cases, runStart).reports;
  const articleIds: string[] = [], factIds: number[] = [], storyIds: number[] = [], sourceIds: string[] = [];
  const articleByReport = new Map<string, string>();
  const verdicts: Array<{ reportId: string; verdict: GroupResult["verdict"] }> = [];
  const receiptIds: number[] = [];
  try {
    const ordered = [...reports.values()].sort((a, b) => Date.parse(a.ingestedAt) - Date.parse(b.ingestedAt) || a.reportId.localeCompare(b.reportId));
    for (const report of ordered) {
      const sourceId = `eval-global-${token}-${sourceIds.length}`;
      sourceIds.push(sourceId);
      await sql`INSERT INTO sources (id, name, kind, tier, first_party, participation_mode, next_fetch_at)
                VALUES (${sourceId}, ${report.sourceName}, 'rss', 'T1', ${report.firstParty}, 'editorial', '2100-01-01')`;
      const time = rebased.get(report.reportId)!;
      const inserted = await upsertMaterial({ sourceId, url: `https://eval.invalid/${token}/${report.reportId}`, title: report.title,
        excerpt: report.summary, bodyStatus: "none", via: "fetch", publishedAt: time.publishedAt, discoveredAt: time.discoveredAt });
      articleIds.push(inserted.articleId); articleByReport.set(report.reportId, inserted.articleId);
      const factTitle = "factTitle" in report ? String(report.factTitle) : report.title;
      await analyzeAndPublish(inserted.articleId, report.title, report.summary, factTitle);
      const result = await groupArticle(inserted.articleId);
      receiptIds.push(...receiptsForEvaluation(result));
      if (result.factId && !factIds.includes(result.factId)) factIds.push(result.factId);
      if (result.storyId && !storyIds.includes(result.storyId)) storyIds.push(result.storyId);
      verdicts.push({ reportId: report.reportId, verdict: result.verdict });
    }
    const assignments: StoryAssignment[] = [];
    for (const report of reports.values()) {
      const articleId = articleByReport.get(report.reportId)!;
      const [row] = await sql<{ id: number }[]>`WITH RECURSIVE chain AS (
        SELECT st.id, st.merged_into FROM fact_articles fa JOIN facts f ON f.id=fa.fact_id JOIN stories st ON st.id=f.story_id
        WHERE fa.article_id=${articleId}
        UNION ALL SELECT st.id, st.merged_into FROM stories st JOIN chain c ON st.id=c.merged_into)
        SELECT id FROM chain WHERE merged_into IS NULL LIMIT 1`;
      assignments.push({ reportId: report.reportId, goldStoryKey: report.identity.storyKey,
        predictedStoryId: row ? String(row.id) : `standalone:${articleId}`, constrained: true });
    }
    return { assignments, excludedPairs: [...excludedPairs], verdicts, receiptIds: [...new Set(receiptIds)] };
  } finally {
    if (articleIds.length) await sql`DELETE FROM articles WHERE id = ANY(${articleIds})`;
    if (factIds.length) await sql`DELETE FROM facts WHERE id = ANY(${factIds})`;
    // Consolidation can leave merged stories not returned by GroupResult; remove every fixture story
    // after its articles/facts are gone by their unique public titles/source provenance.
    if (storyIds.length) await sql`DELETE FROM stories WHERE id = ANY(${storyIds})`;
    if (sourceIds.length) await sql`DELETE FROM sources WHERE id = ANY(${sourceIds})`;
  }
}
