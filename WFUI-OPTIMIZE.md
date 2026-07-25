# weifuwu/client 优化计划

## 背景

在 agent-platform 开发中，`weifuwu/client` 暴露了若干运行时问题。这些问题并非孤立 bug，而是反映了框架在 JSX 规范兼容性、数据更新模型、组件设计等方面的系统性不足。

## 问题归类

### A. JSX 运行时与 esbuild 不兼容（导致 3 个 bug）

| # | 问题 | 表象 | 根因 |
|---|------|------|------|
| 1 | `jsx`/`jsxs` 签名不匹配 | key 参数作为文本节点渲染 | esbuild 生成 `jsxs(type, props, key)`，但框架签名是 `(type, props, ...children)`，key 被 capture 进 children |
| 2 | `key` 属性泄漏到 DOM | `<div key="0">` | `setProp` 未过滤 `key`，当作普通属性 setAttribute |
| 3 | `jsxs` 忽略 key 后无替代 | 工具列表 `.map()` 每次全量重建 | 修复#1 时直接丢弃 key，放弃潜在优化机会 |

**根因**：框架的 `jsx`/`jsxs` 签名设计早于 esbuild 自动模式规范。esbuild `--jsx=automatic` 的调用约定与框架原始假设不同。

### B. 控制流组件无法处理数据更新（导致 1 个 bug + 1 个性能问题）

| # | 问题 | 表象 | 根因 |
|---|------|------|------|
| 4 | `For` keyed 渲染不更新内容 | 流式 token 前端永远不显示 | `insertBefore` 只移动节点不重建，文本节点永不过期 |
| 5 | `For` 全量重建性能 | 每次数组变化重建所有 item | 修复#4 时采用 replaceChild 全部替换的保守策略 |

**根因**：`For` 组件假设 children() 只调用一次，数据变化通过 signal 系统驱动。但 items 是普通对象数组（非 signal），数据变化时 For 无法获知哪些 item 变了。

### C. toNode 和 appendChild 的异常值处理（导致 1 个 bug）

| # | 问题 | 表象 | 根因 |
|---|------|------|------|
| 6 | `toNode(false)` 渲染 "false" | 页面上大量 `false` 文本 | `String(false)` → "false" |
| 7 | 函数值泄露 | 可能将函数变为文本 | `String(function)` → "fn(){}"（理论上存在，未实际触发） |

**根因**：缺少 JSX 标准中对 `boolean`/`null`/`undefined`/`function` 的无声跳过约定。

### D. 组件级错误保护缺失（导致潜在崩溃）

| # | 问题 | 表象 | 根因 |
|---|------|------|------|
| 8 | 组件 throw 无容错 | 渲染管线中断 | jsx 的 Component 分支无 catch |

### E. 开发者体验（开发期问题）

| # | 问题 | 表象 | 根因 |
|---|------|------|------|
| 9 | 静默失败 | 信号缺 `.value` 不提示 | 无显式开发模式检查 |
| 10 | 无错误来源 | 错误发生在 JSX 内部，调用栈不清晰 | jsxDEV 不传递 source 信息 |

## Phase 1 — JSX 运行时规范对齐 ✅

- [x] `jsx`/`jsxs` key 参数处理 — 第三参数不作为 children
- [x] `setProp` 过滤 `key` 属性
- [x] `toNode` 跳过 boolean/null/undefined
- [x] `appendChild` 已正确处理 boolean/null

## Phase 2 — 控制流组件数据模型

- [x] `For` 增量更新：`_wfData` 引用比较，相同则跳过重建
- [ ] `For` 子项内容变化检测：浅比较 keyBy 字段 + 内容字段，只重建变化的项
- [ ] `Show` `display:contents` 层级优化：多个嵌套 Show 合并为一个

## Phase 3 — 健壮性

- [x] jsx 组件错误边界：try-catch + console.error + 空 fallback
- [ ] `appendChild` 函数值静默跳过（非 Node 应 ignore 而非 String()）
- [ ] `setProp` className Signal 空值保护

## Phase 4 — 开发者体验

- [x] jsxDEV 信号缺 `.value` 检查
- [ ] jsxDEV 列表缺 key 警告（`children` 是数组且无 `keyBy`）
- [ ] jsxDEV source map 错误定位

## Phase 5 — 长期架构

- [ ] 信号自动解包：`{signal}` 自动读 `.value`（类似 Solid.js）
- [ ] 数组 item 级响应式：`messages.value[i].content` 变更自动触发对应 DOM 更新
- [ ] 虚拟滚动：`For` 渲染可见区 + 移除不可见区 DOM（优化 >1000 条列表）

## 优先级

```
Phase 1 ✅ 已完成
Phase 2 🏗️ `For` 增量更新已做，内容变化检测待完善
Phase 3 🏗️ 错误边界已做，appendChild 异常值待处理
Phase 4 🏗️ jsxDEV 基础检查已做
Phase 5 🔲 长期
```

