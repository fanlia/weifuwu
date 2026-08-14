# weifuwu/components 组件计划（2026-12）

> ## ✅ 已归档（2026-12）
> **结论：117 组件覆盖充足——无新增需求。** 消费侧迁移验证暴露的是
> **协议差异**而非组件缺口（诚实裁剪登记）：
> - M1 ✅ Dashboard 自绘 SVG → Chart（免费 tooltip 交互）——已实施
> - M2 ✂️ Chat 工具卡片 → ToolCallCard：**协议差异**——ToolCallCard 面向
>   wf:tool_call 流式协议，agent-platform 是消息表持久化 tools（msg.tools
>   数组）——强行迁移需适配层 + 交互回归风险——保持现状（现有渲染已含
>   status 图标/展开）
> - M3 ✂️ 新手引导 → Tour：**形态差异**——Tour 是浮层逐步引导，现为静态
>   横幅（用户旅程实测体验 OK）——不强改交互
> - M4 ✂️ 无新增需求——EmptyState 已支持自定义 icon VNode（插画资产
>   设计成本高，不立项）
>
> **框架组件规划决策**：新组件立项标准 = 消费侧迁移失败（真实缺口）或
> 第二个消费方出现——当前均未触发。

> 现状：117 组件。agent-platform 消费 24 个。
> 原则：**复用优先**（消费侧手搓 → 迁移到现有组件——验证组件可用性）+
> **缺口驱动新增**（迁移中暴露的真实缺口才立项新组件）。

## M1 复用迁移：Dashboard 图表

- 现状：Dashboard 趋势图**自绘 SVG 折线**（注释曾写"框架无 Chart——诚实裁剪"——
  **已过时**：Chart 组件后来已实现 line/bar/pie + tooltip + area）
- 迁移：SVG 自绘 → `<Chart type="line" area data={...} />`——**免费获得 tooltip
  + 悬停交互**（视觉 P3 建议项自动满足）
- 验收：趋势图渲染一致 + tooltip 可用

## M2 复用迁移：Chat 消息区

- 现状：agent-platform Chat 手搓工具卡片/消息气泡
- 迁移：工具卡片 → `ToolCallCard`（流式状态 status 支持）、消息气泡 →
  `MessageBubble`（direction/status/usage 语义）
- 验收：聊天渲染一致 + 流式/错误态正常；暴露组件缺口（若 props 不满足 → 补框架）

## M3 复用迁移：新手引导

- 现状：Dashboard 手搓 3 步引导横幅
- 迁移：→ `Tour`（steps + 定位 + 完成回调）
- 验收：引导流程等价；注册用户旅程回归

## M4 缺口驱动新增（迁移暴露后立项）

| 候选 | 触发条件 | 说明 |
|---|---|---|
| EmptyState 插画变体 | M1-M3 无新增需求时 | 视觉 P3：icon 已支持 VNode——插画变体锦上添花 |
| 成本/配额展示 | 迁移中发现 StatCard+ProgressBar 组合别扭时 | 老板视角：配额条 + 金额组合 |
| 模板市场组件 | Templates 页面在第二个消费方出现时 | 业务组件——框架级待验证 |

## 裁剪声明

- **不做**：为新增而新增（117 组件已覆盖广）；业务组件（模板市场等）过早框架化
- **验收标准**：迁移后消费侧视觉/交互等价 + 组件测试（style-audit 不破）
