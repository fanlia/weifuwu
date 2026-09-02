# OPTIMIZE-PLAN-4 — agent-platform 优化计划（走查前基线 + 交付面）

> 探针实证先于计划（AGENTS §4.1）。本计划只包含**已有证据**的优化点；
> 无证据的候选（复杂度拆分/功能补全）列为探针/判负，不预设工作。

## ✅ 执行实录（全部完成）

| 波次 | 结果 | 证据 |
|---|---|---|
| W0 基线复绿 | ✅ | API 41/41（单文件 ≤1.4s）+ UI 36/36（单文件 ≤7s；wave4-enhance 单跑 17s 全绿——15s 探针上限误报，非测试红）——上轮 .last-run failed 系同一误报 |
| W1 交付面压缩 | ✅ | build 加 --minify：817KB→**455KB raw / 135KB gzip**；/static/app.js gzip（node:zlib 零依赖 + Accept-Encoding 回退 + 一次性压缩缓存 + Cache-Control）——curl 实测 200 + enc=gzip + 页面 200 |
| W2 死代码 | ✅ | ui/v2-demo.tsx、ui/v2-demo-nav.tsx 删除（全仓零引用确认） |
| W3 复杂度探针 | ⚪ **判负** | 见下登记 |

**回归门**：W1/W2 后全量复跑——API 41/41 + UI 36/36 全绿 + tsc 零错。

## 判负登记（W3——4.4 纪律）

| 候选 | 判负原因 | 替代方案/翻案条件 |
|---|---|---|
| src/services/chat.ts（1090 行） | 单主题=消息编排流水线（handleNewMessage 813 行单一链条 + 3 个叶子 emitters）——无循环依赖——拆分会切断单一逻辑链，测试已全覆盖 | 新功能使该链条出现第二个主题时再拆 |
| ui/pages/Chat.tsx（1099 行） | 单组件 + 已抽 MessageItem/抽屉稳定回调——内部 section 即组织 | 渲染面出现独立可复用主题（≥2 处消费）再拆 |
