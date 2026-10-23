import { SITE } from "@aihot/industry/site";
import type { Route } from "./+types/eval-results";
import { adminGet } from "../../lib/admin.server";
import { AdminPage, Badge, Card } from "../../features/admin/ui";

interface EvalRecord {
  phase: string;
  title: string;
  status: string;
  doc: string;
  recorded: string[];
  limitations: string[];
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<{ records: EvalRecord[]; note: string }>(request, "/api/admin/eval-results");
}

export const meta: Route.MetaFunction = () => [{ title: `评测结论 · ${SITE.name} 后台` }];

const STATUS_TONE = (status: string): "ok" | "warn" | "muted" =>
  status.startsWith("PASSED") ? "ok" : status.startsWith("ACCEPTED") ? "warn" : "muted";

export default function EvalResultsAdmin({ loaderData }: Route.ComponentProps) {
  const { records, note } = loaderData;
  return (
    <AdminPage title="评测结论" subtitle="仓库已提交、可复现的评测记录索引。本页面不运行评测，也不生成新指标。">
      <p className="mb-5 rounded-panel bg-surface px-4 py-3 text-[13px] leading-relaxed text-ink-3 ring-1 ring-line">{note}</p>
      <div className="grid gap-4 xl:grid-cols-2">
        {records.map((record) => (
          <Card
            key={record.phase}
            title={
              <span className="flex items-center gap-2">
                <Badge tone="muted">{record.phase}</Badge>
                {record.title}
              </span>
            }
            right={<Badge tone={STATUS_TONE(record.status)}>{record.status}</Badge>}
          >
            <ul className="space-y-1.5 text-[13px] leading-[1.7] text-ink-2">
              {record.recorded.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-ink-4">·</span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
            {record.limitations.length > 0 && (
              <>
                <div className="mt-3 text-[12px] font-semibold text-ink-3">限制</div>
                <ul className="mt-1 space-y-1 text-[12.5px] leading-[1.6] text-ink-4">
                  {record.limitations.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-ink-4">·</span>
                      <span className="min-w-0">{item}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="mt-3 border-t border-line-soft pt-3 font-mono text-[12px] text-ink-4">{record.doc}</div>
          </Card>
        ))}
      </div>
    </AdminPage>
  );
}
