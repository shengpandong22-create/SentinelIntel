import { SITE } from "@aihot/industry/site";
import { useState } from "react";
import type { Route } from "./+types/human-reviews";
import { adminGet } from "../../lib/admin.server";
import { useAdminAction } from "../../features/admin/action";
import { AdminPage, Badge, Button, Card, DataTable, Empty, FilterChips, Json, ReasonDialog, Stat } from "../../features/admin/ui";

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
  resolvedBy: string | null;
  resolutionReason: string | null;
  version: number;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Review[]>(request, `/api/admin/human-reviews${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `人工复核 · ${SITE.name} 后台` }];

const STATUS_TONE = { open: "warn", resolved: "ok", dismissed: "muted" } as const;
const STATUS_LABEL = { open: "待复核", resolved: "已复核", dismissed: "已忽略" } as const;

function ReviewActions({ review }: { review: Review }) {
  const { run, pending } = useAdminAction();
  const [dialog, setDialog] = useState<"accept" | "dismiss" | null>(null);
  const canAccept = review.payload.confidence === "medium";
  const resolve = async (action: "accept" | "dismiss", reason: string) => {
    const ok = await run("POST", `/api/admin/human-reviews/${review.id}/resolve`,
      { action, reason, version: review.version },
      { label: `impact-review-${review.id}-${action}`, success: action === "accept" ? "已接受并发布产品影响结论" : "已忽略复核项" });
    if (ok !== null) setDialog(null);
    return ok !== null;
  };
  if (review.status !== "open") {
    return <span className="text-[12px] text-ink-4">{review.resolvedBy ?? "—"}</span>;
  }
  return (
    <div className="flex gap-1.5">
      {canAccept && <Button size="sm" onClick={() => setDialog("accept")}>接受</Button>}
      <Button size="sm" onClick={() => setDialog("dismiss")}>忽略</Button>
      <ReasonDialog
        open={dialog === "accept"}
        title="接受这条产品影响结论"
        description="服务端会重新校验原始 medium 提案、版本表达式及同一事件的 Evidence；页面不能改写 claim。接受后会追加一条人工复核结论。"
        confirmLabel="接受并发布"
        busy={pending === `impact-review-${review.id}-accept`}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => resolve("accept", reason)}
      />
      <ReasonDialog
        open={dialog === "dismiss"}
        title="忽略这条复核项"
        description="忽略不会产生产品影响结论，操作人、原因和时间会保留在追加式审计记录中。"
        danger
        confirmLabel="确认忽略"
        busy={pending === `impact-review-${review.id}-dismiss`}
        onClose={() => setDialog(null)}
        onSubmit={(reason) => resolve("dismiss", reason)}
      />
    </div>
  );
}

export default function HumanReviewsAdmin({ loaderData }: Route.ComponentProps) {
  const rows = loaderData;
  const open = rows.filter((r) => r.status === "open").length;
  return (
    <AdminPage
      title="人工复核"
      subtitle="复核产品影响 Agent 的 medium 结论和纯未知结果。接受只使用已冻结的原始提案；纯未知结果只能忽略，所有操作均保留审计记录。"
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
            { key: "actions", label: "操作", render: (r) => <ReviewActions review={r} /> },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
