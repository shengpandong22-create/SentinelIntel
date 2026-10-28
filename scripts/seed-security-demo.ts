// Offline, reversible interview-demo content. This script never calls collectors or models and
// deliberately keeps every public title marked as demo data.
import { createHash } from "node:crypto";
import { upsertMaterial } from "../packages/backend/src/content/materials.ts";
import { sql, closeDb } from "../packages/backend/src/db.ts";
import { publishArticleTx } from "../packages/backend/src/publication/publish.ts";
import { computeHotRanking } from "../packages/backend/src/events/hot.ts";

const SOURCE_ID = "demo-security-evidence";
const PREFIX = "demo_sec_";

interface DemoStory {
  cve: string;
  vendor: string;
  product: string;
  models: string[];
  category: "vulnerability" | "vendor";
  title: string;
  summary: string;
  affected: string;
  fixed: string | null;
  vendorUrl: string;
  needsReview?: boolean;
}

const STORIES: DemoStory[] = [
  { cve: "CVE-2024-20359", vendor: "Cisco", product: "Secure Firewall ASA / FTD", models: ["ASA 5500-X"], category: "vendor", title: "Cisco 修复 ASA 与 FTD 持久化命令执行漏洞", summary: "官方公告披露 CVE-2024-20359，受影响设备应按厂商公告升级并检查异常配置。", affected: "厂商分支版本，需按公告逐项核验", fixed: null, vendorUrl: "https://sec.cloudapps.cisco.com/security/center/content/CiscoSecurityAdvisory/cisco-sa-asaftd-persist-rce-FLsNXF4h", needsReview: true },
  { cve: "CVE-2024-23113", vendor: "Fortinet", product: "FortiOS", models: ["FortiGate"], category: "vendor", title: "Fortinet 发布 FortiOS CVE-2024-23113 修复公告", summary: "FortiOS 格式字符串漏洞可能导致远程代码执行；版本分支和修复版本以 PSIRT 公告为准。", affected: "7.0.0..7.0.13|7.2.0..7.2.6|7.4.0..7.4.2", fixed: ">=7.4.3", vendorUrl: "https://www.fortiguard.com/psirt/FG-IR-24-029" },
  { cve: "CVE-2021-36260", vendor: "Hikvision", product: "Hikvision IP Camera", models: ["DS-2CD2xxx"], category: "vulnerability", title: "海康威视摄像机命令注入漏洞安全提示", summary: "CVE-2021-36260 影响部分网络摄像机固件；应依据官方型号清单完成升级。", affected: "厂商型号与固件组合，需人工核验", fixed: null, vendorUrl: "https://www.hikvision.com/en/support/cybersecurity/security-advisory/security-notification-command-injection-vulnerability/", needsReview: true },
  { cve: "CVE-2017-7921", vendor: "Hikvision", product: "Hikvision Camera Firmware", models: ["DS-2CD2xx2F-I Series", "DS-2DF Series"], category: "vendor", title: "海康威视公布摄像机权限提升漏洞修复版本", summary: "官方安全通知列出受影响摄像机系列与对应已修复固件，适合按型号核对。", affected: ">=5.2.0,<=5.4.0", fixed: ">=5.4.41", vendorUrl: "https://www.hikvision.com/en/support/cybersecurity/security-advisory/security-notification--privilege-escalating-vulnerability-in-cer/" },
  { cve: "CVE-2024-21762", vendor: "Fortinet", product: "FortiOS / FortiProxy", models: [], category: "vulnerability", title: "FortiOS SSL-VPN 越界写漏洞进入已知利用目录", summary: "CVE-2024-21762 已被列入 CISA KEV；Fortinet 公告给出了各版本分支的升级目标。", affected: "6.0.0..6.0.17|6.2.0..6.2.15|6.4.0..6.4.14|7.0.0..7.0.13|7.2.0..7.2.6|7.4.0..7.4.2", fixed: ">=7.4.3", vendorUrl: "https://www.fortiguard.com/psirt/FG-IR-24-015" },
  { cve: "CVE-2024-35250", vendor: "Microsoft", product: "Windows Kernel-Mode Driver", models: ["Windows 10", "Windows Server 2022"], category: "vulnerability", title: "Windows 内核驱动提权漏洞需核对四段构建号", summary: "CVE-2024-35250 的产品构建号超出当前确定性版本语法，演示数据将其保守路由到人工复核。", affected: "10.0.19044.4529 之前（四段构建号）", fixed: null, vendorUrl: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2024-35250", needsReview: true },
  { cve: "CVE-2023-38180", vendor: "Microsoft", product: ".NET / Visual Studio", models: ["Visual Studio 2022"], category: "vendor", title: "Microsoft 更新 .NET 与 Visual Studio 拒绝服务漏洞公告", summary: "公告涵盖 .NET 与 Visual Studio 多个产品分支；未被公开证据支持的旧版本说法不进入结论。", affected: "17.2.0..17.2.18|17.4.0..17.4.10", fixed: null, vendorUrl: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2023-38180", needsReview: true },
  { cve: "CVE-2023-36563", vendor: "Microsoft", product: "Windows WordPad", models: ["Windows 10", "Windows Server"], category: "vulnerability", title: "WordPad 信息泄露漏洞产品范围待人工确认", summary: "CVE-2023-36563 涉及多个 Windows 构建号；系统保留未知项并要求人工确认，不从缺失证据推断安全。", affected: "多产品四段构建号，当前 matcher 不支持", fixed: null, vendorUrl: "https://msrc.microsoft.com/update-guide/vulnerability/CVE-2023-36563", needsReview: true },
];

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const now = new Date();
const ago = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

function safetyOff(name: string): boolean {
  return !["1", "true", "yes", "on"].includes((process.env[name] ?? "").trim().toLowerCase());
}

async function purge(): Promise<void> {
  await sql.begin(async (tx) => {
    const storyIds = await tx<{ id: number }[]>`SELECT id FROM stories WHERE frame->>'demo_pack' = 'security-v1'`;
    const ids = storyIds.map((row) => row.id);
    if (ids.length) {
      await tx`DELETE FROM impact_human_review_actions WHERE review_id IN (SELECT id FROM impact_human_reviews WHERE story_id = ANY(${ids}::bigint[]))`;
      await tx`DELETE FROM impact_human_reviews WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM product_impacts WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM story_entities WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM tracking_plans WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM external_evidence WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM agent_research_runs WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM story_signals WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM fact_articles WHERE fact_id IN (SELECT id FROM facts WHERE story_id = ANY(${ids}::bigint[]))`;
      await tx`DELETE FROM facts WHERE story_id = ANY(${ids}::bigint[])`;
      await tx`DELETE FROM stories WHERE id = ANY(${ids}::bigint[])`;
    }
    await tx`DELETE FROM reports WHERE content->>'demo_pack' = 'security-v1'`;
    await tx`DELETE FROM hot_rankings WHERE entries::text LIKE ${`%${PREFIX}%`}`;
    await tx`DELETE FROM articles WHERE id LIKE ${`${PREFIX}%`}`;
    await tx`DELETE FROM sources WHERE id = ${SOURCE_ID}`;
  });
}

async function seed(): Promise<void> {
  await purge();
  const articleIds: string[] = [];
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO sources (id, name, kind, config, tags, first_party, tier, participation_mode,
        interval_minutes, site_fulltext, syndicate_fulltext, enabled, health, last_fetch_at, last_ok_at, next_fetch_at)
      VALUES (${SOURCE_ID}, '演示数据 · 官方公开证据', 'external', ${tx.json({ demo_pack: "security-v1" } as never)},
        ${["演示数据"]}, false, 'T1', 'editorial', 1440, false, false, false, 'paused', ${now}, ${now}, null)`;

    for (let i = 0; i < STORIES.length; i++) {
      const spec = STORIES[i]!;
      const storyPublicId = uuid(0xd100 + i);
      const [story] = await tx<{ id: number }[]>`
        INSERT INTO stories (public_id, title, status, action, frame, first_report_at, latest_at, digest, digest_updated_at, latest, origin)
        VALUES (${storyPublicId}, ${`【演示】${spec.title}`}, ${i < 6 ? "active" : "watching"},
          '演示环境：请回到官方链接核验后再采取处置动作。',
          ${tx.json({ demo_pack: "security-v1", label: "DEMO DATA — 非实时情报" } as never)},
          ${ago(24 - i)}, ${ago(i + 1)}, ${`【演示数据】${spec.summary}`}, ${ago(i + 1)}, ${spec.summary}, 'replay')
        RETURNING id`;
      const [fact] = await tx<{ id: number }[]>`
        INSERT INTO facts (public_id, story_id, title, subject, action, object, occurred_at, manual)
        VALUES (${`demo:${spec.cve}`}, ${story!.id}, ${`【演示】${spec.cve} 官方公开证据链`}, ${spec.vendor}, '披露并建议修复', ${spec.product}, ${ago(24 - i)}, true)
        RETURNING id`;

      const variants = [
        { label: "厂商公告", url: spec.vendorUrl, source: spec.vendor, tag: "厂商公告", summary: spec.summary },
        { label: "NVD 记录", url: `https://nvd.nist.gov/vuln/detail/${spec.cve}`, source: "NVD", tag: "漏洞披露", summary: `${spec.cve} 的 NVD 权威漏洞记录与产品描述。` },
        { label: "CISA KEV", url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog", source: "CISA", tag: "漏洞利用", summary: `${spec.cve} 的 KEV 状态演示记录；实际状态以 CISA 目录为准。` },
      ];
      const evidenceIds: string[] = [];
      for (let j = 0; j < variants.length; j++) {
        const item = variants[j]!;
        const articleId = `${PREFIX}${String(i + 1).padStart(2, "0")}_${j + 1}`;
        articleIds.push(articleId);
        await upsertMaterial({
          id: articleId, sourceId: SOURCE_ID, identityKey: `demo:security-v1:${spec.cve}:${j}`,
          url: item.url, title: `【演示】${spec.cve} · ${item.label}`,
          excerpt: `【演示数据，非实时情报】${item.summary}`,
          bodyText: `【演示数据，非实时情报】\n${item.summary}\n来源：${item.source}\n原文：${item.url}`,
          bodyStatus: "ok", language: "zh", publishedAt: ago(24 - i + j / 10), discoveredAt: ago(24 - i + j / 10),
          raw: { demo_pack: "security-v1", source_name: item.source }, via: "import",
        }, tx);
        await tx`
          INSERT INTO analyses (article_id, input_revision, origin, relevance, category, tags, subjects,
            title_zh, summary_zh, reason_zh, score, selected, output)
          VALUES (${articleId}, 1, 'replay', 'pass', ${j === 0 ? spec.category : "vulnerability"},
            ${[item.tag, "演示数据", spec.vendor]}, ${[spec.vendor, spec.product, spec.cve]},
            ${`【演示】${spec.title}（${item.label}）`}, ${`【演示数据】${item.summary}`},
            '官方公开来源的可追溯演示条目；不代表实时研判。', ${92 - i - j}, ${j !== 2},
            ${tx.json({ demo_pack: "security-v1", no_model_call: true } as never)})`;
        await tx`INSERT INTO fact_articles (fact_id, article_id, role, evidence, manual)
                 VALUES (${fact!.id}, ${articleId}, ${j === 0 ? "primary" : "report"}, ${item.url}, true)`;
        await tx`INSERT INTO story_signals (story_id, article_id, participant_key, source_id, kind, observed_at)
                 VALUES (${story!.id}, ${articleId}, ${`${spec.cve}:${item.source}`}, ${SOURCE_ID}, 'editorial', ${ago(i + j + 1)})`;
        await publishArticleTx(tx, articleId, { releasedAt: ago(i + 1) });
        const evidenceId = uuid(0xe100 + i * 3 + j);
        evidenceIds.push(evidenceId);
      }

      const runId = uuid(0xf100 + i);
      const evidence = variants.map((item, j) => ({
        evidence_id: evidenceIds[j], source_type: j === 0 ? "vendor_advisory" : j === 1 ? "nvd" : "cisa_kev",
        source_name: item.source, canonical_url: item.url, title: `${spec.cve} · ${item.label}`,
        excerpt: item.summary, normalized: {}, content_hash: sha(`${spec.cve}:${j}:${item.summary}`),
        authority_level: "authoritative", published_at: null, source_updated_at: null,
        retrieved_at: ago(i + 1).toISOString(), provenance: { demo_pack: "security-v1", offline_fixture: true },
      }));
      const proposal = {
        claims: [{ claim_id: `demo:${spec.cve}`, text: spec.summary, criticality: "critical", status: "confirmed", confidence: 0.9, evidence_ids: evidenceIds }],
        unknowns: spec.needsReview ? [{ question: `${spec.product} 的精确版本范围仍需人工复核`, attempted_sources: variants.map((v) => v.url), reason: "演示包不替代实时厂商公告核验。" }] : [],
        evidence, conflicts: [], tool_trace: [], summary: `【演示数据】${spec.summary}`, terminal_status: "completed",
      };
      const [run] = await tx<{ id: number }[]>`
        INSERT INTO agent_research_runs (public_id, story_id, trace_id, capability_hash, capability_expires_at, deadline_at,
          objective, status, model, provider, prompt_version, graph_version, input_snapshot, output_proposal, tool_trace,
          receipt_ids, usage, limits, completed_at)
        VALUES (${runId}, ${story!.id}, ${uuid(0xf200 + i)}, ${sha(`demo-capability:${i}`)}, ${ago(-1)}, ${ago(-1)},
          ${`演示：核验 ${spec.cve} 的公开证据`}, 'completed', null, 'offline-demo', 'demo-v1', 'phase4-demo-v1',
          ${tx.json({ demo_pack: "security-v1", story_id: story!.id } as never)}, ${tx.json(proposal as never)}, ${tx.json([] as never)},
          ${[]}, ${tx.json({ model_calls: 0 } as never)}, ${tx.json({ offline: true } as never)}, ${ago(i + 1)})
        RETURNING id`;
      for (let j = 0; j < evidence.length; j++) {
        const e = evidence[j]!;
        await tx`
          INSERT INTO external_evidence (public_id, story_id, research_run_id, source_type, source_name, canonical_url,
            title, excerpt, normalized, content_hash, authority_level, retrieved_at, provenance)
          VALUES (${e.evidence_id}, ${story!.id}, ${run!.id}, ${e.source_type}, ${e.source_name}, ${e.canonical_url},
            ${e.title}, ${e.excerpt}, ${tx.json({} as never)}, ${e.content_hash}, 'authoritative', ${ago(i + 1)},
            ${tx.json({ demo_pack: "security-v1", offline_fixture: true } as never)})`;
      }

      const [vendor] = await tx<{ id: number }[]>`
        INSERT INTO security_entities (kind, canonical_name, aliases, provenance)
        VALUES ('vendor', ${spec.vendor}, ${[]}, ${tx.json({ demo_pack: "security-v1" } as never)})
        ON CONFLICT (kind, canonical_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name RETURNING id`;
      const [product] = await tx<{ id: number }[]>`
        INSERT INTO security_entities (kind, canonical_name, aliases, provenance)
        VALUES ('product_family', ${spec.product}, ${spec.models}, ${tx.json({ demo_pack: "security-v1" } as never)})
        ON CONFLICT (kind, canonical_name) DO UPDATE SET canonical_name = EXCLUDED.canonical_name RETURNING id`;
      await tx`INSERT INTO story_entities (story_id, entity_id, role, evidence_id)
               VALUES (${story!.id}, ${vendor!.id}, 'vendor', ${evidenceIds[0]}), (${story!.id}, ${product!.id}, 'affected_product', ${evidenceIds[0]})`;
      if (spec.needsReview) {
        await tx`INSERT INTO impact_human_reviews (public_id, story_id, run_id, reason, payload)
                 VALUES (${uuid(0xfa00 + i)}, ${story!.id}, ${runId},
                   '演示：版本表达式超出确定性 matcher 或需逐型号核验',
                   ${tx.json({ demo_pack: "security-v1", vendor: spec.vendor, product: spec.product, cve_id: spec.cve,
                     affected_range: { raw: spec.affected, supported: false }, evidence_ids: evidenceIds } as never)})`;
      } else {
        await tx`
          INSERT INTO product_impacts (public_id, story_id, impact_version, run_id, persisted_kind, vendor_entity_id,
            product_entity_id, cve_id, models, affected_range, fixed_range, mitigations, confidence, routing,
            exploit_status, unknowns, evidence_ids)
          VALUES (${uuid(0xfb00 + i)}, ${story!.id}, 1, ${runId}, 'claims', ${vendor!.id}, ${product!.id}, ${spec.cve},
            ${spec.models}, ${tx.json({ raw: spec.affected, supported: true } as never)},
            ${spec.fixed ? tx.json({ raw: spec.fixed, supported: true } as never) : null},
            ${["按厂商公告升级", "核验互联网暴露面"]}, 'high', 'auto',
            ${tx.json({ poc: "unknown", known_exploited: "yes" } as never)}, ${[]}, ${evidenceIds})`;
      }
    }

    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
    const [existingDemo] = await tx<{ key: string }[]>`
      SELECT key FROM reports WHERE kind = 'daily' AND content->>'demo_pack' = 'security-v1' ORDER BY key DESC LIMIT 1`;
    const occupied = new Set((await tx<{ key: string }[]>`SELECT key FROM reports WHERE kind = 'daily'`).map((row) => row.key));
    const key = existingDemo?.key ?? Array.from({ length: 30 }, (_, offset) => formatter.format(new Date(now.getTime() - offset * 86_400_000)))
      .find((candidate) => !occupied.has(candidate));
    if (!key) throw new Error("no free daily-report date in the last 30 days; demo data was not written");
    const sections = ["漏洞披露与修复", "厂商安全公告"].map((label, section) => ({
      label,
      items: STORIES.filter((s) => (section === 0 ? s.category === "vulnerability" : s.category === "vendor")).map((s, index) => {
        const global = STORIES.indexOf(s);
        return { itemId: `${PREFIX}${String(global + 1).padStart(2, "0")}_1`, title: `【演示】${s.title}`,
          summary: `【演示数据】${s.summary}`, sourceUrl: s.vendorUrl, sourceName: "演示数据 · 官方公开证据" };
      }),
    }));
    const content = { demo_pack: "security-v1", notice: "演示数据，非实时情报", lead: { title: "【演示】安防公开情报样例日报" }, sections, flashes: [] };
    await tx`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
             VALUES ('daily', ${key}, ${ago(24)}, ${now}, ${tx.json(content as never)}, ${now}, 'manual')
             ON CONFLICT (kind, key) DO UPDATE SET content = EXCLUDED.content, generated_at = EXCLUDED.generated_at, origin = 'manual', revision = reports.revision + 1`;
  });
  await computeHotRanking(now);
  console.log(JSON.stringify({ ok: true, demoPack: "security-v1", articles: articleIds.length, stories: STORIES.length,
    productImpacts: STORIES.filter((s) => !s.needsReview).length, openReviews: STORIES.filter((s) => s.needsReview).length }));
}

