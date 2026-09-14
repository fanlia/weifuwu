# UI 测试基建 + AgentDetail 拆分专项（2026-12）

> ## ✅ M1-M2-M2b 全部完成（2026-12）
> M1：UI 测试基建（makeAppCtx/mountPage 真实中间件链路 + 4 基线测试）+
> dev loader 增强（扩展名补全 + bare→src 别名单模块图）+ dist mountCommand 导出修复。
> M2：Skills/Preview/Logs/Versions 4 区拆分（968→804 行）。
> M2b：Files/Knowledge 2 区拆分（804→495 行）+ 分块配置独立保存按钮。
> **登记**：Webhook 字段与主表单保存耦合（不拆——交互不变）；Config 主表单
> 保持（核心表单，拆分收益低）。基线测试 + 后端 92 + 浏览器实测全绿。

> 前端工程师审视登记的两项技术债（互为前提）：
> 1. UI 层无 DOM 测试（92 测试全后端，页面靠浏览器实测）
> 2. AgentDetail 968 行 god component（8 区耦合）——**拆分需测试保护网先行**

## 里程碑

| 阶段 | 内容 | 验收 |
|---|---|---|
| **M1** | UI 测试基建：`test/ui/helpers.ts`（makeAppCtx = createTestCtx + api 路由表 mock + auth/route/ws/toast）+ 主页面基线测试（Login/Settings/AgentDetail 8 区渲染） | 基线测试绿 |
| **M2** | AgentDetail 拆分为 8 区组件（`ui/components/agent/*Section.tsx`——各区自有状态，AgentDetail 变装配层） | 拆分后基线测试仍绿 + tsc 绿 |
| **M3** | 全量回归 + 浏览器抽测 + 计划归档 | 92+UI 测试全绿 |

## 拆分设计（M2）

```
AgentDetail（装配层：header + Tab 锚点导航 + 区组装）
├── ConfigSection   基本设置（名称/描述/提示/模型/温度/配额/HITL/工具开关）
├── SkillsSection   技能管理（绑定/解绑/选择器）
├── FilesSection    工作空间文件（列目录/编辑/保存）
├── KnowledgeSection 知识库文档（上传/批量/检索/删除）
├── PreviewSection  测试对话
├── LogsSection     执行日志
├── WebhookSection  Webhook 配置（仅 webhook 类型）
└── VersionsSection 版本管理（保存/回滚）
```

- 每区 = 两阶段组件（自有 $ 状态 + props: agentId/agent + onAgentChange 回调）
- 跨区通信：props 回调（配置保存 → header 名称更新）；回滚 → reload（现状保持）
- 状态归属：区状态进区组件（AgentDetail 不再持有 968 行 $）

## 裁剪

- 不做：Chat 页拆分（597 行——流式逻辑耦合高，登记后续）；全量 i18n
- UI 测试范围：主页面渲染基线 + 关键交互（保存/过滤）——不追求全覆盖
