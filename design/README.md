# weifuwu/design — 设计理念与概念文档

> 本目录只保留**设计理念/概念/契约/架构**类文档（2026-12 清理：已完成的实施/优化/执行计划已归档删除——
> 历史决策记录可从 git 历史追溯，无需保留在仓库）。
> **维护规则**：新设计决策/概念 → 写本目录；实施计划完成 → 归档删除（不留残骸）。

| 文件 | 文档 | 定位 |
|------|------|------|
| `ai-contract.md` | **AI Stream Protocol 契约** | AI 中间件协议：chat/stream/agent/approve——ws 事件 + SSE 语义 |
| `async-mode-a-plan.md` | **模式 A：两阶段异步组件架构** | 全 async 组件 + await 全部（buildVNode 预构建 + 原子切换）——当前组件模型（AGENTS.md §3.3） |
| `components-cuts.md` | **组件裁剪集中登记** | 诚实裁剪单一事实源（R44 强制）——不支持的能力明确登记 |
| `design-variables.md` | **组件设计变量（可覆盖 token）** | 消费方可覆盖的组件定制钩子（--wf-btn-radius 等） |
| `render-only-plan.md` | **render-only 方案** | 取消 $ Proxy/dirty——只有 ctx.ui.render() 一种触发（vdom 核心不变量，AGENTS.md §4.0） |
| `style-guide.md` | **wf-* 命名规范 + 三档学习路径** | 样式使用指南：布局原语/组件类/三档学习路径 |
| `style-system.md` | **样式系统总览** | token 体系 + 原语 + 组件三层的样式系统设计 |
| `ui-architecture.md` | **前端 UI 架构定稿** | UIRouter + VDOM（req/res 定义）——架构设计文档 |
| `vdom-consistency-plan.md` | **vdom 一致性设计** | DOM = children 数组同构镜像——占位法 + 三层一致性闭环 |
| `vdom-transform-rules.md` | **vdom 转化规则表** | JSX → vnode → DOM 可推导性 by construction——规则表之外的 = magic |
