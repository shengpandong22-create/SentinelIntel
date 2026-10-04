// 这个行业的分类体系：类别、标签词表、主体（厂商与机构）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签和主体归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。
//
// SentinelIntel 是安防与安全行业的事件情报站，不是泛 IT 新闻站，也不是通用 cybersecurity 聚合器。
// Phase 1 的四个核心类别是 vulnerability、vendor、policy-standard、procurement。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉模型怎么归类。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节），
 * 所以 industry 这个“综合”类别保留在最后一位，作为兜底分节。
 *
 * 关于三个非业务类别（industry / tip / opinion）为什么保留，见下一条注释。
 */
export const CATEGORIES = [
  { key: "vulnerability", label: "漏洞", section: "漏洞披露与修复", guide: "CVE 或厂商漏洞编号的正式披露与后续更新：受影响产品与型号、固件与软件版本范围、补丁与修复版本、PoC 与在野利用状态" },
  { key: "vendor", label: "厂商", section: "厂商安全公告", guide: "厂商 PSIRT 与官方安全公告：公告发布与修订、厂商对漏洞的确认、受影响型号与固件版本、固件与软件更新、召回与停产、厂商对安全事件的官方回应" },
  { key: "policy-standard", label: "政策标准", section: "政策与标准", guide: "官方发布的法规、政策与监管要求，国家标准与行业标准的立项、征求意见、正式发布、修订与实施日期" },
  { key: "procurement", label: "招投标", section: "招标与采购", guide: "安防相关项目的招标公告、中标结果与采购公告：金额、采购范围与数量、项目主体、更正与终止公告" },
  { key: "tip", label: "实践", section: "防护与建议", guide: "防护加固、配置基线、检测规则与运维经验；只有观点、没有具体新事实的经验稿和教程应判低分" },
  { key: "opinion", label: "研判", section: "分析与观点", guide: "对漏洞、厂商、事件或政策的分析、评论与访谈；没有新事实的观点稿应判低分" },
  // industry 作为兜底类别保留在最后：packages/backend/src/reports/compose.ts 的 DEFAULT_SECTION
  // 取 SECTION_OF.industry，删掉它会退回“最后一节”，把无法归类的资料放进“分析与观点”。
  { key: "industry", label: "综合", section: "其他安全动态", guide: "无法归入以上类别的安防与安全行业信息" },
] as const;

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 * 注意：这一组值经 analyze.ts 的 z.enum(ITEM_TYPES) 校验且没有 catch，提示词里的取值必须与本数组完全一致。
 */
export const ITEM_TYPES = [
  "vulnerability_disclosure",
  "vendor_advisory",
  "vendor_response",
  "policy_standard",
  "procurement_notice",
  "procurement_award",
  "incident_report",
  "practical_guidance",
  "analysis_opinion",
] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。最后一个同时是缺标签时的兜底值。 */
export const CATEGORY_TAGS = [
  "漏洞披露", "厂商公告", "厂商确认", "政策/法规", "标准规范", "招标/采购", "中标结果", "安全事件", "防护/实践", "研判/观点",
  "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "漏洞利用", "补丁/修复", "固件更新", "视频监控", "门禁与对讲", "入侵报警", "访问控制", "安防平台", "网络与边界安全", "数据安全",
  "供应链安全", "物联网安全", "AI 安全", "云安全", "合规审计", "国产化替代",
] as const;

