import { SITE } from "@aihot/industry/site";
import type { Route } from "./+types/tracking-plans";
import { adminGet } from "../../lib/admin.server";
import { num } from "../../features/admin/format";
import { AdminPage, Badge, Card, DataTable, Empty, FilterChips, Stat, Time } from "../../features/admin/ui";

interface Plan {
  publicId: string;
  storyId: number;
  storyTitle: string;
  status: "active" | "paused" | "stopped";
  whyTrack: string;
  questionCount: number;
  openQuestions: number;
  nextCheckAt: string | null;
  lastCheckedAt: string | null;
  currentIntervalHours: number;
  planVersion: number;
  lastChangeType: string | null;
  lastChangeAt: string | null;
}

export async function loader({ request }: Route.LoaderArgs) {
  return adminGet<Plan[]>(request, `/api/admin/tracking-plans${new URL(request.url).search}`);
}

export const meta: Route.MetaFunction = () => [{ title: `追踪计划 · ${SITE.name} 后台` }];

const STATUS_TONE = { active: "ok", paused: "warn", stopped: "muted" } as const;
const STATUS_LABEL = { active: "进行中", paused: "已暂停", stopped: "已结束" } as const;
const CHANGE_LABEL: Record<string, string> = {
  vendor_confirmation: "厂商确认",
  patch: "补丁发布",
  procurement_award: "招标结果",
  material_update: "重要更新",
};

export default function TrackingPlansAdmin({ loaderData }: Route.ComponentProps) {
  const plans = loaderData;
  const active = plans.filter((p) => p.status === "active").length;
  const openQuestions = plans.reduce((sum, p) => sum + p.openQuestions, 0);
  return (
    <AdminPage title="追踪计划" subtitle="Phase 5 事件追踪的长期计划：状态、待解决问题与最近变更。只读视图。">
      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="进行中" value={num(active)} tone={active ? "ok" : undefined} />
        <Stat label="待解决问题" value={num(openQuestions)} tone={openQuestions ? "warn" : "ok"} />
        <Stat label="计划总数" value={num(plans.length)} />
      </div>

      <Card title="筛选" className="mb-5">
        <FilterChips
          param="status"
          options={[
            { value: "", label: "全部" },
            { value: "active", label: "进行中" },
            { value: "paused", label: "已暂停" },
            { value: "stopped", label: "已结束" },
          ]}
        />
      </Card>

      <Card title="计划" pad={false}>
        <DataTable
          rows={plans}
          rowKey={(p) => p.publicId}
          empty="还没有追踪计划"
          columns={[
            { key: "story", label: "事件", render: (p) => <span className="line-clamp-2" title={p.whyTrack}>#{p.storyId} {p.storyTitle}</span> },
            { key: "status", label: "状态", render: (p) => <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge> },
            {
              key: "questions",
              label: "问题",
              align: "right",
              render: (p) => (
                <span title={`共 ${p.questionCount} 个`} className={p.openQuestions > 0 ? "text-amber" : undefined}>
                  {`${p.openQuestions}/${p.questionCount}`}
                </span>
              ),
            },
            { key: "next", label: "下次检查", render: (p) => <Time at={p.nextCheckAt} /> },
            { key: "last", label: "最近检查", render: (p) => <Time at={p.lastCheckedAt} /> },
            { key: "interval", label: "间隔", align: "right", render: (p) => `${p.currentIntervalHours}h` },
            {
              key: "change",
              label: "最近变更",
              render: (p) =>
                p.lastChangeAt ? (
                  <span>
                    <Badge tone="accent">{CHANGE_LABEL[p.lastChangeType!] ?? p.lastChangeType}</Badge> <Time at={p.lastChangeAt} />
                  </span>
                ) : (
                  <Empty>暂无变更</Empty>
                ),
            },
            { key: "version", label: "版本", align: "right", render: (p) => <span className="num text-ink-4">v{p.planVersion}</span> },
          ]}
        />
      </Card>
    </AdminPage>
  );
}
