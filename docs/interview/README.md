# SentinelIntel 面试学习包

主入口：[`SentinelIntel-Interview-Guide.html`](SentinelIntel-Interview-Guide.html)

这是一份可离线打开的自包含 HTML。样式和全部架构图、流程图、状态图均内嵌在文件中，不依赖外部字体、脚本或图片。文档中的“已验证”“运行快照”“静态判断”“限制”采用不同标记，避免把设计目标、一次运行结果和可复现实验混为一谈。

## 二次核验口径

- 架构事实：以 `docs/architecture.md`、迁移、生产代码和测试为准。
- 评测数字：以 `docs/evaluation/evidence-registry.md` 为唯一数字入口。
- 运行数字：以 `docs/evaluation/spark-x2.6-soak-hardening.md` 为准，并标注观察时间和范围。
- 归属事实：以 `docs/00-sentinelintel/UPSTREAM.md` 和 `f6c2952..HEAD` 的 Git 差异为准。
- 不把 `MODEL_REVIEWED` 写成人工 gold，不把 `REPRODUCIBLE_PARTIAL` 写成完全离线可复现。

验证命令：

```bash
node --test tests/interview-guide.test.ts
```

