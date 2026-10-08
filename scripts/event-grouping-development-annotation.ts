import { z } from "zod";
import { RELATIONS, type Relation } from "@aihot/backend/events/relate";
import type { EventRelationCase } from "./event-grouping-eval-core.ts";

export const REVIEW_CONFIDENCES = ["high", "medium", "low"] as const;
export const ReviewDecisionSchema = z.object({
  caseId: z.string().min(1), reportId: z.string().min(1), relation: z.enum(RELATIONS),
  confidence: z.enum(REVIEW_CONFIDENCES), insufficient: z.boolean(), reason: z.string().min(1),
});
export const ReviewBatchSchema = z.object({ decisions: z.array(ReviewDecisionSchema) });
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

export const REVIEW_JSON_SCHEMA = {
  type: "object", additionalProperties: false, required: ["decisions"],
  properties: { decisions: { type: "array", items: {
    type: "object", additionalProperties: false,
    required: ["caseId", "reportId", "relation", "confidence", "insufficient", "reason"],
    properties: {
      caseId: { type: "string" }, reportId: { type: "string" }, relation: { enum: RELATIONS },
      confidence: { enum: REVIEW_CONFIDENCES }, insufficient: { type: "boolean" }, reason: { type: "string" },
    },
  } } },
} as const;

export const REVIEW_SYSTEM = `You independently label security-event report pairs for an evaluation dataset.
Use exactly SAME_OCCURRENCE, SAME_STORY, UNRELATED, or ROUNDUP.
SAME_OCCURRENCE means the same real-world happening reported twice. SAME_STORY means a later or earlier
development in the same lifecycle. Different CVEs are UNRELATED. ROUNDUP applies when one side is a
multi-topic digest containing the other item. An advisory revision is SAME_STORY, not SAME_OCCURRENCE.
Synchronous official/vendor confirmation or cross-source reporting of one disclosure is SAME_OCCURRENCE.
A later patch, PoC, exploitation report, KEV addition, advisory revision, or status change is SAME_STORY.
Judge only the supplied evidence. Set insufficient=true when it cannot support one decisive label.
Return exactly one decision for every supplied caseId/reportId and do not use tools or outside knowledge.
Return only JSON in this exact shape: {"decisions":[{"caseId":"...","reportId":"...","relation":"SAME_STORY","confidence":"high","insufficient":false,"reason":"..."}]}.`;

export function reviewPrompt(cases: EventRelationCase[]): string {
  return JSON.stringify({ pairs: cases.flatMap((row) => row.candidates.filter((candidate) => !candidate.annotation.humanAdjudicated).map((candidate) => ({
    caseId: row.caseId, reportId: candidate.reportId, samplingStratum: row.samplingStratum,
    query: { title: row.query.title, summary: row.query.summary?.slice(0, 800) ?? null, sourceName: row.query.sourceName, publishedAt: row.query.publishedAt },
    candidate: { title: candidate.title, summary: candidate.summary?.slice(0, 800) ?? null, sourceName: candidate.sourceName, publishedAt: candidate.publishedAt },
    sourceUrls: candidate.annotation.sourceUrls,
  }))) });
}

function key(value: { caseId: string; reportId: string }): string { return `${value.caseId}\u0000${value.reportId}`; }

export function assertCompleteReview(cases: EventRelationCase[], decisions: ReviewDecision[], pass: string): Map<string, ReviewDecision> {
  const expected = cases.flatMap((row) => row.candidates.filter((candidate) => !candidate.annotation.humanAdjudicated).map((candidate) => key({ caseId: row.caseId, reportId: candidate.reportId })));
  const byKey = new Map<string, ReviewDecision>();
  for (const decision of decisions) {
    const id = key(decision);
    if (byKey.has(id)) throw new Error(`${pass}: duplicate decision ${decision.caseId}/${decision.reportId}`);
    byKey.set(id, decision);
  }
  const expectedSet = new Set(expected);
  const missing = expected.filter((id) => !byKey.has(id));
  const extra = [...byKey.keys()].filter((id) => !expectedSet.has(id));
  if (missing.length || extra.length) throw new Error(`${pass}: decision coverage mismatch (missing ${missing.length}, extra ${extra.length})`);
  return byKey;
}

