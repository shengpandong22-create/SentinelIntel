import { SITE } from "@aihot/industry/site";
import type { Route } from "./+types/human-reviews";
import { adminGet } from "../../lib/admin.server";
import { AdminPage, Badge, Card, DataTable, Empty, FilterChips, Json, Stat } from "../../features/admin/ui";

interface Review {
  id: number;
  publicId: string;
  storyId: number;
  storyTitle: string;
  runId: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  payload: Record<string, unknown>;
  createdAt: string;
  resolvedAt: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Review[]>(request, `/api/admin/human-reviews${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `人工复核 · ${SITE.name} 后台` }];

const STATUS_TONE = { open: "warn", resolved: "ok", dismissed: "muted" } as const;
const STATUS_LABEL = { open: "待复核", resolved: "已复核", dismissed: "已忽略" } as const;

export default function HumanReviewsAdmin({ loaderData }: Route.ComponentProps) {
  const rows = loaderData;
  const open = rows.filter((r) => r.status === "open").length;
  return (
    <AdminPage
      title="人工复核"
      subtitle="产品影响 Agent 提交人工复核的结论与纯未知结果。本阶段为只读视图：处理（resolve/dismiss）留给后续带审计语义的工作流。"
    >
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="待复核" value={open} tone={open ? "warn" : "ok"} />
        <Stat label="本页条目" value={rows.length} hint="按提交时间倒序，最多 100 条" />
      </div>

      <Card title="筛选" className="mb-5">
        <FilterChips
          param="status"
          options={[
            { value: "", label: "全部" },
            { value: "open", label: "待复核" },
            { value: "resolved", label: "已复核" },
            { value: "dismissed", label: "已忽略" },
          ]}
        />
      </Card>

      <Card title="复核队列" pad={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="复核队列是空的"
          columns={[
            { key: "id", label: "#", render: (r) => <span className="num text-ink-4">{r.id}</span> },
            { key: "story", label: "事件", render: (r) => <span className="line-clamp-2">#{r.storyId} {r.storyTitle}</span> },
            { key: "status", label: "状态", render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
            { key: "reason", label: "原因", render: (r) => <span className="line-clamp-2 text-[12.5px]">{r.reason}</span> },
            {
              key: "payload",
              label: "提交内容",
              render: (r) => (
                <div className="max-w-[420px]">
                  <Json value={r.payload} collapsed label="查看 payload" />
                </div>
              ),
            },
            { key: "created", label: "提交时间", render: (r) => <span className="num text-ink-4">{r.createdAt.slice(0, 16).replace("T", " ")}</span> },
            { key: "resolved", label: "处理时间", render: (r) => (r.resolvedAt ? <span className="num text-ink-4">{r.resolvedAt.slice(0, 16).replace("T", " ")}</span> : <Empty>—</Empty>) },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
