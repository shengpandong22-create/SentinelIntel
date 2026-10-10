import { randomUUID } from "node:crypto";
import { sql, type Db } from "../db.ts";
import {
  ImpactTaskSchema,
  validateImpactProposal,
  type ImpactRow,
  type ImpactTask,
} from "./impact-contract.ts";
import { parseVersionRange } from "./version-matcher.ts";

export interface EntityRow {
  id: number;
  kind: "vendor" | "product_family";
  canonical_name: string;
  aliases: string[];
}

/**
 * Resolves a vendor/product identity by canonical name or alias (case-insensitive), creating the
 * entity when it is genuinely new. Identity stays deterministic TypeScript state; the proposal never
 * writes entities itself. Extra aliases are merged on creation only.
 */
export async function resolveOrCreateEntity(
  kind: "vendor" | "product_family",
  name: string,
  extraAliases: string[] = [],
): Promise<EntityRow> {
  return sql.begin((tx) => resolveEntity(tx, kind, name, extraAliases));
}

async function resolveEntity(tx: Db, kind: "vendor" | "product_family", name: string, extraAliases: string[]): Promise<EntityRow> {
  const candidate = name.trim();
  if (!candidate || candidate.length > 200) throw new Error(`invalid ${kind} entity name`);
  const aliases = [...new Set(extraAliases.map((alias) => alias.trim()).filter((alias) => alias && alias.length <= 200))];
  const [existing] = await tx<EntityRow[]>`
    SELECT id, kind, canonical_name, aliases FROM security_entities
    WHERE kind = ${kind} AND (lower(canonical_name) = ${candidate.toLowerCase()}
      OR lower(${candidate}) = ANY (SELECT lower(alias) FROM unnest(aliases) AS alias))
    LIMIT 1`;
  if (existing) return existing;
  const [created] = await tx<EntityRow[]>`
    INSERT INTO security_entities (kind, canonical_name, aliases)
    VALUES (${kind}, ${candidate}, ${aliases})
    RETURNING id, kind, canonical_name, aliases`;
  return created!;
}

function rangeJson(range: { raw: string; supported: boolean }): Record<string, unknown> {
  const parsed = range.supported ? parseVersionRange(range.raw) : null;
  if (!parsed) return { raw: range.raw, supported: false };
  return { raw: range.raw, supported: true, range: parsed };
}

