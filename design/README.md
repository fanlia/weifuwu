# weifuwu/design — 计划与设计文档索引

> 状态总表（2026-12 全量核对）：**33 项已完成** · 1 项过时 · 5 项文档/活文档。
> 每份文档头部 `> **状态（2026-12 确认）**` 行是单一事实源；已完成的计划保留为历史记录（不删除）。

## ✅ 已完成

| 文件 | 标题 |
|------|------|
| `ai-differentiation-plan.md` | 第九批：AI 差异化组件（109 → 113 组件） |
| `async-component-unify-plan.md` | 组件统一计划：asyncComponent → 原生 async 组件 |
| `async-mode-a-plan.md` | 模式 A：全 async 组件 + await 全部（骨架屏）实施计划 |
| `component-test-infra.md` | 组件测试基础设施重构计划（ui-dom/testing 原语） |
| `components-cdd.md` | weifuwu 组件驱动开发路线图（CDD） |
| `components-completeness.md` | weifuwu/components 呈现与功能完善计划（P12） |
| `components-demo-optimize.md` | apps/components-demo 优化计划 — 组件库质量走查（P9） |
| `components-execution.md` | weifuwu/components 全量实现执行计划（71 → 95 组件） |
| `components-gap-plan.md` | weifuwu/components 新增组件缺口计划（2026-12） |
| `components-migration.md` | weifuwu/components × antd / Element Plus / shadcn-ui 覆盖矩阵与迁移指南 |
| `components-optimize.md` | weifuwu/components 逐组件优化计划（P10） |
| `components-per-component-optimize.md` | weifuwu/components 逐组件优化计划（P13） |
| `components-roadmap.md` | weifuwu/components 新组件路线图 |
| `components-visual-optimize.md` | weifuwu/components 视觉样式优化计划（P11） |
| `db-clients-optimize.md` | weifuwu 自研 DB 客户端优化计划（ctx.sql / ctx.redis） |
| `db-clients-plan.md` | weifuwu 自研 DB 客户端计划（TDD） |
| `design-system-gaps.md` | weifuwu/layout + weifuwu/components 缺口走查（P5） |
| `design-system-optimize.md` | weifuwu/layout + weifuwu/components 优化计划 |
| `design-system-polish.md` | weifuwu/layout + weifuwu/components 视觉与交互精修计划（P8） |
| `layout-optimize.md` | weifuwu/layout 优化计划（P8） |
| `layouts-demo-optimize.md` | apps/layouts-demo 优化计划 — 布局蓝本质量提升 |
| `messager-plan.md` | messager — 消息系统中间件实施计划 |
| `mobile-support-plan.md` | 移动端友好支持计划 — weifuwu/ui-dom + weifuwu/layout → components 自适应提升 |
| `render-only-plan.md` | render-only 方案 — 取消 ctx.ui.$() / ctx.ui.dirty()（确定性渲染） |
| `scheduler-plan.md` | weifuwu/scheduler — 计划任务中间件 |
| `token-layout-optimize.md` | token + layout 优化计划（P7） |
| `ui-architecture.md` | 前端 UI 架构设计 — UIRouter + VDOM（req/res 定义）【定稿】 |
| `ui-dom-plan.md` | ui-dom 实施计划 — 独立 UIRouter + VDOM（定稿架构落地） |
| `vdom-consistency-plan.md` | vdom 一致性 & 可预测性优化计划（占位法·修订版） |
| `vdom-coverage-plan.md` | vdom 引擎测试计划：覆盖度 100% |
| `vdom-perf-plan.md` | vdom render 优化计划（v2） |
| `vdom-perf-v3-plan.md` | vdom 优化计划（v3） |
| `vdom-transform-rules.md` | vdom 转化规则表（可推导性 by construction） |

## ⚠️ 过时/被取代

| 文件 | 标题 | 说明 |
|------|------|------|
| `ui-dom-optimize-plan.md` | ui-dom 优化计划 | 基于 v1 `$` 赋值时代——v2 vdom + render-only 接管后问题已不存在（仅历史参考） |

## 📄 文档/活文档（非计划）

| 文件 | 类型 |
|------|------|
| `ai-contract.md` | Weifuwu AI Stream Protocol (v1) |
| `components-cuts.md` | weifuwu/components — 裁剪集中登记（单一事实源） |
| `design-variables.md` | 组件设计变量（可覆盖 token）— 2026-08 重构补充 |
| `style-guide.md` | weifuwu/style 使用指南（wf-* 命名规范 + 三档学习路径） |
| `style-system.md` | weifuwu/style — 样式系统总览 |