const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
const lowerConfidence = (a: ReviewDecision["confidence"], b: ReviewDecision["confidence"]) => confidenceRank[a] <= confidenceRank[b] ? a : b;

export function mergeDevelopmentReviews(cases: EventRelationCase[], proposed: ReviewDecision[], reviewed: ReviewDecision[], labellers: { proposed: string; reviewed: string }): EventRelationCase[] {
  const first = assertCompleteReview(cases, proposed, "proposed");
  const second = assertCompleteReview(cases, reviewed, "reviewed");
  return cases.map((row) => ({ ...row, candidates: row.candidates.map((candidate) => {
    if (candidate.annotation.humanAdjudicated) return candidate;
    const a = first.get(key({ caseId: row.caseId, reportId: candidate.reportId }))!;
    const b = second.get(key({ caseId: row.caseId, reportId: candidate.reportId }))!;
    const confidence = lowerConfidence(a.confidence, b.confidence);
    const insufficient = a.insufficient || b.insufficient;
    const disagrees = a.relation !== b.relation;
    const occurrenceStoryBoundary = new Set<Relation>([a.relation, b.relation]).size === 2
      && [a.relation, b.relation].every((relation) => relation === "SAME_OCCURRENCE" || relation === "SAME_STORY");
    const needsHuman = occurrenceStoryBoundary || (!disagrees && confidence === "low" && (a.relation === "SAME_OCCURRENCE" || a.relation === "SAME_STORY"));
    const status = insufficient ? "insufficient" : disagrees || needsHuman ? "disputed" : "decisive";
    return { ...candidate,
      gold: { relation: b.relation },
      annotation: { ...candidate.annotation, status, labelSource: "model-reviewed", humanAdjudicated: false,
        labeller: `${labellers.proposed}+${labellers.reviewed}`, reviewers: [labellers.proposed, labellers.reviewed], confidence, adjudicator: null,
        note: `proposal=${a.relation}/${a.confidence}: ${a.reason}; review=${b.relation}/${b.confidence}: ${b.reason}` },
    };
  }) }));
}

export function mergeHoldoutReviews(cases: EventRelationCase[], passes: Array<{ model: string; decisions: ReviewDecision[] }>): EventRelationCase[] {
  if (passes.length < 3) throw new Error("holdout review requires at least three independent model passes");
  const models = passes.map((pass) => pass.model);
  if (new Set(models).size !== models.length) throw new Error("holdout review model identifiers must be unique");
  const decisions = passes.map((pass, index) => assertCompleteReview(cases, pass.decisions, `review-${index + 1}`));
  return cases.map((row) => ({ ...row, candidates: row.candidates.map((candidate) => {
    if (candidate.annotation.humanAdjudicated) return candidate;
    const id = key({ caseId: row.caseId, reportId: candidate.reportId });
    const votes = decisions.map((pass) => pass.get(id)!);
    const unanimous = votes.every((vote) => !vote.insufficient && vote.relation === votes[0]!.relation && vote.confidence === "high");
    return { ...candidate,
      gold: { relation: votes[0]!.relation },
      annotation: { ...candidate.annotation, status: unanimous ? "decisive" : "disputed",
        labelSource: "model-reviewed", humanAdjudicated: false, adjudicator: null,
        labeller: models.join("+"), reviewers: models, confidence: unanimous ? "high" : votes.reduce((lowest, vote) => lowerConfidence(lowest, vote.confidence), "high" as ReviewDecision["confidence"]),
        note: votes.map((vote, index) => `review${index + 1}=${vote.relation}/${vote.confidence}${vote.insufficient ? "/insufficient" : ""}: ${vote.reason}`).join("; ") },
    };
  }) }));
}
