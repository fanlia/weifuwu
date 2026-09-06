# 组件优化第五批 —— 调试残留清理 + CSS 重复选择器合并 + C7/S8 哨兵

> 目标：第五批——探针 8 面——真面 2 个（console.log 残留 2 · 重复选择器 12 对/9 文件）+ 哨兵两条（C7-① console 线 · style-audit S8 重复选择器线）。

## 探针实证（/tmp/probe-n5-*.mjs）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| console 残留 | log **2**（Editor L415 `[runAi] original:...` 大 JSON 调试 · FilePreview L93 `[fp-dbg] fetching`）· warn 17（dev 提示——设计）· error 0 | ⚠️ **真面①** |
| TODO/FIXME/HACK | **0** | ✅ 判负（零债务标记——史诗级干净） |
| 全局监听泄漏 | Slider（注释提及——§5.5 纪律非代码）· Wave（`{ once: true }` + 600ms 兜底——无泄漏） | ✅ 判负（探针误报——once 语义已处理） |
| 深选择器 ≥3 | 8——清一色逗号分组误报（正则把逗号行当子选择器） | ✅ 判负（误报面） |
| try/catch | 10——异步面统一走数据管道（useAsyncData 错误集中） | ✅ 判负 |
| **重复选择器** | keyframes from/to 误报排除后 **12 对/9 文件**（CitationCard/Modal/Carousel/SessionList/SegmentedControl/Calendar/Select/Transfer/Kanban/FilePreview） | ⚠️ **真面②** |

**真面① 2 处**：Editor `[runAi]`（每 AI 操作打全量 JSON——**性能+日志面**）· FilePreview `[fp-dbg]`（**明确 debug 残留标记**）——纯删（git 历史可溯）。

**真面② 12 对**：同文件同选择器两次定义（顶层——非 @media 上下文）——**隐藏覆盖隐患**（第二次定义胜——无意的 = bug · 有意的 = 难读）——**逐对甄别**（内容相同 → 删一 · 不同 → 合并+注释成败原因）。

## 波次计划

### W0 —— 哨兵两条

1. **C7-① console 线**（audit:health）：组件 ts（非 test）`console.log` = 红——登记 2（W1 清 0）；console.warn（dev 提示设计——**豁免登记**（17 处——warn 基线只降不升）；console.error = 红（0 基线）
2. **style-audit S8 重复选择器线**：顶层同选择器双定义 = warn（基线 12——W2 清 0——**排除** @media 上下文 · keyframes · 逗号组）
3. 负控：加 console.log → 红 · 加重复选择器 → warn 超基线

**验收**：C7-① 2 登记 · S8 12 登记 · 负控红 · 既有线全绿

### W1 —— console 残留清理（2 → 0）

1. Editor `[runAi]` 删除（留空行/注释——原逻辑不动）
2. FilePreview `[fp-dbg]` 删除
3. 验收：C7-① 0 · tsc 0 · 契约 452

### W2 —— 重复选择器合并（12 → 0）

1. 逐对甄别（9 文件）：内容相同 → 删冗余 · 不同 → 合并（后者覆盖前者）——**覆盖语义注释**（成败原因）
2. 验收：S8 0 · showcase 328（视觉零变化——同体合并）· CSS 体积只降不升

### W3 —— 收尾

1. docs/client.md §5.6 红线 +2（console 调试残留 · 重复选择器）
2. AGENTS 快照（C7 · S8）
3. 全量回归门（client/showcase/场景/server/平台/audit）
4. 计划归档

## 判负记录

| 面 | 判负理由 | 推翻条件 |
| --- | --- | --- |
| console.warn 17 | dev 提示设计（开发期警告——生产静默模式已有） | 生产日志泄漏实证（warn 进生产 console） |
| 全局监听泄漏（Slider/Wave） | 注释提及（纪律说明非代码）+ once + 兜底 | addEventListener 真无清理实证 |
| 深选择器重构 | 逗号组误报——真实 2 层后代（嵌套组件正常形态） | 出现 >4 层真深选择器（性能实证） |
| try/catch 面扩 | 异步错误统一数据管道（useAsyncData）——组件层 10 处已覆盖关键面 | 组件直接 fetch/事件未捕获实证 |