/** 可选的实体标签（厂商与机构）。只有 ENTITIES 里 displayTag 非空的名字才会出现在这里。 */
export const ENTITY_TAGS = [
  "Cisco", "Fortinet", "Microsoft", "Citrix", "Ivanti", "Palo Alto", "VMware", "海康威视", "大华", "宇视", "Axis", "Bosch",
  "Hanwha", "CISA",
] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  // 漏洞
  漏洞: "漏洞披露", 安全漏洞: "漏洞披露", 漏洞公告: "漏洞披露", 漏洞披露: "漏洞披露", cve: "漏洞披露", vulnerability: "漏洞披露",
  vulnerabilities: "漏洞披露", 零日: "漏洞披露", "0day": "漏洞披露",
  // 厂商公告与确认
  安全公告: "厂商公告", advisory: "厂商公告", advisories: "厂商公告", psirt: "厂商公告", 厂商安全公告: "厂商公告", 厂商公告: "厂商公告",
  厂商确认: "厂商确认", 厂商回应: "厂商确认", 官方回应: "厂商确认", vendor: "厂商公告", 厂商: "厂商公告",
  // 政策与标准
  政策: "政策/法规", 法规: "政策/法规", 监管: "政策/法规", regulation: "政策/法规", policy: "政策/法规", 政策标准: "政策/法规",
  标准: "标准规范", 国家标准: "标准规范", 行业标准: "标准规范", standard: "标准规范", standards: "标准规范", 规范: "标准规范",
  // 招投标
  招标: "招标/采购", 采购: "招标/采购", 招投标: "招标/采购", procurement: "招标/采购", 招标公告: "招标/采购", tender: "招标/采购",
  中标: "中标结果", 中标公告: "中标结果", award: "中标结果",
  // 事件
  incident: "安全事件", 网络攻击: "安全事件", 数据泄露: "安全事件", 勒索软件: "安全事件", 安全事件: "安全事件",
  // 实践与观点
  教程: "防护/实践", 指南: "防护/实践", 最佳实践: "防护/实践", 加固: "防护/实践", tutorial: "防护/实践", guidance: "防护/实践",
  防护建议: "防护/实践", 实践: "防护/实践",
  观点: "研判/观点", 评论: "研判/观点", 分析: "研判/观点", opinion: "研判/观点", analysis: "研判/观点", 大佬观点: "研判/观点",
  // 兜底
  other: "其他", misc: "其他", 其他: "其他",
};

/** 模型漏了分类标签时，按内容类型补一个。 */
export const CATEGORY_BY_ITEM_TYPE: Readonly<Record<string, string>> = {
  vulnerability_disclosure: "漏洞披露", vendor_advisory: "厂商公告", vendor_response: "厂商确认", policy_standard: "政策/法规",
  procurement_notice: "招标/采购", procurement_award: "中标结果", incident_report: "安全事件", practical_guidance: "防护/实践",
  analysis_opinion: "研判/观点",
};

