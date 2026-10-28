import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql } from "../db.ts";
import { ImpactRowSchema } from "../agents/impact-contract.ts";
import { resolveImpactEntity } from "../agents/impact-store.ts";
import { parseVersionRange } from "../agents/version-matcher.ts";
import { Conflict } from "./sources.ts";

const ResolutionSchema = z.object({
  action: z.enum(["accept", "dismiss"]),
  reason: z.string().trim().min(1).max(2_000),
  version: z.number().int().positive(),
}).strict();

function storedRange(range: { raw: string; supported: boolean }) {
  const parsed = range.supported ? parseVersionRange(range.raw) : null;
  return parsed ? { raw: range.raw, supported: true, range: parsed } : { raw: range.raw, supported: false };
}

/**
 * Resolves one queued Product Impact review. The browser may choose only accept/dismiss; it cannot
 * submit replacement claim fields. Accept reparses the immutable queued payload and rechecks every
 * Evidence id against the same Story before appending a product-specific current row.
 */
export async function resolveImpactReview(
  id: number,
  rawInput: unknown,
  actor: string,
) {
  const input = ResolutionSchema.parse(rawInput);
  const result = await sql.begin(async (tx) => {
    const [review] = await tx<{
      id: number; public_id: string; story_id: number; run_id: string; payload: unknown;
      status: "open" | "resolved" | "dismissed"; version: number;
    }[]>`
      SELECT id, public_id::text, story_id, run_id::text, payload, status, version
      FROM impact_human_reviews WHERE id = ${id} FOR UPDATE`;
    if (!review) return null;
    if (review.status !== "open" || review.version !== input.version) {
      throw new Conflict("这条复核已被其他管理员处理，请刷新");
    }

    let impactPublicId: string | null = null;
    if (input.action === "accept") {
      const row = ImpactRowSchema.parse(review.payload);
      if (row.confidence !== "medium") throw new Error("only a medium-confidence impact row can be accepted");

      const evidence = await tx<{ public_id: string }[]>`
        SELECT public_id::text FROM external_evidence
        WHERE story_id = ${review.story_id} AND public_id = ANY(${row.evidence_ids})`;
      if (evidence.length !== new Set(row.evidence_ids).size) {
        throw new Error("review references missing or cross-story evidence");
      }

      const [run] = await tx<{ id: number }[]>`
        SELECT id FROM agent_research_runs
        WHERE public_id = ${review.run_id} AND story_id = ${review.story_id}
          AND status = 'completed' AND graph_version LIKE 'phase6-%'`;
      if (!run) throw new Error("review source is not a completed Product Impact run");

      const vendor = await resolveImpactEntity(tx, "vendor", row.vendor, []);
      const product = await resolveImpactEntity(tx, "product_family", row.product, [row.vendor]);
      const [state] = await tx<{ max_version: number }[]>`
        SELECT coalesce(max(impact_version), 0)::int AS max_version
        FROM product_impacts WHERE story_id = ${review.story_id}`;
      const nextVersion = (state?.max_version ?? 0) + 1;

      await tx`
        UPDATE product_impacts SET status = 'superseded', superseded_at = now()
        WHERE story_id = ${review.story_id} AND product_entity_id = ${product.id} AND status = 'current'`;
      impactPublicId = randomUUID();
      await tx`
        INSERT INTO product_impacts
          (public_id, story_id, impact_version, run_id, persisted_kind, vendor_entity_id,
           product_entity_id, cve_id, models, affected_range, fixed_range, mitigations,
           confidence, routing, exploit_status, unknowns, evidence_ids)
        VALUES
          (${impactPublicId}, ${review.story_id}, ${nextVersion}, ${review.run_id}, 'claims',
           ${vendor.id}, ${product.id}, ${row.cve_id}, ${row.models},
           ${tx.json(storedRange(row.affected_range) as never)},
           ${row.fixed_range ? tx.json(storedRange(row.fixed_range) as never) : null},
           ${row.mitigations}, 'high', 'human_review',
           ${tx.json({ poc: "unknown", known_exploited: "unknown" } as never)},
           ${["Exploit status remains unknown after human approval of the product-impact row."]},
           ${row.evidence_ids})`;
      await tx`
        INSERT INTO story_entities (story_id, entity_id, role)
        VALUES (${review.story_id}, ${vendor.id}, 'vendor'),
               (${review.story_id}, ${product.id}, 'affected_product')
        ON CONFLICT DO NOTHING`;
    }

    const resultingStatus = input.action === "accept" ? "resolved" : "dismissed";
    await tx`
      UPDATE impact_human_reviews
      SET status = ${resultingStatus}, resolved_at = now(), resolved_by = ${actor},
          resolution_reason = ${input.reason}, version = version + 1
      WHERE id = ${review.id}`;
    await tx`
      INSERT INTO impact_human_review_actions
        (review_id, action, actor, reason, previous_status, resulting_status, impact_public_id)
      VALUES (${review.id}, ${input.action}, ${actor}, ${input.reason}, 'open',
              ${resultingStatus}, ${impactPublicId})`;
    await tx`
      INSERT INTO audit_log (actor, action, subject, reason, before, after)
      VALUES (${actor}, ${`impact-review.${input.action}`}, ${`impact-review:${review.id}`},
              ${input.reason}, ${tx.json({ status: "open", version: review.version } as never)},
              ${tx.json({ status: resultingStatus, version: review.version + 1, impactPublicId } as never)})`;
    return {
      id: review.id,
      publicId: review.public_id,
      action: input.action,
      status: resultingStatus,
      version: review.version + 1,
      impactPublicId,
    };
  });
  return result;
}
