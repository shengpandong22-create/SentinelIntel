import { SITE } from "@aihot/industry/site";
import type { Route } from "./+types/impact-review";
import { adminGet } from "../../lib/admin.server";
import { num } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, Empty, Stat } from "../../features/admin/ui";

interface EvidenceRef { id: string; title: string; url: string }
interface Row {
  publicId: string;
  storyId: number;
  storyTitle: string;
  vendor: string;
  product: string;
  confidence: "high" | "medium" | "low";
  routing: "auto" | "human_review" | "unknown";
  persistedKind: "claims" | "unknown_only";
  affectedRange: { raw: string; supported: boolean } | null;
  fixedRange: { raw: string; supported: boolean } | null;
  unknowns: string[];
  evidence: EvidenceRef[];
  createdAt: string;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<{ rows: Row[] }>(request, "/api/admin/product-impact-review");
}

export const meta: Route.MetaFunction = () => [{ title: `产品影响复核 · ${SITE.name} 后台` }];

const CONFIDENCE_TONE = { high: "ok", medium: "warn", low: "bad" } as const;
const CONFIDENCE_LABEL = { high: "高", medium: "中", low: "低" } as const;

/** Why a current row is not a clean auto-claim. */
function reasons(row: Row): string[] {
  const out: string[] = [];
  if (row.routing === "human_review") out.push("路由到人工复核");
  if (row.confidence !== "high") out.push(`置信度${CONFIDENCE_LABEL[row.confidence]}`);
  if (row.affectedRange && !row.affectedRange.supported) out.push("受影响版本无法机读");
  if (row.fixedRange && !row.fixedRange.supported) out.push("修复版本无法机读");
  if (row.persistedKind === "unknown_only") out.push("仅未知，无结论");
  return out;
}

function RangeCell({ range, label }: { range: { raw: string; supported: boolean } | null; label: string }) {
  if (!range) return <span className="text-ink-4">{label}：未给出</span>;
  return (
    <span className="mono text-[11.5px]">
      {label}：{range.raw}
      {!range.supported && <span className="ml-1 text-amber">（不支持）</span>}
    </span>
  );
}

export default function ImpactReviewAdmin({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;
  const unsupported = rows.filter((r) => reasons(r).some((x) => x.includes("无法机读"))).length;
  return (
    <AdminPage title="产品影响复核" subtitle="尚未形成干净自动结论的当前产品影响行：置信度不足、版本无法机读或路由到人工复核。只读视图。">
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="待复核行" value={num(rows.length)} tone={rows.length ? "warn" : "ok"} />
        <Stat label="版本无法机读" value={num(unsupported)} tone={unsupported ? "warn" : "ok"} />
        <Stat label="高置信自动结论" value="不在本页" hint="已自动采信的行不会出现在这里" />
      </div>

      <Card title="复核列表" pad={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.publicId}
          empty="没有需要复核的产品影响行"
          columns={[
            {
              key: "product",
              label: "产品",
              render: (r) => (
                <span>
                  <span className="font-[650] text-ink">{r.product}</span>
                  <span className="ml-1 text-ink-4">{r.vendor}</span>
                </span>
              ),
            },
            { key: "story", label: "事件", render: (r) => <span className="line-clamp-2">#{r.storyId} {r.storyTitle}</span> },
            {
              key: "why",
              label: "原因",
              render: (r) => (
                <span className="flex flex-wrap gap-1">
                  {reasons(r).map((reason) => (
                    <Badge key={reason} tone="warn">
                      {reason}
                    </Badge>
                  ))}
                </span>
              ),
            },
            { key: "confidence", label: "置信度", render: (r) => <Badge tone={CONFIDENCE_TONE[r.confidence]}>{CONFIDENCE_LABEL[r.confidence]}</Badge> },
            {
              key: "range",
              label: "版本",
              render: (r) => (
                <div className="space-y-0.5">
                  <RangeCell range={r.affectedRange} label="受影响" />
                  <RangeCell range={r.fixedRange} label="修复" />
                </div>
              ),
            },
            {
              key: "unknowns",
              label: "未知",
              render: (r) => (r.unknowns.length ? <span className="line-clamp-2 text-[12px] text-ink-3">{r.unknowns.join("；")}</span> : <Empty>—</Empty>),
            },
            {
              key: "evidence",
              label: "证据",
              render: (r) =>
                r.evidence.length ? (
                  <ul className="space-y-0.5">
                    {r.evidence.map((e) => (
                      <li key={e.id}>
                        <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-note hover:text-accent">
                          {e.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>无引用证据</Empty>
                ),
            },
            { key: "created", label: "写入时间", render: (r) => <span className="num text-ink-4">{r.createdAt.slice(0, 16).replace("T", " ")}</span> },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