// ── 厂商与机构 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * 只收录 Phase 1 真实信源与真实数据会遇到的主体：网络安全厂商（出现在 CISA／CERT-EU／ZDI 等公告里）、
 * 安防设备厂商（安防行业的核心主体），以及作为信源本身的政府与 CERT 机构。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[] }> = {
  cisco: { name: "Cisco", displayTag: "Cisco", aliases: ["Cisco", "思科", "Talos"] },
  fortinet: { name: "Fortinet", displayTag: "Fortinet", aliases: ["Fortinet", "FortiGate", "FortiOS", "FortiGuard", "飞塔"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Windows", "MSRC", "Azure"] },
  citrix: { name: "Citrix", displayTag: "Citrix", aliases: ["Citrix", "NetScaler", "Citrix ADC"] },
  ivanti: { name: "Ivanti", displayTag: "Ivanti", aliases: ["Ivanti"] },
  "palo-alto": { name: "Palo Alto Networks", displayTag: "Palo Alto", aliases: ["Palo Alto", "PAN-OS", "GlobalProtect"] },
  vmware: { name: "Broadcom / VMware", displayTag: "VMware", aliases: ["VMware", "Broadcom", "vSphere", "ESXi", "vCenter"] },
  hikvision: { name: "海康威视 Hikvision", displayTag: "海康威视", aliases: ["Hikvision", "海康威视", "海康"] },
  dahua: { name: "大华股份 Dahua", displayTag: "大华", aliases: ["Dahua", "大华", "大华股份"] },
  uniview: { name: "宇视科技 Uniview", displayTag: "宇视", aliases: ["Uniview", "宇视", "宇视科技"] },
  axis: { name: "Axis Communications", displayTag: "Axis", aliases: ["Axis", "安讯士"] },
  bosch: { name: "Bosch Security", displayTag: "Bosch", aliases: ["Bosch", "博世"] },
  hanwha: { name: "Hanwha Vision", displayTag: "Hanwha", aliases: ["Hanwha", "韩华", "Wisenet"] },
  cisa: { name: "CISA", displayTag: "CISA", aliases: ["CISA", "Cybersecurity and Infrastructure Security Agency"] },
  "cert-eu": { name: "CERT-EU", displayTag: null, aliases: ["CERT-EU", "Computer Emergency Response Team for the EU"] },
  "ncsc-uk": { name: "UK NCSC", displayTag: null, aliases: ["NCSC", "National Cyber Security Centre"] },
  jpcert: { name: "JPCERT/CC", displayTag: null, aliases: ["JPCERT", "JPCERT/CC"] },
};

/**
 * 身份词典：摘要和标题里出现的厂商，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 只收录真正容易被模型写错的主体；行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "cisco", name: "Cisco", patterns: [/\bcisco\b|思科/i, /\btalos\b/i] },
  { id: "fortinet", name: "Fortinet", patterns: [/fortinet|\bfortigate\b|\bfortios\b|\bfortiguard\b|\bfortiproxy\b|\bfortimanager\b/i] },
  { id: "microsoft", name: "Microsoft", patterns: [/microsoft|微软|\bwindows\b|\bazure\b|\bexchange\s+server\b|\bsharepoint\b/i] },
  { id: "citrix", name: "Citrix", patterns: [/\bcitrix\b|\bnetscaler\b/i] },
  { id: "ivanti", name: "Ivanti", patterns: [/\bivanti\b|\bpulse\s?secure\b|\bconnect\s?secure\b/i] },
  { id: "palo-alto", name: "Palo Alto Networks", patterns: [/\bpalo\s?alto\b|\bpan-os\b|\bglobalprotect\b/i] },
  { id: "vmware", name: "Broadcom / VMware", patterns: [/\bvmware\b|\bvsphere\b|\besxi\b|\bvcenter\b/i, /\bbroadcom\b/i] },
  { id: "hikvision", name: "海康威视 Hikvision", patterns: [/\bhikvision\b|海康威视|海康/i] },
  { id: "dahua", name: "大华股份 Dahua", patterns: [/\bdahua\b|大华/i] },
  { id: "uniview", name: "宇视科技 Uniview", patterns: [/\buniview\b|宇视/i] },
  // Axis 是常见英文词，用大小写敏感的模式，避免把正文里无关的 “axis” 当成厂商。
  { id: "axis", name: "Axis Communications", patterns: [/\bAxis\b/, /安讯士/i] },
  { id: "bosch", name: "Bosch Security", patterns: [/\bbosch\b|博世/i] },
  { id: "hanwha", name: "Hanwha Vision", patterns: [/\bhanwha\b|韩华|\bwisenet\b/i] },
  { id: "cisa", name: "CISA", patterns: [/\bCISA\b/, /cybersecurity and infrastructure security agency/i] },
  { id: "cert-eu", name: "CERT-EU", patterns: [/\bcert-eu\b/i] },
  { id: "ncsc-uk", name: "UK NCSC", patterns: [/\bncsc\b/i] },
  { id: "jpcert", name: "JPCERT/CC", patterns: [/\bjpcert\b/i] },
];

/** 这些域名上的文章，发布方就是对应的公司或机构（聚合平台不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "cisco", domains: ["cisco.com", "sec.cloudapps.cisco.com", "blogs.cisco.com"] },
  { entityId: "fortinet", domains: ["fortinet.com", "fortiguard.com", "fortinet.com/blog"] },
  { entityId: "microsoft", domains: ["microsoft.com", "msrc.microsoft.com", "learn.microsoft.com"] },
  { entityId: "citrix", domains: ["citrix.com", "support.citrix.com"] },
  { entityId: "ivanti", domains: ["ivanti.com", "forums.ivanti.com"] },
  { entityId: "palo-alto", domains: ["paloaltonetworks.com", "security.paloaltonetworks.com"] },
  { entityId: "vmware", domains: ["vmware.com", "broadcom.com", "support.broadcom.com", "kb.vmware.com"] },
  { entityId: "hikvision", domains: ["hikvision.com"] },
  { entityId: "dahua", domains: ["dahuasecurity.com"] },
  { entityId: "uniview", domains: ["uniview.com", "en.uniview.com"] },
  { entityId: "axis", domains: ["axis.com"] },
  { entityId: "bosch", domains: ["boschsecurity.com", "bosch.com"] },
  { entityId: "hanwha", domains: ["hanwhavision.com", "hanwha.com"] },
  { entityId: "cisa", domains: ["cisa.gov"] },
  { entityId: "cert-eu", domains: ["cert.europa.eu"] },
  { entityId: "ncsc-uk", domains: ["ncsc.gov.uk"] },
  { entityId: "jpcert", domains: ["jpcert.or.jp"] },
];

/** 原文里的这些写法也算提到了对应主体（除厂牌名之外的常见署名与产品线写法）。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "microsoft", pattern: /\bMSRC\b/ },
  { entityId: "cisco", pattern: /\bCisco\s+Talos\b/i },
  { entityId: "fortinet", pattern: /\bFortiGuard\s+Labs\b/i },
];
