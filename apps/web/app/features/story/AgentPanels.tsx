// Phase 7 Story sections: Security Research, Tracking Status, Timeline Changes, Product Impact,
// Evidence, Unknowns. Every section renders only when it has data — a story without agent data (or
// missing one section) degrades quietly instead of erroring. Unknowns stay verbatim and are never
// reworded into "unaffected" / "safe" conclusions; human-review payloads never appear here.
import type {
  StoryAgentEvidenceView,
  StoryAgentIntelligence,
  StoryProductImpactRowView,
  StoryResearchView,
  StoryTimelineChangeView,
  StoryTrackingView,
  StoryUnknownView,
} from "@aihot/contracts/site";
import { Badge } from "../../components/ui/Badge";
import { beijingTime, relativeTime } from "../../lib/format";
import { Panel } from "./Panel";

const RESEARCH_STATUS: Record<StoryResearchView["status"], { label: string; tone: "ok" | "amber" | "hot" | "neutral" }> = {
  completed: { label: "研究完成", tone: "ok" },
  insufficient_evidence: { label: "证据不足", tone: "amber" },
  failed: { label: "研究未完成", tone: "amber" },
  running: { label: "研究进行中", tone: "neutral" },
};

const TRACKING_STATUS: Record<StoryTrackingView["status"], { label: string; tone: "ok" | "amber" | "neutral" }> = {
  active: { label: "追踪中", tone: "ok" },
  paused: { label: "已暂停", tone: "amber" },
  stopped: { label: "已结束", tone: "neutral" },
};

const CHANGE_TYPE: Record<StoryTimelineChangeView["changeType"], string> = {
  vendor_confirmation: "厂商确认",
  patch: "补丁发布",
  procurement_award: "招标结果",
  material_update: "重要更新",
};

const AUTHORITY: Record<StoryAgentEvidenceView["authorityLevel"], { label: string; tone: "ok" | "accent" | "neutral" }> = {
  authoritative: { label: "官方权威", tone: "ok" },
  primary: { label: "一手来源", tone: "accent" },
  secondary: { label: "二手来源", tone: "neutral" },
};

const CONFIDENCE: Record<StoryProductImpactRowView["confidence"], string> = { high: "高", medium: "中", low: "低" };

/** Anchor links from a claim/change/row to the evidence it cites, by public evidence id. */
function EvidenceLinks({ ids }: { ids: string[] }) {
  if (ids.length === 0) return <span className="text-ink-4">无引用证据</span>;
  return (
    <span className="flex flex-wrap gap-x-2">
      {ids.map((id, index) => (
        <a key={id} href={`#evidence-${id}`} className="text-note transition-colors hover:text-accent">
          证据{index + 1}
        </a>
      ))}
    </span>
  );
}

function ResearchPanel({ research }: { research: StoryResearchView }) {
  const status = RESEARCH_STATUS[research.status];
  return (
    <Panel title="安全研究" sub="对公开信源之外的权威证据做的补充研究。" right={<Badge tone={status.tone}>{status.label}</Badge>}>
      {research.summary && <p className="whitespace-pre-line text-[14px] leading-[1.8] text-ink-2">{research.summary}</p>}
      {research.claims.length > 0 && (
        <ul className="mt-3 space-y-3">
          {research.claims.map((claim) => (
            <li key={claim.claimId} className="border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                <Badge tone={claim.criticality === "critical" ? "hot" : "neutral"}>{claim.criticality === "critical" ? "关键" : "一般"}</Badge>
                <Badge tone={claim.status === "confirmed" ? "ok" : "amber"}>{claim.status === "confirmed" ? "已确认" : "存在冲突"}</Badge>
              </div>
              <p className="mt-1 text-[14px] leading-[1.7] text-ink-2">{claim.text}</p>
              <div className="mt-1 text-[12px] text-ink-4">
                <EvidenceLinks ids={claim.evidenceIds} />
              </div>
            </li>
          ))}
        </ul>
      )}
      {research.conflictCount > 0 && <p className="mt-3 text-[12.5px] leading-relaxed text-amber-ink">有 {research.conflictCount} 组证据相互矛盾，相关结论已标注“存在冲突”。</p>}
      {research.status === "failed" && <p className="mt-2 text-[12.5px] text-ink-4">这次研究没有完成，暂时没有可展示的结论。</p>}
      {research.status === "insufficient_evidence" && research.claims.length === 0 && (
        <p className="mt-2 text-[12.5px] text-ink-4">公开证据不足，没有形成可引用的结论；未解出的问题见“未知项”。</p>
      )}
    </Panel>
  );
}

