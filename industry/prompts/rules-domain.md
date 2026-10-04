【安防与安全领域翻译规则 — 本平台内容是安防与安全行业的公开信息，严格遵守】

1. 歧义默认值：以下词在中文有非安全行业歧义，**一律按安防与安全含义翻译**：
   - Security = 安全（网络安全／信息安全语境；不译"证券""保障"）
   - Vulnerability = 漏洞（不译"脆弱性"以外的发挥，固定用"漏洞"）
   - Exploit / Exploitation = 漏洞利用（不译"开发""开采"）
   - PoC = PoC（保留英文缩写，可写"概念验证（PoC）"一次）
   - Patch = 补丁（不译"补丁程序""修补"以外的说法，固定用"补丁"）
   - Firmware = 固件
   - Advisory = 安全公告（厂商的 PSIRT 通告一律译"安全公告"）
   - Mitigation / Workaround = 缓解措施／临时规避方案（两者不可混用）
   - Access control = 访问控制（不译"出入口管理"）
   - Surveillance = 视频监控（不译"监视""监控器"）
   - NVR / DVR = 保留英文缩写（可写"网络硬盘录像机（NVR）"一次）
   - Incident = 安全事件（不译"事故"）
   - Ransomware = 勒索软件（不译"勒索病毒"）
   - Zero-day = 零日漏洞（不译"第零天"）
   - Threat actor = 攻击者（不译"威胁行为者"以外的发挥，固定用"攻击者"）
   - C2 / C&C = 保留英文（可写"命令与控制（C2）"一次）
   - Command injection / SQL injection = 命令注入／SQL 注入（保留注入类型英文缩写）
   - Privilege escalation = 权限提升
   - Authentication bypass = 身份认证绕过
   - Disclosure = 披露（不译"公开""泄漏"）
   - Regulation = 法规；Standard = 标准；Compliance = 合规（不译"符合性""合规性检查"以外的说法）
   - Tender / Bid = 招标／投标；Award = 中标（不译"授予""奖励"）
   - Critical / High / Medium / Low（CVSS 等级）= 严重／高危／中危／低危，**仅当原文给出了 CVSS 分数或等级时才能使用对应中文等级**，不得自行添加"高危"等定性

2. 以下专有名词**一律保留英文原文**，不翻译不加中文括注：
   - 厂商：Cisco / Fortinet / Microsoft / Citrix / Ivanti / Palo Alto Networks / VMware / Broadcom / Axis / Hanwha / Bosch / Hikvision / Dahua / Uniview
     **规则**：厂商名一律保留英文；中国厂商按第 3 条用中文品牌名
   - 机构：CISA / CERT-EU / NCSC / JPCERT/CC / NIST / CERT/CC / MITRE
   - 产品线与产品（举例 + 通用规则）：FortiOS / FortiGate / FortiManager / FortiProxy / IOS XE / ASA / FTD / NetScaler ADC / NetScaler Gateway / PAN-OS / GlobalProtect / vSphere / ESXi / vCenter / Windows Server / Exchange Server / SharePoint
     **规则**：产品名、产品线名一律保留英文，不得意译
   - 固件与版本号（举例 + 通用规则）：V5.7.3 / V5.7.3 build 230801 / 17.9.4a / 8.2.1 等
     **规则**：版本号一字不改，包括大小写、字母后缀、build 号；绝不"翻译性扩写"（不要把 "V5.7.3" 译成"第 5.7.3 版"，不要把 "build 230801" 删掉）
   - 漏洞与技术缩写：CVE / CWE / CNVD / CNNVD / CVSS / PoC / RCE / LPE / XSS / CSRF / SSRF / SQLi / DoS / MitM / APT / C2 / TTP / IOC / EDR / SIEM / SOC / WAF / IDS / IPS / DLP / VPN / MFA
     **规则**：任何全大写缩写默认保留英文，除第 1 条明确要求翻译的以外
   - 标准与合规框架：ISO/IEC 27001 / ISO/IEC 27002 / NIST SP 800-53 / NIST CSF / PCI DSS / GDPR / GB/T 28181 / GB 35114 / GB/T 22239（等保 2.0）/ GB/T 35273
     **规则**：标准编号与名称一字不改，保留原文的字母、数字与斜杠
   - 通用技术：API / SDK / CLI / HTTP / HTTPS / TLS / SSH / RDP / SMB / SNMP / RTSP / ONVIF / SAML / OAuth / JWT

3. 中国厂商与机构**优先用官方中文品牌名**（首次出现可双标"海康威视（Hikvision）"，后续选一种保持一致）：
   - 海康威视（Hikvision）/ 大华股份（Dahua）/ 宇视科技（Uniview）/ 天地伟业 / 华为 / 新华三（H3C）/ 深信服 / 奇安信 / 启明星辰 / 绿盟科技 / 天融信 / 安恒信息 / 亚信安全
   - 机构：公安部 / 国家互联网应急中心（CNCERT）/ 国家信息安全漏洞共享平台（CNVD）/ 全国信息安全标准化技术委员会（TC260）

4. 代码 / 命令 / URL / 数字单位 **一字不改**保留：
   - 反引号代码 `code` 不翻译
   - 命令与参数如 `curl -X POST`、`show version`、`apt-get install` 不译
   - URL、域名、文件路径原样
   - 漏洞编号：CVE-2026-12345 原样，不得补零、不得改写年份
   - 数字+单位：CVSS 9.8 / V5.7.3 / 512 MB / 1200 万元 / 3.2 万美元 / 99.9% uptime 原样保留
   - 金额、CVSS 分数、版本号、受影响型号数量必须保留原文的阿拉伯数字和单位；不要把 "9.8" 改写成"接近满分"，不要把 "1.2 亿元" 改写成"逾亿元"，不要把 "$3.2M" 改写成"三百多万美元"
