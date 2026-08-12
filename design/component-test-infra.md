# 组件测试基础设施重构计划（ui-dom/testing 原语）
> **状态（2026-12 确认）**：✅ 已完成——组件测试基建（ui-dom/testing 原语）——R-INFRA audit 强制，存量迁移完成

> 背景：组件开发最大的重复不是代码，是**测试脚手架**——121 个组件测试文件里
> 94 个（78%）手抄 `renderVNode`（3 种变体漂移）、114 个（94%）手抄 `mockCtx`（8+ 变体）、
> 20 个手抄 VNode 树遍历（且都不处理嵌套数组）、25 个手抄"同实例 mount"模式
> （第九批引入的语义更正确的形态）。ui-dom 至今没有为组件测试提供任何官方原语。
> 目标：收敛为 `weifuwu/ui-dom/testing` 子路径入口（vue/test-utils 模式），
> 组件开发（含用户自研组件）测试不再从零手抄。

## 一、调研结论（证据）

### 1.1 renderVNode 的角色与变体

- **不是组件内部使用**——是测试层辅助：把两阶段组件 `(initProps, ctx) => (props) => VNode` 叫到 VNode 层（mount 一次 + render 一次），**只渲染一层**（子组件保留为函数引用）
- 3 种手抄变体：88 个无类型 `(Comp: any, props: any, ctx: any)` / 4 个带 `WfuiContext` 类型 / 2 个缺 ctx 参数

### 1.2 测试语义不一致（最痛）

- `renderVNode` 每次调用 = **新 mount** → 内部 `let` 状态全丢
- 第九批（JsonSchemaForm/ReasoningBlock/CitationCard/SessionList/ApprovalCard 修改参数）测试
  全部被迫改"同实例 mount"模式（`const inner = Comp(props, ctx); return () => inner(props)`）才能测内部状态流转——**25 个文件已手动实现，官方缺失**

### 1.3 组件真实依赖的 ui.* 原语（mock 面）

| 原语 | 使用组件数 | 原语 | 使用组件数 |
|------|-----------|------|-----------|
| usePopup | 16 | usePopup 模态模式 | 2（Modal/Drawer 真实链路） |
| useScrollPosition | 9 | useControlledInput | 2 |
| useInView | 7 | useAnimationEnd | 2 |
| useTween | 5 | useVisualViewport | 1 |
| usePopupPosition | 5 | useStableRef | 1 |
| useGlobalKey | 5 | useReducedMotion | 1 |
| useOpen | 4 | useControlled | 1 |
| useDragDrop | 3 | render / dirty / $ | 全部 |
| useChat | 3 | | |
| useDrag | 2 | | |

- `mockCtx` 87 个文件是同形 `{ ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } }`——可一行收敛
- usePopup mock 同一段代码复制 4+ 处（Select/JsonSchemaForm 测试可见）

### 1.4 已有的分散基础设施（未收敛）

| 已有 | 位置 | 问题 |
|------|------|------|
| `setupJsdom()` | `src/test/client/setup.ts` | 32 个组件测试跨目录 import `../../test/client/setup.ts` |
| `mountApp()`（真实挂载） | `src/test/ui-dom-mount.ts` | 集成测试用，组件单测不适用（重） |
| `mountVNode`/`patchValue` | ui-dom（生产导出） | 32 个真实渲染测试手写 container + patch 循环 |

## 二、设计：`weifuwu/ui-dom/testing` 子路径

> 不进主 `index.ts`（测试专用不污染生产面）；独立子路径随包发布（vue/test-utils 模式）。
> 本仓库内相对路径 import；npm 用户 `import { renderVNode } from 'weifuwu/ui-dom/testing'`。

### 2.1 原语清单（P0）