function TrackingPanel({ tracking }: { tracking: StoryTrackingView }) {
  const status = TRACKING_STATUS[tracking.status];
  const open = tracking.questions.filter((q) => q.status === "open");
  return (
    <Panel title="追踪状态" sub="这个事件还在被持续跟踪，等待下面的问题有答案。" right={<Badge tone={status.tone}>{status.label}</Badge>}>
      <p className="text-[14px] leading-[1.8] text-ink-2">{tracking.whyTrack}</p>
      {tracking.questions.length > 0 && (
        <ul className="mt-3 space-y-2">
          {tracking.questions.map((q) => (
            <li key={q.questionId} className="flex items-start gap-2 text-[13.5px] leading-[1.7] text-ink-2">
              <Badge tone={q.status === "open" ? "amber" : "ok"}>{q.status === "open" ? "待确认" : "已解决"}</Badge>
              <span className="min-w-0 flex-1">{q.question}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[12px] text-ink-4">
        {open.length > 0 ? `${open.length} 个问题还没有答案` : "所有问题都已有答案"}
        {tracking.lastCheckedAt && ` · 最近检查 ${relativeTime(tracking.lastCheckedAt)}`}
      </p>
    </Panel>
  );
}

function ChangesPanel({ changes }: { changes: StoryTimelineChangeView[] }) {
  return (
    <Panel title="时间线变更" sub="持续跟踪中发现的重要进展。">
      <ol className="space-y-3">
        {changes.map((change) => (
          <li key={change.id} className="border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-4">
              <Badge tone="accent">{CHANGE_TYPE[change.changeType]}</Badge>
              <time dateTime={change.createdAt} className="num">
                {beijingTime(change.createdAt)}
              </time>
            </div>
            <p className="mt-1 text-[14px] leading-[1.7] text-ink-2">{change.summary}</p>
            <div className="mt-1 text-[12px] text-ink-4">
              <EvidenceLinks ids={change.evidenceIds} />
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function RangeLine({ label, range }: { label: string; range: { raw: string; supported: boolean } | null }) {
  if (!range) return <span className="text-ink-4">{label}：未给出</span>;
  return (
    <span>
      {label}：<span className="mono text-ink-2">{range.raw}</span>
      {!range.supported && <span className="ml-1 text-[11.5px] text-amber-ink">（版本写法无法机读，待人工复核）</span>}
    </span>
  );
}

function ImpactRowCard({ row }: { row: StoryProductImpactRowView }) {
  const unknownOnly = row.persistedKind === "unknown_only";
  return (
    <li className="border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <span className="text-[14px] font-[650] text-ink">{`${row.vendor} · ${row.product}`}</span>
        {row.models.length > 0 && <span className="text-ink-4">型号 {row.models.join("、")}</span>}
        <Badge tone={unknownOnly ? "amber" : "ok"}>{unknownOnly ? "未知记录" : "影响结论"}</Badge>
        <Badge tone="neutral">置信度 {CONFIDENCE[row.confidence]}</Badge>
        {row.reviewRequired && <Badge tone="amber">待人工复核</Badge>}
      </div>
      <div className="mt-1.5 space-y-0.5 text-[13px] leading-[1.7] text-ink-3">
        <div>
          <RangeLine label="受影响版本" range={row.affectedRange} />
        </div>
        <div>
          <RangeLine label="修复版本" range={row.fixedRange} />
        </div>
        <div>
          {`在野利用：${row.exploitStatus.knownExploited === "yes" ? "是" : row.exploitStatus.knownExploited === "no" ? "否" : "未知"}`}
          <span className="text-ink-4">（PoC：未知）</span>
        </div>
        {row.cveId && <div className="mono text-ink-4">{row.cveId}</div>}
        {row.mitigations.length > 0 && <div>缓解措施：{row.mitigations.join("；")}</div>}
      </div>
      {row.unknowns.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-[13px] leading-[1.7] text-ink-3">
          {row.unknowns.map((unknown) => (
            <li key={unknown}>未知：{unknown}</li>
          ))}
        </ul>
      )}
      <div className="mt-1 text-[12px] text-ink-4">
        <EvidenceLinks ids={row.evidenceIds} />
      </div>
    </li>
  );
}

function ImpactPanel({ view }: { view: StoryAgentIntelligence["productImpact"] }) {
  const claims = view.rows.filter((row) => row.persistedKind === "claims");
  const unknownsOnly = view.rows.filter((row) => row.persistedKind === "unknown_only");
  return (
    <Panel
      title="产品影响"
      sub="基于公开证据的产品与版本影响研判；没有证据的问题保持未知，不会推断成“不受影响”。"
      right={view.reviewRequiredCount > 0 ? `${view.reviewRequiredCount} 条结论待人工复核` : undefined}
    >
      {claims.length > 0 && (
        <ul className="space-y-3">
          {claims.map((row) => (
            <ImpactRowCard key={row.id} row={row} />
          ))}
        </ul>
      )}
      {unknownsOnly.length > 0 && (
        <>
          {claims.length > 0 && <div className="mt-3 text-[12.5px] font-semibold text-ink">未能形成结论的产品</div>}
          <ul className="mt-1.5 space-y-3">
            {unknownsOnly.map((row) => (
              <ImpactRowCard key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
      {view.rows.length === 0 && view.reviewRequiredCount > 0 && (
        <p className="text-[13.5px] leading-[1.8] text-ink-3">{`有 ${view.reviewRequiredCount} 条产品影响结论正在人工复核，确认后再展示。`}</p>
      )}
      {view.rows.length === 0 && view.reviewRequiredCount === 0 && <p className="text-[13.5px] text-ink-4">这个事件还没有可展示的产品影响结论。</p>}
    </Panel>
  );
}

function EvidencePanel({ evidence }: { evidence: StoryAgentEvidenceView[] }) {
  return (
    <Panel title="证据" sub="研究引用的外部权威来源，链接指向原始官方页面。" right={`${evidence.length} 条`}>
      <ul className="space-y-3">
        {evidence.map((item) => {
          const authority = AUTHORITY[item.authorityLevel];
          const at = item.publishedAt ?? item.retrievedAt;
          return (
            <li key={item.id} id={`evidence-${item.id}`} className="scroll-mt-[96px] border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-ink-4">
                <Badge tone={authority.tone}>{authority.label}</Badge>
                <span className="min-w-0 truncate">{item.sourceName}</span>
                <time dateTime={at} className="num">
                  {beijingTime(at)}
                </time>
              </div>
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="group mt-1 block text-[14px] font-[650] leading-[1.6] text-ink transition-colors hover:text-accent">
                {item.title}
              </a>
              {item.excerpt && <p className="mt-0.5 line-clamp-2 text-[13px] leading-[1.7] text-ink-3">{item.excerpt}</p>}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function UnknownsPanel({ unknowns }: { unknowns: StoryUnknownView[] }) {
  return (
    <Panel title="未知项" sub="还没有答案的问题。未知不代表安全，也不代表不受影响。" right={`${unknowns.length} 项`}>
      <ul className="space-y-2.5">
        {unknowns.map((unknown, index) => (
          <li key={`${unknown.source}-${index}`} className="border-t border-line-soft pt-2.5 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
              <Badge tone="neutral">{unknown.source === "research" ? "研究" : "产品影响"}</Badge>
            </div>
            <p className="mt-1 text-[14px] leading-[1.7] text-ink-2">{unknown.text}</p>
            {unknown.reason && <p className="mt-0.5 text-[12.5px] leading-[1.6] text-ink-4">原因：{unknown.reason}</p>}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/**
 * The six Phase 7 sections. Each renders only when its data exists, so a story with no agent data
 * shows nothing and a partially covered story degrades section by section.
 */
export function AgentPanels({ agent }: { agent: StoryAgentIntelligence }) {
  if (!agent.present) return null;
  const showResearch = agent.research !== null;
  const showTracking = agent.tracking !== null;
  const showChanges = agent.timelineChanges.length > 0;
  const showImpact = agent.productImpact.rows.length > 0 || agent.productImpact.reviewRequiredCount > 0;
  const showEvidence = agent.evidence.length > 0;
  const showUnknowns = agent.unknowns.length > 0;
  if (!showResearch && !showTracking && !showChanges && !showImpact && !showEvidence && !showUnknowns) return null;
  return (
    <>
      {showResearch && <ResearchPanel research={agent.research!} />}
      {showTracking && <TrackingPanel tracking={agent.tracking!} />}
      {showChanges && <ChangesPanel changes={agent.timelineChanges} />}
      {showImpact && <ImpactPanel view={agent.productImpact} />}
      {showEvidence && <EvidencePanel evidence={agent.evidence} />}
      {showUnknowns && <UnknownsPanel unknowns={agent.unknowns} />}
    </>
  );
}