export async function applyImpactProposal(input: {
  task: ImpactTask;
  proposal: unknown;
  decidedAt?: Date;
}): Promise<{
  impactVersion: number;
  persistedClaimRows: number;
  unknownOnlyRows: number;
  humanReviewRows: number;
  idempotent: boolean;
}> {
  const task = ImpactTaskSchema.parse(input.task);
  const proposal = validateImpactProposal(task, input.proposal);
  const decidedAt = input.decidedAt ?? new Date();
  return sql.begin(async (tx) => {
    const [story] = await tx<{ id: number }[]>`
      SELECT id FROM stories WHERE id = ${task.story.story_id} AND merged_into IS NULL FOR UPDATE`;
    if (!story) throw new Error("impact Story is missing or merged");

    const [state] = await tx<{ maxVersion: number; runRows: number; reviewRows: number }[]>`
      SELECT (SELECT coalesce(max(impact_version), 0) FROM product_impacts WHERE story_id = ${story.id}) AS "maxVersion",
             (SELECT count(*) FROM product_impacts WHERE story_id = ${story.id} AND run_id = ${task.run_id}) AS "runRows",
             (SELECT count(*) FROM impact_human_reviews WHERE story_id = ${story.id} AND run_id = ${task.run_id}) AS "reviewRows"`;
    if ((state?.runRows ?? 0) > 0 || (state?.reviewRows ?? 0) > 0) {
      return { impactVersion: state!.maxVersion, persistedClaimRows: 0, unknownOnlyRows: 0, humanReviewRows: 0, idempotent: true };
    }

    const referenced = [...new Set(proposal.impact_rows.flatMap((row) => row.evidence_ids))];
    if (referenced.length > 0) {
      const stored = await tx<{ public_id: string }[]>`
        SELECT public_id FROM external_evidence
        WHERE story_id = ${story.id} AND public_id = ANY(${referenced})`;
      if (stored.length !== referenced.length) throw new Error("impact proposal references unstored or cross-story evidence");
    }

    // Only a run that persists rows owns a new impact_version and supersedes the previous current set;
    // a review-only run neither clears the current claims nor burns a version.
    const hasPersistedRows = proposal.impact_rows.some((row) => row.confidence !== "medium");
    const impactVersion = hasPersistedRows ? (state?.maxVersion ?? 0) + 1 : state?.maxVersion ?? 0;
    if (hasPersistedRows) {
      await tx`
        UPDATE product_impacts SET status = 'superseded', superseded_at = ${decidedAt}
        WHERE story_id = ${story.id} AND status = 'current'`;
    }

    let persistedClaimRows = 0;
    let unknownOnlyRows = 0;
    let humanReviewRows = 0;
    const vendorEntities = new Set<number>();
    const productEntities = new Set<number>();
    for (const row of proposal.impact_rows) {
      if (row.confidence === "medium") {
        // Design §12: Medium never auto-persists claims; it asks for human review.
        humanReviewRows += 1;
        await tx`
          INSERT INTO impact_human_reviews (public_id, story_id, run_id, reason, payload)
          VALUES (${randomUUID()}, ${story.id}, ${task.run_id},
                  ${`medium-confidence impact row needs review: ${row.product}`},
                  ${tx.json(row as never)})`;
        continue;
      }
      const vendor = await resolveEntity(tx, "vendor", row.vendor, []);
      const product = await resolveEntity(tx, "product_family", row.product, [row.vendor]);
      vendorEntities.add(vendor.id);
      productEntities.add(product.id);
      const unknownOnly = row.confidence !== "high";
      if (unknownOnly) unknownOnlyRows += 1;
      else persistedClaimRows += 1;
      const unknowns = unknownOnly
        ? [...proposal.unknowns, `Low-confidence impact claim kept as unknown; no claims persisted: ${row.product}.`]
        : proposal.unknowns;
      await tx`
        INSERT INTO product_impacts
          (public_id, story_id, impact_version, run_id, persisted_kind, vendor_entity_id, product_entity_id,
           cve_id, models, affected_range, fixed_range, mitigations, confidence, routing, exploit_status,
           unknowns, evidence_ids)
        VALUES
          (${randomUUID()}, ${story.id}, ${impactVersion}, ${task.run_id}, ${unknownOnly ? "unknown_only" : "claims"},
           ${vendor.id}, ${product.id}, ${row.cve_id},
           ${unknownOnly ? [] : row.models},
           ${unknownOnly ? null : tx.json(rangeJson(row.affected_range) as never)},
           ${unknownOnly || !row.fixed_range ? null : tx.json(rangeJson(row.fixed_range) as never)},
           ${unknownOnly ? [] : row.mitigations}, ${row.confidence}, ${unknownOnly ? "unknown" : "auto"},
           ${tx.json(proposal.exploit_status as never)}, ${unknowns}, ${row.evidence_ids})`;
    }

    if (proposal.impact_rows.length === 0 && proposal.unknowns.length > 0) {
      await tx`
        INSERT INTO impact_human_reviews (public_id, story_id, run_id, reason, payload)
        VALUES (${randomUUID()}, ${story.id}, ${task.run_id},
                ${"impact run produced only unknowns"}, ${tx.json({ unknowns: proposal.unknowns } as never)})`;
      humanReviewRows += 1;
    }

    const entityGroups = [
      { role: "vendor", ids: [...vendorEntities] },
      { role: "affected_product", ids: [...productEntities] },
    ] as const;
    for (const { role, ids } of entityGroups) {
      if (ids.length === 0) continue;
      await tx`
        INSERT INTO story_entities (story_id, entity_id, role)
        SELECT ${story.id}::bigint, id, ${role}::text FROM unnest(${ids}::bigint[]) AS id
        ON CONFLICT DO NOTHING`;
    }

    return { impactVersion, persistedClaimRows, unknownOnlyRows, humanReviewRows, idempotent: false };
  });
}

export async function listCurrentImpacts(storyId: number): Promise<Array<{
  product: string;
  vendor: string;
  models: string[];
  affectedRange: Record<string, unknown> | null;
  fixedRange: Record<string, unknown> | null;
  mitigations: string[];
  confidence: string;
  routing: string;
  exploitStatus: Record<string, unknown>;
  unknowns: string[];
  impactVersion: number;
}>> {
  const rows = await sql<{
    vendor: string;
    product: string;
    models: string[];
    affected_range: Record<string, unknown> | null;
    fixed_range: Record<string, unknown> | null;
    mitigations: string[];
    confidence: string;
    routing: string;
    exploit_status: Record<string, unknown>;
    unknowns: string[];
    impact_version: number;
  }[]>`
    SELECT sv.canonical_name AS vendor, sp.canonical_name AS product, i.models, i.affected_range, i.fixed_range,
           i.mitigations, i.confidence, i.routing, i.exploit_status, i.unknowns, i.impact_version
    FROM product_impacts i
    JOIN security_entities sv ON sv.id = i.vendor_entity_id
    JOIN security_entities sp ON sp.id = i.product_entity_id
    WHERE i.story_id = ${storyId} AND i.status = 'current'
    ORDER BY sp.canonical_name`;
  return rows.map((row) => ({
    vendor: row.vendor,
    product: row.product,
    models: row.models,
    affectedRange: row.affected_range,
    fixedRange: row.fixed_range,
    mitigations: row.mitigations,
    confidence: row.confidence,
    routing: row.routing,
    exploitStatus: row.exploit_status,
    unknowns: row.unknowns,
    impactVersion: row.impact_version,
  }));
}
