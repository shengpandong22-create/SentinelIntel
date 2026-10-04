// 站点身份和读者看得到的文案。换成你的行业时，先改这个文件。
// 网页和后端都读它；改完重新构建（docker compose up --build）即可生效。
// 域名不在这里：部署时用环境变量 SITE_URL 设置。

export const SITE = {
  /** 站名：导航、页面标题、分享图、RSS、MCP、后台都用它。 */
  name: "SentinelIntel",
  /**
   * 行业词：拼进默认说法里，比如“安防日报”“安防动态”。
   */
  subject: "安防",
  /** 首页的完整标题（浏览器标签、搜索结果）。 */
  homeTitle: "SentinelIntel — 安防与安全行业事件情报 · 每日精选与日报",
  /** 一句话介绍：搜索引擎、分享卡片、RSS、llms.txt 会用。 */
  description: "盯住公开的漏洞披露、厂商安全公告、政策标准与招投标信源，用模型预筛、评分、结构化，把同一事件的多方报道归到一起，每天早上出一份安防行业日报。",
  /** 首页左上角和侧边栏下面的一行小字。 */
  tagline: "安防与安全行业的事件情报",
  /** 界面语言（HTML lang、og:locale）。 */
  locale: "zh-CN",
  /** 默认域名，只在没设置 SITE_URL 时使用。 */
  defaultUrl: "http://localhost:3000",
  /**
   * MCP 工具名的前缀（小写字母、数字、下划线），工具会叫 sentinelintel_get_latest、sentinelintel_search……
   * 已经有人接入后就不要再改。
   */
  mcpPrefix: "sentinelintel",
  /** 对外联系邮箱（选填）：使用规则、llms.txt、响应头里会写。 */
  contactEmail: null as string | null,
  /** 页脚的一行小字（选填）。上游归属，保留不改。 */
  footerNote: "由 AIHOT 开源框架驱动",
  /** 中国大陆网站的 ICP 备案号（选填），填了就显示在页脚并链接到工信部备案系统。 */
  icp: null as string | null,
  /** 结构化数据里的网站运营者（搜索引擎用）。 */
  organization: {
    name: "SentinelIntel",
    /** 创始人（选填）：{ name, url, description }。 */
    founder: null as null | { name: string; url?: string; description?: string },
  },
  /** 抓取信源时报上的名字（User-Agent 里用），不要冒用别的站。 */
  crawlerName: "SentinelIntelBot",
} as const;

/** 关于页的文案。数字（信源数、收录数、精选数、日报期数）来自站内实时统计，不用写在这里。 */
export const ABOUT = {
  kicker: `关于 ${SITE.name}`,
  /** 大标题：第一行正常颜色，第二行强调色。 */
  headline: ["漏洞、公告、政策与招投标，", "值得跟踪的，只有几条。"] as [string, string],
  /** 标题下面的一段话。{sources} 会换成实时的信源数。 */
  lead: `${SITE.name} 替你盯着 {sources} 个公开信源：漏洞机构、厂商安全公告、政府与标准组织，抓取、归并、评分、精选，每天早上 8 点出一份日报。免费，不用注册。`,
  /** 信源河动画下面的四个环节。 */
  steps: {
    collect: "官方漏洞机构、厂商 PSIRT 与政府／标准组织的公开订阅源都在看；活跃的源最短每小时看一次。",
    store: "抓到的都存下来，同一件事的报道归到一起；热度按事件算，重复抓取和多篇转发不会多算。",
    select: "模型先看是不是安防行业的事、有没有可核对的实质信息（漏洞编号、受影响产品与固件版本、金额、发布状态），再写中文标题、摘要和推荐理由；营销稿和泛安全科普进不来。",
    publish: "每天 08:00 出日报，周一出周报，每月 1 日出月报；最精选的几条可以推到飞书群。",
  },
  /**
   * 作者块（选填），null 就不显示。
   * avatarSourceId：一个 X 账号信源的 id，头像取它的（选填）。
   * 二维码在后台“设置”里上传，或者放进 industry/brand/contact/；没有二维码就不显示那张卡片。
   */
  maker: null as null | {
    name: string;
    greeting: string[];
    avatarSourceId?: string | null;
    wechat?: { title: string; note: string };
    feishu?: { title: string; note: string };
  },
  /** 页面底部的版权与下架说明（结尾会接“反馈页”的链接）。 */
  copyright: `${SITE.name} 是聚合摘要和阅读索引，原文版权归各来源所有。如果你是来源方，希望更正、下架或调整展示方式，可以通过`,
} as const;

/** “AI 日报”这类说法：行业词和名词之间，英文词加空格，中文词不加。 */
export function withSubject(noun: string): string {
  return /[A-Za-z0-9]$/.test(SITE.subject) ? `${SITE.subject} ${noun}` : `${SITE.subject}${noun}`;
}
