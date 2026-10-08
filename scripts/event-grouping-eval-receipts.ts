import { sql } from "@aihot/backend/db";

export interface ReceiptUsageSummary {
  receipts: number;
  attempts: number;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  failures: number;
}

/** Aggregate every attempt once, including failed/retried attempts, for distinct logical receipts. */
export async function receiptUsage(receiptIds: number[]): Promise<ReceiptUsageSummary> {
  const ids = [...new Set(receiptIds)];
  if (!ids.length) return { receipts: 0, attempts: 0, tokensIn: 0, tokensOut: 0, latencyMs: 0, failures: 0 };
  const [row] = await sql<{ attempts: number; tokens_in: number; tokens_out: number; latency_ms: number; failures: number }[]>`
    SELECT count(*)::int AS attempts,
      coalesce(sum(coalesce((usage->>'prompt_tokens')::int, (usage->>'input_tokens')::int, 0)), 0)::int AS tokens_in,
      coalesce(sum(coalesce((usage->>'completion_tokens')::int, (usage->>'output_tokens')::int, 0)), 0)::int AS tokens_out,
      coalesce(sum(latency_ms), 0)::int AS latency_ms,
      count(*) FILTER (WHERE status IN ('failed', 'unknown'))::int AS failures
    FROM receipt_attempts WHERE receipt_id = ANY(${ids})`;
  return { receipts: ids.length, attempts: Number(row?.attempts ?? 0), tokensIn: Number(row?.tokens_in ?? 0),
    tokensOut: Number(row?.tokens_out ?? 0), latencyMs: Number(row?.latency_ms ?? 0), failures: Number(row?.failures ?? 0) };
}