async function check(): Promise<void> {
  const [counts] = await sql<{
    articles: number; stories: number; evidence: number; impacts: number; reviews: number; reports: number;
  }[]>`
    SELECT
      (SELECT count(*)::int FROM articles WHERE id LIKE ${`${PREFIX}%`}) AS articles,
      (SELECT count(*)::int FROM stories WHERE frame->>'demo_pack' = 'security-v1') AS stories,
      (SELECT count(*)::int FROM external_evidence e JOIN stories s ON s.id = e.story_id
        WHERE s.frame->>'demo_pack' = 'security-v1') AS evidence,
      (SELECT count(*)::int FROM product_impacts i JOIN stories s ON s.id = i.story_id
        WHERE s.frame->>'demo_pack' = 'security-v1') AS impacts,
      (SELECT count(*)::int FROM impact_human_reviews r JOIN stories s ON s.id = r.story_id
        WHERE s.frame->>'demo_pack' = 'security-v1' AND r.status = 'open') AS reviews,
      (SELECT count(*)::int FROM reports WHERE content->>'demo_pack' = 'security-v1') AS reports`;
  const expected = { articles: 24, stories: 8, evidence: 24, impacts: 3, reviews: 5, reports: 1 };
  const ok = Object.entries(expected).every(([key, value]) => counts?.[key as keyof typeof expected] === value);
  console.log(JSON.stringify({ ok, demoPack: "security-v1", ...counts }));
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!safetyOff("COLLECT_ENABLED") || !safetyOff("MODEL_CALLS_ENABLED")) {
    throw new Error("demo seeding requires COLLECT_ENABLED=false and MODEL_CALLS_ENABLED=false");
  }
  if (command === "--purge") await purge();
  else if (command === "--apply") await seed();
  else if (command === "--check") await check();
  else throw new Error("usage: node --env-file-if-exists=.env scripts/seed-security-demo.ts --apply|--check|--purge");
}

try { await main(); } finally { await closeDb(); }
