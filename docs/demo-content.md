# 安防演示数据包

`scripts/seed-security-demo.ts` 为本地面试演示准备一套可重复、可清理的离线内容。它不会调用采集器、
模型或付费服务，也不会读取或修改冻结评测数据。

数据包包含 24 篇内容、8 条 Story、24 条外部 Evidence、产品影响结论、待人工复核项、热点榜和一份
演示日报（使用最近 30 天内未被正式日报占用的日期）。每个标题与摘要都带有“演示”标记，原文链接指向 NVD、CISA KEV 或厂商官方公告；这些记录仅
用于展示产品界面，不构成实时安全建议。

```powershell
$env:COLLECT_ENABLED="false"
$env:MODEL_CALLS_ENABLED="false"
node --env-file-if-exists=.env scripts/seed-security-demo.ts --apply
```

重复执行会先清理旧版 `security-v1` 数据再重建。只清理演示包：

```powershell
node --env-file-if-exists=.env scripts/seed-security-demo.ts --purge
```

核对数量（24 篇内容、8 条 Story、24 条 Evidence、3 条产品影响、5 条待复核、1 期日报）：

```powershell
node --env-file-if-exists=.env scripts/seed-security-demo.ts --check
```

脚本在任一付费安全阀开启时拒绝运行，也不会覆盖已有的非演示日报。
