import { SITE } from "@aihot/industry/site";
import { Link } from "react-router";
import type { Route } from "./+types/agent-runs";
import { adminGet } from "../../lib/admin.server";
import { duration, num } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, FilterChips, Stat, Time } from "../../features/admin/ui";

interface AgentRun {
  id: number;
  publicId: string;
  storyId: number;
  storyTitle: string;
  agentType: string;
  graphVersion: string;
  objective: string;
  status: "running" | "completed" | "failed";
  model: string | null;
  provider: string | null;
  promptVersion: string | null;
  errorCode: string | null;
  errorDetail: string | null;
  startedAt: string;
  completedAt: string | null;
  traceId: string;
  receiptIds: number[];
}
interface Data { page: number; rows: AgentRun[] }

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Data>(request, `/api/admin/agent-runs${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `Agent 运行 · ${SITE.name} 后台` }];

const AGENT_LABEL: Record<string, string> = {
  "security-research": "安全研究",
  "event-tracking": "事件追踪",
  "product-impact": "产品影响",
  other: "其他",
};
const STATUS_TONE = { running: "accent", completed: "ok", failed: "bad" } as const;

export default function AgentRunsAdmin({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;
  const failed = rows.filter((r) => r.status === "failed").length;
  const running = rows.filter((r) => r.status === "running").length;
  return (
    <AdminPage title="Agent 运行" subtitle="三个 Agent 共用的运行记录：阶段由 graph version 区分，回执只显示计数，trace 仅供关联。">
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="运行中" value={num(running)} tone={running ? "warn" : "ok"} />
        <Stat label="失败" value={num(failed)} tone={failed ? "bad" : "ok"} />
        <Stat label="本页运行" value={num(rows.length)} hint="按开始时间倒序，最多 100 条" />
      </div>

      <Card title="筛选" className="mb-5">
        <FilterChips
          param="status"
          options={[
            { value: "", label: "全部" },
            { value: "running", label: "运行中" },
            { value: "completed", label: "已完成" },
            { value: "failed", label: "失败" },
          ]}
        />
      </Card>

      <Card title="运行记录" pad={false}>
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          empty="还没有 Agent 运行记录"
          columns={[
            { key: "agent", label: "阶段", render: (r) => <Badge tone="muted">{AGENT_LABEL[r.agentType] ?? r.agentType}</Badge> },
            {
              key: "story",
              label: "事件",
              render: (r) => (
                <Link to={`/admin/content?q=${encodeURIComponent(r.storyTitle)}`} className="text-ink-2 hover:text-accent" title={r.objective}>
                  <span className="line-clamp-2">#{r.storyId} {r.storyTitle}</span>
                </Link>
              ),
            },
            { key: "status", label: "状态", render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status === "running" ? "运行中" : r.status === "completed" ? "已完成" : "失败"}</Badge> },
            { key: "started", label: "开始", render: (r) => <Time at={r.startedAt} /> },
            { key: "took", label: "耗时", align: "right", render: (r) => duration(r.startedAt, r.completedAt) },
            {
              key: "model",
              label: "模型 / 提示词",
              render: (r) => (
                <span className="font-mono text-[11.5px] text-ink-3">
                  {r.provider ?? "—"} / {r.model ?? "—"} / {r.promptVersion ?? "—"}
                </span>
              ),
            },
            {
              key: "receipts",
              label: "回执",
              align: "right",
              render: (r) => <span title={r.receiptIds.map((id) => `#${id}`).join(", ")}>{r.receiptIds.length}</span>,
            },
            {
              key: "trace",
              label: "trace",
              render: (r) => <span className="font-mono text-[11px] text-ink-4" title={r.traceId}>{r.traceId.slice(0, 8)}</span>,
            },
            {
              key: "error",
              label: "失败原因",
              render: (r) =>
                r.errorCode ? (
                  <span className="line-clamp-2 text-[12px] text-hot" title={r.errorDetail ?? undefined}>
                    {r.errorCode}
                    {r.errorDetail ? `：${r.errorDetail}` : ""}
                  </span>
                ) : (
                  <span className="text-ink-4">—</span>
                ),
            },
          ]}
        />
      </Card>
      <p className="mt-3 text-[12px] text-ink-4">悬停事件标题可查看该次运行的目标（objective）；本页不展示 prompt 原文与 token 用量明细。</p>
    </AdminPage>
  );
}