| 原语 | 签名 | 解决 |
|------|------|------|
| `renderVNode` | `(Comp, props, ctx) => VNode \| null` | 94 文件手抄变体（同步组件；两阶段调用） |
| `mountComponent` | `(Comp, props, ctx) => () => VNode` | **同实例 re-render**（修复测试语义不一致）；内部状态流转测试 |
| `walkVNode` | `(vnode, visit: (n) => void) => void` | 20 文件手抄遍历；**处理嵌套数组 children**（Select optgroup 踩过：`[[div,div]]` 遍历不到） |
| `findVNode` | `(vnode, pred) => vnode \| undefined` | 按谓词查询（组件 type 断言/class 匹配） |
| `findByClass` | `(vnode, cls) => vnode[]` | class token 精确匹配（`split(' ')`——`includes` 会误匹配 `wf-reasoning-toggle` ⊃ `wf-reasoning`） |
| `createTestCtx` | `(overrides?) => WfuiContext` | 87 文件同形 mockCtx；默认 `{ ui: { $: () => ({}), render, dirty, ready: true } }` + 可覆盖任意原语 |
| `createPopupMock` | `(isOpen = () => false) => { get open, setOpen, refresh, portal, wrapProps }` | usePopup mock 4+ 处复制（portal 按 isOpen 条件渲染） |

### 2.2 真实渲染封装（P1）

| 原语 | 签名 | 解决 |
|------|------|------|
| `renderToDom` | `(Comp, props, ctx?, container?) => { el, rerender(props) }` | 32 文件手写 setupJsdom + container + mountVNode + patchValue 循环（Modal/DatePicker/Img-preview 模式） |
| `setupJsdom` | 提升/再导出 | 跨目录 `../../test/client/setup.ts` 路径漂移 |

### 2.3 兼容性纪律

- `renderVNode` 与现有手抄语义**完全一致**（不改变断言方式）——迁移零风险
- `mountComponent` 是新能力（现有手抄 mount 模式的官方化）
- 全部零运行时依赖、node --test 直跑（沿用 `.ts` 源码 import）

## 三、迁移与防线

| 阶段 | 内容 | 验收 |
|------|------|------|
| R1 | 建 `src/ui-dom/testing.ts` + `testing.test.ts`（TDD：renderVNode/mountComponent/walkVNode 嵌套数组/findByClass 精确匹配/createTestCtx/createPopupMock） | 原语自身测试全绿 |
| R2 | 迁移 5 个高价值文件验证：JsonSchemaForm/ReasoningBlock/CitationCard/SessionList/Select（第九批 + 弹层族）——删手抄 helper 改用官方工具 | 5 文件测试全绿 + diff 干净（手抄消失） |
| R3 | style-audit 新增规则：测试文件内联 `function renderVNode` → 违规（防新抄）；`grep -c` 手抄基线递减 | audit 绿；手抄计数从 94 开始递减 |
| R4 | AGENTS.md 测试纪律补：组件测试用 `weifuwu/ui-dom/testing` 原语（renderVNode 断言组件 type / mountComponent 测状态流转 / findByClass 精确匹配）；docs/custom-components.md 同步 | 文档同步 |
| R5 | 构建加 `dist/ui-dom/testing.js` 子路径入口 + tsconfig paths 验证（app 与 demo 消费端） | build 成功 + 子路径可 import |

**不做**：批量迁移其余 90 个文件（churn 风险大、收益递减）——audit 防新抄 + 后续按需迁移。

## 四、P1 独立评估（不进本计划主体）

| 项 | 说明 | 决策 |
|----|------|------|
| 嵌套数组 children 渲染器展开 | Select optgroup 暴露：`h('div', {}, [[a,b]])` 渲染器不展开（React 会） | 渲染器行为变更，需查旧测试单独评估（AGENTS.md 纪律）——本计划只保证 `walkVNode` 处理嵌套数组（测试侧先行） |

## 五、验收

- [ ] `src/ui-dom/testing.ts` 7 原语 + 自身测试全绿
- [ ] 5 文件迁移验证（手抄 helper 消失）
- [ ] style-audit 新增防抄规则全绿
- [ ] 全量测试绿、build 含 ui-dom/testing 子路径
- [ ] AGENTS.md + docs/custom-components.md 同步

## 进度记录

### R1 ✅ 原语实现（2026-08）

- `src/ui-dom/testing.ts`：renderVNode / mountComponent / walkVNode / findVNode / findByClass / createTestCtx / createPopupMock 7 原语
- `testing.test.ts` 11 测试全绿（含嵌套数组遍历、findByClass 精确匹配防误报、同实例状态保留）
- `createTestCtx` overrides.ui 部分覆盖（Partial<WfuiContext['ui']>）

### R2 ✅ 5 文件迁移验证（2026-08）

- SessionList / JsonSchemaForm / ReasoningBlock / CitationCard / Select——手抄 helper 全删，改用官方工具，测试全绿
- 迁移中踩坑记录：
  - ReasoningBlock 的 byClass 曾用 includes 匹配（wf-reasoning ⊃ wf-reasoning-toggle 误报）——官方 findByClass 已精确化
  - CitationCard 的 collect 编辑中一度丢失（组件 type 断言必须基于 walkVNode）
  - Select 的 allNodes/childrenOf 保留（childrenOf 是直接 children 操作，allNodes 改基于官方 walkVNode）

### R2 ✅ 批量迁移 + 事故记录（2026-08）

**过程**：
1. 脚本批量迁移 68 个同形模板文件（renderVNode/mockCtx 精确块）——全绿
2. **事故**：首次脚本误替换变体 mockCtx 调用 → 回滚时 `git checkout -- src/components/` 误伤**整个目录**，丢失第九批已跟踪实现——按实现记录完整重建（见下）
3. 批量迁移策略分四波：同形模板（68）→ 简化型 const mockCtx（12）→ 别名化（11）→ renderVNode 残留（16）→ 带原语 mock 变体（逐一手动：useScrollPosition 族 4 / useInView 族 3 / browser 族 / useOpen 族 / usePopup 模态模式 3 / usePopup 族 / 集成式 2 / 带状态 5）
4. **最终结果：94 → 0 手抄，LEGACY 表清空**——100% 迁移完成
5. 教训：回滚必须精确到文件；脚本替换前先验证对象边界（正则截断含逗号对象教训——Img 事故）

**R-INFRA 规则现状**：LEGACY 表空 = 规则成为纯防抄防线（任何新组件手抄 renderVNode/mockCtx 即红）

### R3 ✅ audit 防抄规则（2026-08）

- style-audit 第 39 条 R-INFRA：手抄 renderVNode/mockCtx → 违规；存量 LEGACY 登记表（迁移中，强一致校验——已迁移的必须从表移除）
- 初始 LEGACY 表 = 存量手抄 87 组件（已迁移 5 个不在表）——audit 39 条全绿

### R4 ✅ 文档同步（2026-08）

- AGENTS.md §7.2：官方原语用法 + 纪律（renderVNode 只一层 / mountComponent 状态流转 / findByClass 精确匹配）
- docs/custom-components.md §7：用户自研组件测试写法（npm 子路径 import）

### R5 ✅ 构建子路径（2026-08）

- build.mjs 加 `dist/ui-dom/testing.js` 入口；package.json exports 加 `./ui-dom/testing`（types + default）
- dist 导出验证：7 原语全部 minify 导出

### 验收状态

- [x] `src/ui-dom/testing.ts` 7 原语 + 自身测试全绿（11）
- [x] 5 文件迁移验证（手抄 helper 消失）
- [x] **批量迁移 94 → 0 手抄 100% 清零**（LEGACY 表空——R-INFRA 纯防抄）
- [x] style-audit R-INFRA 规则全绿（39 条）
- [x] 全量测试绿（1792）、typecheck 通过、build 含 ui-dom/testing 子路径
- [x] AGENTS.md + docs/custom-components.md 同步
- [x] 事故恢复：回滚误伤第九批实现 → 按记录重建（index/Select/ApprovalCard/AiChat 全绿）
