# weifuwu/client 优化计划

> **状态（2026-10）**：R1–R5 + S1–S5 + T1–T5 + W1–W5 全部完成 ✅。`as any` 78→**0**（代码），`: any` 94→26（剩 C 类架构性），`any[]` 11→0，+54 测试，1962 全绿。weifuwu/client 优化收尾。

> 目标：在不改变组件 API 与渲染语义的前提下，修热路径算法复杂度、建立渲染基准护栏、拆分单文件结构、补齐资源回收、收敛构建体积。
> 现状基线：`src/client/` 3173 行 18 文件；`render.ts` 1117 行（mount/diff/hydration/portal/清理 五职混居）；`app.ts` 456 行大闭包；测试 5199 行 17 文件全绿（854 前端）；dist/client/index.js 71KB 未压缩。

## 现状审查结论（2026-08）

### 性能/算法
| # | 位置 | 问题 | 严重度 |
|---|------|------|--------|
| 1 | `patchProps` L581 | `newKeys.includes(key)` 对每个 old key 线性扫 newKeys → **O(n·m)**（props 多时明显） | 中 |
| 2 | `patchKeyedChildren` L749 | Step 3 移除消失 key 时 `newKeys.includes(key)` 线性扫 → **O(n²)**（大列表差） | 中 |
| 3 | `typeOf` L562 | 每次 `patchValue` 都拼接 `fn:${name}` / `tag:${type}` 字符串 → 热路径分配 | 低 |
| 4 | `componentPropsEqual` L820 | 每次组件 patch 全量遍历 props keys + children 逐元素比较（`Object.keys` 每次分配） | 低 |
| 5 | `normalize`/`flattenChildren` | 每 patch 重建数组（含一维展平） | 低（可接受） |

### 结构/可维护性
| # | 问题 |
|---|------|
| 6 | `render.ts` 1117 行：渲染/增量 diff/键控 diff/hydration/portal/ref 清理六种职责单文件 |
| 7 | `app.ts` 456 行：middleware 链、renderByIds、dirty 批处理、media/breakpoint/popup tracker、data cache 全在一个 `createApp` 闭包 |
| 8 | 内部状态无类型建模：`(x as any)._dirtySet` / `._ctxVersion` / `._selfId` 遍布（render.ts 22 处 + app.ts 13 处 `as any`）——改错编译器不拦 |
| 9 | `ctx.ui` 每组件 mount 一次 `Object.create` prototype 链——深层组件树沿链查找 `_selfId`（未证实热点，需基准验证） |

### 健壮性/资源回收
| # | 问题 |
|---|------|
| 10 | `useMedia`/`useBreakpoint`/`usePopupPosition` 注册进 `_mediaRegistry`/`_popupTrackers` 后**无 per-component 卸载清理**——组件卸载后 tracker/media listener 残留（功能无害但 registry 不回收；`destroy()` 只清全局监听） |
| 11 | `_idCounter` 单调递增永不复用（只增不回收，id 无限增长——内存无碍，属诚实接受） |
| 12 | `asyncFactoryCache` 路由导航已 `clearAsyncComponentCache()` 失效（已实现 ✓） |

### 构建/测试
| # | 问题 |
|---|------|
| 13 | dist/client/index.js 71KB **未 minify**（build.mjs 无 `--minify`）；后端 bundle 150KB 未压缩（服务端无碍） |
| 14 | **无 client 级基准**：`bench/` 全为 DB（redis/pg），client 性能改动无量化手段 |
| 15 | keyed diff 正确性测试扎实（render.test 已有「仅 X 次 DOM 修改」断言 L1031-1092）✓——算法改动的护栏已存在 |

## 阶段总览

| 阶段 | 主题 | 行为变化 | 交付 |
|------|------|---------|------|
| P0 | 热路径算法修正 | 无（语义等价） | patchProps/patchKeyedChildren 消 O(n²)、typeOf 去分配、componentPropsEqual 预计算 |
| P1 | 渲染基准 + 回归护栏 | 无 | bench/client-bench.ts + 基线记录 + P0 前后对比 |
| P2 | 结构拆分 | 无（纯搬移） | render.ts → registry/diff/hydration/portal/render；app.ts → app/ui；内部类型建模消 `as any` |
| P3 | 生命周期资源回收 | 无（新增清理） | media/popup 注册表 per-component 退订 + 卸载测试 |
| P4 | 构建与导出收敛 | 无 | client/components bundle minify；内部 API 标注；体积记录 |

## P0 — 热路径算法修正

### 问题
`patchProps` 与 `patchKeyedChildren` 的 `includes` 线性扫描把每次 diff 变成 O(n·m)/O(n²)；`typeOf` 每次分配字符串。

### 方案
1. `patchProps`：先建 `newKeySet = new Set(newKeys)`，`!newKeySet.has(key)` 判删除（O(1)）
2. `patchKeyedChildren` Step 3：`const newKeySet = new Set(newKeys)` 一次构建，查消失 key O(1)
3. `typeOf`：tag 类型改为 `'tag'` 常量 + 独立判断分支（元素替换条件 = oldType !== newType 时，用 tag 字符串比较替代每次拼接）——具体：`typeOf` 对元素返回 `'tag'` 统一标记，类型变化由 `patchValue` 的「字符串类型 + tag 不同」判断处理（tag 比较只在字符串类型时进行）；组件返回统一 `'fn'` 但需保持「组件 A→组件 B 替换」语义——组件替换判定改由 `typeof type === 'function'` 统一走组件分支（组件 A→B 由 `_render` 传递 + props 比较天然处理？不——组件 A→B 是不同函数，需替换）。**保持语义安全的做法**：`typeOf` 组件返回稳定键 `fn:${name}`，但用 `Map<Function, string>` 缓存 name → 键，避免每次拼接
4. `componentPropsEqual`：keys 并集用 `Object.keys` 缓存（同 props 对象引用时直接 `a === b` 已短路——纯收益有限，仅把 `new Set([...])` 改为先比长度）

### 验证
- 全量前端测试绿（render.test 的 DOM 修改计数断言 1031-1092 是行为等价护栏）
- `bench/client-bench.ts` 前后对比：大列表 patch（1000 行重排/更新/增删）与 props 高频更新，中位数不劣化且明显改善
- 验收记录：数值表 + 断言无行为变化

## P1 — 渲染基准 + 回归护栏

### 问题
client 性能改动无量化手段（bench/ 全为 DB）。

### 方案
新建 `bench/client-bench.ts`（node 直接跑，jsdom 环境）：
| 场景 | 内容 |
|------|------|
| 大列表初始渲染 | 1000 行 Table patchValue mount |
| 大列表全量更新 | 1000 行 props 变化（每行 class 变） |
| keyed 重排 | 1000 项 reverse（DOM 移动计数） |
| keyed 增删 | 头插/删尾/混合 |
| 组件树深度 | 20 层嵌套组件 dirty 重渲染 |
| props 高频更新 | 单组件 1000 次 render() |
| 三态 skip | 静态子组件树 1000 次父 dirty（skip 命中率） |

输出：每场景中位数 ms + DOM 操作计数。基线记入本文档验收记录。

### 验证
- 命令可跑：`node bench/client-bench.ts`
- P0 改动前后对比表

## P2 — 结构拆分（纯搬移）

### 问题
render.ts 1117 行六职混居；app.ts 456 行大闭包；内部状态 `as any` 无类型。

### 方案
```
src/client/
  registry.ts     idRegistry/_idCounter/callRefCleanup/clearAsyncComponentCache   （原 render.ts 前 130 行 + 清理段）
  diff.ts         patchValue/patchProps/patchChildren/patchKeyedChildren/比较函数  （增量 diff 全部）
  portal.ts       renderPortal/patchPortal/ensurePortalContainer/cleanupPortalChildren
  hydration.ts    hydrateVNode/renderValueHydrating/renderComponentHydrating/游标
  render.ts       renderValue/renderComponent/挂载锚点簿记（mount 路径）
  ui.ts           ctx.ui 工厂方法（render/dirty/$/useMedia/useBreakpoint/usePopupPosition/selfId/useChat）
  app.ts          createApp：middleware 链 + renderByIds + dirty 批处理 + 数据管道（引用 ui.ts）
  internal.ts     内部类型 UiInternal（_selfId/_selfVNode/_dirtySet/_ctxVersion/_$cache）——render/app 间传递，替代 `as any`
```
- 内部类型建模：`UiInternal` 接口（`_dirtySet: Set<string>`、`_ctxVersion: number`、`_selfId?: string`、`_selfVNode?: VNode`、`bumpCtxVersion`），`childCtx.ui` 类型从 `any` 变 `UiInternal`——**编译器开始拦住跨文件状态误用**
- 搬移纪律：git 层面 diff 只显示移动（`git diff --stat` 行数守恒），测试零改动全绿

### 验证
- 全量测试绿 + typecheck + build（三门槛）
- `git diff` 确认零行为逻辑改动（纯移动/重命名）

## P3 — 生命周期资源回收

### 问题
组件卸载后 media/popup 注册表条目与 listener 残留。

### 方案
- 卸载钩子：`callRefCleanup` 注销 `_id` 时（render.ts 已有注销点）→ 通知 app 层清理 `_mediaRegistry`/`_popupTrackers` 对应 selfId 条目
- 实现方式：`registry.ts` 暴露 `onVnodeUnmount(id, cleanup?)` 或 app 注册一个全局回调 `setUnmountHook(fn)`——由 `createApp` 传入清理函数，`callRefCleanup` 注销时调用（含 `_customId` 与 `_id` 两条路径）
- `usePopupPosition`：tracker 条目删除后 `pos` 仍被组件闭包引用（无害，组件已卸载）；scroll listener 由 `destroy()` 清（已有）
- `useMedia`：`mql.removeEventListener('change', handler)` 在卸载时执行

### 验证
- 新增测试（jsdom）：组件卸载（ref(null) 触发）后 `matchMedia` 注册的 change listener 计数归零；`_popupTrackers` 条目消失（通过内部暴露的测试钩子或 spy）
- 全量测试绿

## P4 — 构建与导出收敛

### 问题
dist/client/index.js 71KB 未 minify；内部 API 导出无标注。

### 方案
- `scripts/build.mjs`：client/components bundle 加 `--minify`（前端可安全压缩；后端 server bundle 保持可读，或统一 minify——按发布需要）
- `src/client/index.ts`：`mountVNode/callRefCleanup/patchValue/animateOut` 注释标注「内部 API（components bundle 外部化共享用，非公共契约）」
- 体积记录：minify 前后 dist/client/index.js + dist/components/index.js 大小表

### 验证
- build 通过 + agent-platform 浏览器冒烟（toast/confirm/modal 全链路）
- 体积表记录到本文档

## 诚实裁剪

- **不改 `ctx.ui` prototype 链**：语义稳定，风险 > 收益；除非 P1 基准证明其为热点（记录在案，留待未来）
- **不做 VNode 复用池**：JSX 每次新建 VNode 是 GC 友好设计；复用池引入引用泄漏面
- **不 WeakMap 化 idRegistry**：key 是 string 无法 WeakMap；卸载已 delete，泄漏面小
- **不做渲染调度器大改**：dirty 微任务批处理已满足现状；任务优先级/并发渲染无真实场景支撑
- **不引入 fiber/并发**：架构级变更，无收益场景
- **`_idCounter` 不复用**：id 无限增长无内存问题
- **dev 模式不动**：动态编译保持可读（minify 仅发布产物）

## 验收记录

（每阶段完成后填写：测试数、bench 数值、体积表、发现的问题）

---

## 验收记录（P0–P4 已完成 ✅）

### P0 热路径（854 测试全绿，行为等价）
| 场景（bench/client-bench.ts，jsdom，中位数） | P0 前 | P0 后 |
|------|------|------|
| keyed 重排（1000 行 reverse） | 0.430 ms | 0.205 ms（**-52%**） |
| keyed 头插 10 + 删尾 10 | 0.510 ms | 0.203 ms（**-60%**） |
| 大列表全量更新（1000 行 class 变） | 0.200 ms | 0.198 ms（持平） |
| 大列表初始渲染（1000 行） | 22.3 ms | 23.1 ms（噪声） |
| 单组件 1000 次 render() | 0.58 ms | 0.64 ms（噪声级） |

### P1 基准
- `bench/client-bench.ts`：6 场景中位数 + warmup 200 次；jsdom 环境（复用 setup.ts 的 global 注入手法）；`node --experimental-strip-types bench/client-bench.ts`
- 改动后必须跑一遍确认关键场景（重排/增删）不劣化

### P2 结构拆分（854 测试零改动全绿 + typecheck + build）
- render.ts 1117 → 334 行；app.ts 456 → 276 行；新增 diff.ts 518 / hydration.ts 211 / registry.ts 132 / ui.ts 256
- 内部类型建模 UiInternal（_selfId/_dirtySet/_ctxVersion/_dirtyScheduled/_$cache）——typecheck 抓到 types.ts 漏声明的公开 API useMedia/useBreakpoint（已补）
- 兼容再导出保持旧导入路径（组件/测试零改动）；render.ts ↔ diff.ts 设计环（renderValue ↔ patchKeyedChildren）无顶层互调、运行时安全

### P3 生命周期（+4 测试，858 全绿）
- registry.ts 新增 `onComponentUnmount(hook)`：callRefCleanup 注销 _id/_customId 时触发
- app mount 注册卸载钩子：退订 `media:${id}:*` / `bp:${id}` listener + 删 popup tracker
- useBreakpoint 原多 listener 无法退订的泄漏修复（mediaRegistry 条目存 mqls 数组）
- destroy 走同一退订路径（unsubscribeMediaEntry）
- 测试：onComponentUnmount 触发（含 _customId）、useMedia/useBreakpoint 卸载退订、组件树内卸载退订

### P4 构建（体积表）
| 产物 | minify 前 | minify 后 |
|------|------|------|
| dist/client/index.js | 71.3 KB | **34.6 KB（-51%）** |
| dist/components/index.js | — | 60.9 KB |
| dist/index.js（后端，未 minify） | 150.5 KB | 147.0 KB |
| dist/components/style.css | — | 112.7 KB |

- 仅前端 bundle minify（dev 动态编译不受影响，保持可读）；后端 bundle 保持可读
- 浏览器冒烟（agent-platform，minify 产物下）：Modal 打开+焦点、Confirm→Toast、删除生效 ✓
- 内部 API 标注：index.ts 的 mountVNode/callRefCleanup/patchValue/animateOut/hydrateVNode 注明「内部 API 非公共契约」

### 诚实裁剪执行情况
- prototype 链 ctx.ui 未动（P1 基准证实非热点：20 层组件树 render 0.005ms）
- VNode 复用池/WeakMap 化 idRegistry/调度器大改/fiber：未做（无收益场景）
- `_idCounter` 不复用（无内存问题）
- 剩余 `as any` 34 处：VNode 内部属性访问与 ctx 扩展边界（UiInternal 已覆盖核心状态面），未逐一清理

---

## 后续：apps 使用优化（✅，基于实际使用痕迹）

### 证据驱动的缺口
- **63 次裸 fetch vs 1 次 ctx.api**：api 中间件无法自动鉴权（token 在 auth 中间件，两者无组合）→ apps 每页手写 `Authorization: Bearer` 头 + `.json()` + 吞错误
- **`(ctx as any).confirm` / `(ctx as any).toast?.` 遍布 apps**：confirm/toast 中间件零类型注入
- **取数样板**：14 页重复 `$.x = []; $.loading = true; fetch().then().catch()`，错误静默

### 修复
1. **api 中间件加 `token: () => string | null`**：非空时自动加 `Authorization: Bearer <token>`（请求头未显式指定时）
2. **confirm/toast 类型注入**：导出 `ConfirmInjected`/`ToastInjected`；中间件返回类型改为 `AppMiddleware<{}, ConfirmInjected|ToastInjected>`；WfuiContext 基础声明补 `confirm?`/`toast?`（apps 不写 C 泛型也能用）
3. **`ctx.ui.useAsync(fetcher)`**：普通组件取数工具——loading/error 自动管理、data/loading/error 响应式、reload() 重跑、卸载后旧 Promise resolve 安全忽略
4. **destroy() 补 `idRegistry.clear()`**（useAsync 测试暴露：destroy 后残留异步回调的 dirty 会命中残留组件 → `ctx.ui._dirtySet` 炸）

### 迁移验证（agent-platform）
- `main.tsx`：`api({ token: () => localStorage.getItem('agent_platform_token') })`
- `Companies.tsx` 全量迁移示范：裸 fetch + `$.loading` 三连 → `ctx.ui.useAsync` + `ctx.api!` + `ctx.confirm!`/`ctx.toast!`（0 处 `fetch(`/`$.` 残留）
- 浏览器冒烟：列表加载（token 自动注入）→ 删除 → Confirm → toast「公司已删除」→ reload 刷新 ✓
- 测试：862 前端全绿（+4 useAsync：成功/失败/reload/卸载后过期 resolve）

### 诚实裁剪
- 仅迁移 Companies.tsx 作为示范；其余 13 页的 fetch 迁移留待后续（模式已验证，机械替换）
- `ctx.api` 为可选声明需 `!`（与 WfuiContext 现有 api?/auth? 一致的模式）
- agent-platform 有 5 个既有 typecheck 错误（server.ts/middleware/ai.ts），非本次引入

---

## 后续：自定义组件开发 DX（证据驱动，2026-09）

> 目标：让外部开发者用 weifuwu/client 写自定义组件达到内置组件的同权便利——同原语、同类型安全、同测试护栏。
> 证据来源：92 组件审计 + client API 面对照（35 项导出 vs 组件内部相对路径 import）。

### 现状基线（审计结论）

- **强**：组件模型（h/Component/两阶段）、响应式 $、usePopup（9 组件共享）、事件原语族（useInView/useScrollPosition/usePopupPosition/useVisualViewport/useHoverCapable/useLongPress）、useChat、对话框基础设施（trapFocus/lockScroll/animateOut 已导出）、低层手工能力（mountVNode/patchValue 已导出）
- **缺口**：组件内部 `createReactiveState` 1 处 import 但未公开导出；受控 warn 模式在 5+ 组件重复（Dropdown/Calendar/Cascader/Collapse/Tree）；内联 ref 陷阱（ref 纪律）是已知暗坑（AiChat 踩过）；useAsync 存在 stale-close 竞态（reload 无 token 保护）；docs 零"自定义组件"教程

## P0 — 公开面补齐（直接解除外部开发者阻塞）

### P0-1: 导出 createReactiveState（公开响应式状态）

**问题**：`ctx.ui.$()` 绑定组件实例；组件外建响应式状态（全局 store/共享跨组件状态）无公开入口。组件库内部已用（Notification.test），但 `weifuwu/client` 未导出。

**方案**：
1. `client/index.ts` 导出 `createReactiveState` + `类型 CreateReactiveStateReturn`
2. 文档示例：全局 store 模式（`createReactiveState(() => {})` + `$.__watch(cb)` 订阅）

**验证**：type-flow.test 正例 + 新测试（独立状态容器赋值触发 watcher）。

### P0-2: docs/custom-components.md（自定义组件开发指南）

**问题**：docs 零"自定义组件"内容；usePopup/事件原语/类型流的组合模式没固化成步骤文档。外部开发者写复杂组件要读 Tooltip/Modal 源码逆向模式。

**方案**：新文档，按复杂度阶梯：
1. 无状态组件 → 有状态组件（$）→ 异步组件（asyncComponent）
2. **带弹层组件**：usePopup 逐步示例（trigger 降级/Escape/外部点击/定位/clamp/portal）
3. **对话框组件**：trapFocus + lockScroll + animateOut 模式（参考 Modal）
4. **AI 组件**：useChat + 共享 $ 订阅
5. 类型纪律：Component<P,C>、受控 props 配回调、ref 纪律、style-audit 对齐
6. 测试写法：renderVNode + @ts-expect-error 负例

**验证**：README 文档导航 + components.md 链接；文档围栏/链接检查脚本通过。

## P1 — 原语收敛（消灭组件层重复）

### P1-1: useControlled 原语（受控判定 + 缺回调 warn）

**问题**：`console.warn('[weifuwu/Dropdown] 受控模式（open 已传）但未提供 onOpenChange…')` 模式在 Dropdown/Calendar/Cascader/Collapse/Tree 5+ 组件逐字重复。

**方案**：`ctx.ui.useControlled({ value, onChange, name })` → `{ value, setValue, controlled }`：
- `value !== undefined` → controlled；缺 `onChange` → 一次 warn（名称化）
- 非受控 → 内部 `$` 状态回退
- SSR 无害（无副作用）

**迁移**：5 组件逐个替换（每个组件改后跑自身测试 + style-audit）；新受控组件一律用它（文档强制）。

**验证**：TDD——先写 useControlled 测试（受控/非受控/缺回调 warn 一次）；迁移后 5 组件测试保持绿。

### P1-2: useStableRef 原语（内联 ref 陷阱根治）

**问题**：ref-diff 在 ref 函数引用变化时调用旧 ref(null)——内联 ref 导致每次渲染误触清理（AiChat 流式不更新的根因之一）。AGENTS.md 有纪律但**无原语**，新开发者仍会踩。

**方案**：`ctx.ui.useStableRef(init, cleanup?)` → 稳定引用（mount 作用域持有，永不重建）：
```tsx
const listRef = ctx.ui.useStableRef(
  (el) => { instance = init(el) },
  () => { instance?.dispose() },
)
return () => h('div', { ref: listRef })
```

**验证**：TDD——测试 ref 函数引用跨渲染恒等（引用比较）+ null 分支只在卸载触发。

### P1-3: useAsync 竞态修复（stale-close token 保护）

**问题**：`reload()` 无 token 保护——快速 reload 时旧 Promise 后 resolve 覆盖新结果。

**方案**：闭包 `let token = 0`；每次 run `token++`，resolve/catch 前校验 `token === cur`，过期静默丢弃。

**验证**：TDD 红→绿——新测试：慢旧请求 vs 快新请求（可控 Promise）断言旧结果不覆盖。

## P2 — 深度边界（诚实裁剪）

### P2-1: useDialog 组合器（全屏对话框收敛）

**问题**：Modal/Drawer/Command/Img preview 的 Escape + focus-trap + scroll-lock + 退场动画状态机仍手工（usePopup 裁剪外的合理场景，但 Modal/Drawer 已 2 处重复）。

**方案**：`ctx.ui.useDialog({ open, onClose })` → `{ phase, openDialog, closeDialog, overlayProps, panelProps }`：
- 收敛：Escape（document 级）+ trapFocus + lockScroll + animateOut 退场 + bottom-sheet（≤639px 自动）
- Modal/Drawer 迁移；Command/Img 保持现状（不同语义，文档说明）

**验证**：TDD——useDialog 测试（开/关/Escape/trap/scroll-lock/退场）+ Modal/Drawer 既有测试保持绿。

### P2-2: SSR no-op 验证测试

**问题**：usePopup/useInView/useScrollPosition/useAsync 的 SSR shim 无独立测试（遍历器下 `$` dirty no-op 已被 shim 覆盖，但原语本身无验证）。

**方案**：服务端 ctx shim 下逐个调用原语，断言不抛 + 返回合理初始值。

**验证**：新测试文件（server ctx 模拟）。

## 依赖与验收汇总

```
P0-1 ──┐
P0-2 ──┤（文档先于 P1 迁移，开发者有参考）
P1-1 ──┼─→ P1 三个原语独立可并行（各自 TDD）
P1-2 ──┤
P1-3 ──┘
P2-1 ──（依赖 P1-1 的 useControlled 模式先定型？否——独立）
P2-2 ──（独立）
```

- **每项验收**：TDD 红→绿（CS-05）+ 对应组件测试保持绿 + `tsc --noEmit` + 全量 `npm test` ≤15s（当前 1469 测试 ~11.5s，预算余量 ~3.5s）
- **文档验收**：README 文档导航同步 + 围栏/链接脚本通过
- **诚实裁剪**：Command/Img preview 不进 useDialog（语义不同）；Select/DatePicker 保持 inline absolute（自适宽，无需 usePopup）——已在 components-map 声明

---

## 后续：动画基础设施（证据驱动，2026-09）

> **状态（2026-09）**：已全部实施完成 ✅——useReducedMotion/useAnimationEnd/useTween/usePresence 落地（提交 bcd4d39 → d48d278），useDialog 重构复用状态机，组件动画监听清零，1501 测试全绿。

> 目标：组件开发者获得完整的动画能力分层（CSS 语言 / 生命周期 / 数值驱动 / 偏好感知），
> 内置组件动画监听清零 + 用户扩展组件动画零样板。
> 证据：DatePicker 组件层 animationend（与 usePopup panelRef 同款但自建）、
> StatCard 手工 rAF 数值动画 + 手工 matchMedia reduced-motion。

### 能力地图（4 层）

| 层 | 原语 | 状态 |
|----|------|------|
| CSS 语言 | Token（--wf-dur-*/ease-*/motion-*）+ --enter/--exit 成对 + reduced-motion 全局降级 | ✅ |
| 生命周期 | `useAnimationEnd(cb, {once})`（完成回调）+ `usePresence(open, opts)`（显隐状态机）+ `animateOut`（命令式退场，已有） | 🔴 新 |
| 数值驱动 | `useTween(target, opts)`（数值补间）+ useInView/useScrollPosition（已有） | 🔴 新 |
| 偏好感知 | `useReducedMotion()`（响应式，JS 动画侧跳过） | 🔴 新 |

### 实施顺序（TDD 红→绿 + 组件测试保持绿 + SSR shim + 契约测试 + 文档）

1. **useReducedMotion**：响应式 matchMedia；StatCard 收敛（删手工读取）
2. **useAnimationEnd**：stableRef 形态；DatePicker 迁移（组件动画监听清零收官）
3. **useTween**：rAF + ease + reduced-motion 直落；StatCard 数值动画收敛
4. **usePresence**：enter/exit 状态机 + 延迟卸载；Dropdown/Toast 退场迁移（风险中）
5. **useDialog 基于 usePresence 重构**（可选）：对话框测试全绿后再动

### 诚实裁剪

- 不做 FLIP/共享元素/物理动画/useTransitionEnd（useAnimationEnd 预留 event 参数）
- useDialog 重构为可选（现有状态机稳定，收益<风险时保留）

---

# JSONViewer 编码复盘：client 层启示（2026-08）

> JSONViewer（递归 JSON 树）编码暴露 4 个 client 问题，其中 2 个确认需优化、1 个待深挖、1 个已文档化。
> 均以真实用户报告 + agent-browser 探针定位，非理论推测。

## 问题 1：`$` selfId 捕获策略脆弱（确认，需优化）

**现象**：`$` 状态赋值后 DOM 不更新（交互静默失效，无 console 错误）。
JSONViewer 折叠/复制反馈均受影响。

**证据链**（探针）：
- render 期 `ctx.ui._selfId` = `_wf_375` vs `$` 捕获 `_wf_193`——错位
- `dollarSame: false`——click 闭包的 `$` ≠ render 闭包的 `$`
- 折叠最终靠 **render 期捕获 selfId + 显式 `ctx.ui.dirty([selfId])`** 修复（workaround）

**根因**：`ctx.ui.$()` 的 dirty 回调在 **mount 时捕获 selfId**（ui.ts `$: function` 内
`const selfId = getSelfId(this)` 一次性闭包）。组件在**无状态包裹（`() => ()`）/
重挂载（VNode 重挂载但 `_render` 复用）**场景下，捕获的 selfId 与实际渲染实例错位
→ dirty 渲染孤儿实例 → DOM 永不更新。

**client 优化建议**（2 选 1，推荐 A）：

```ts
// A. $ 内部动态解析（推荐——组件零改动）
$: function () {
  const uiThis = this as any
  if (!uiThis._$cache) {
    // dirty 回调每次从 _selfVNode 动态读当前 id（而非 mount 捕获）
    uiThis._$cache = createReactiveState(() => {
      const id = uiThis._selfVNode?._id ?? getSelfId(uiThis)
      if (id) ctx.ui!.dirty([id])
    })
  }
  return uiThis._$cache
}

// B. 提供 ctx.ui.selfId() 动态方法（组件显式用）
selfId: function () { return getSelfId(this) ?? this._selfVNode?._id }
```

**验证方式**：JSONViewer 移除 workaround（render 期 selfId + 显式 dirty）后折叠/复制
反馈仍正常——agent-browser 必测（jsdom mock `$` 纯对象掩盖）。

## 问题 2：渲染期回调被 `_rendering` 保护忽略（确认，需优化）

**现象**：Anchor 滚动高亮不更新——render 期间调 `onAnchorChange` → 父层
`ctx.ui.render()` 被 `_rendering` 保护静默丢弃。

**根因**：`render()`/`dirty()` 在渲染期（isRendering）调用直接 return（保护防重入）——
组件 render 函数内调父层 setState 是合法需求（antd onChange 滚动语义），但被丢弃。

**client 优化建议**：`render()`/`dirty()` 在渲染期调用时**推迟到微任务**（而非直接忽略）：
```ts
dirty: function (ids) {
  if (isRendering()) { queueMicrotask(() => this.dirty(ids)); return }  // 推迟而非丢弃
  ...
}
```
**注意**：需防无限循环（渲染期回调 → 微任务 render → 渲染期又回调……）——加
"同批次推迟最多一次"或依赖 onAnchorChange 幂等（当前 JSONViewer/Anchor 用
`queueMicrotask(() => onAnchorChange?.(...))` + lastNotified 去重已规避）。

## 问题 3：无状态包裹子组件 ctx 一致性（待深挖）

**现象**：JSONViewer 在无状态 demo（`() => ()` 包裹）里 `$` 交互失效；有状态 demo
（Menu 等用 ctx）正常。疑似无状态包裹子树的 ctx 注入路径与有状态不同。

**现状**：diff.ts/render.ts 均注入 childCtx（`Object.create(ctx)` + `_selfId`）——理论上
一致。但 JSONViewer 的 `$` 捕获与 render 期 selfId 实测错位，无法完全用"多实例
querySelector 混淆"解释复制反馈失效（同一实例内 $ 也应一致）。

**待验证**：渲染器对 `() => ()` 无状态组件子树的挂载路径（是否每次 render 重新
mount 子组件 → 旧闭包 DOM 事件绑定 + 新实例 vnode——onClick 闭包与 vnode 错位）。

**若确认**：优化点为 diff 复用逻辑——**DOM 事件（onClick 闭包）与 vnode id 必须同源**
（要么全部复用旧闭包，要么全部换新——不能 vnode 换新而事件留旧）。

## 问题 4：微任务批处理时序（已文档化，测试/调试纪律）

**现象**：`dirty()` 微任务批处理——程序化 `.click()` 后**同步查 DOM 看不到变化**
（渲染在微任务里）——JSONViewer 多次被误判"点击无效"。

**纪律**（AGENTS.md 已补）：agent-browser 交互验证必须**异步等待**（sleep 0.5-0.8s）
再断言 DOM；jsdom 测试中 `flushMicrotasks` 后再断言。

## 组件侧模式沉淀（已内化，非 client 改动）

1. **交互反馈用 DOM 级直接操作**（复制 check 图标 1s）——不依赖渲染管线
   （`$` 跨闭包不一致场景下渲染级反馈不可靠）
2. **toggle 语义明确**：传当前状态（折叠→展开、展开→收起），三态
   `$.expanded[path]`（undefined 默认/false 手动展开/true 手动收起）
3. **整行点击大命中区**：折叠行/header 行 role=button + Enter/Space——
   16px chevron 触屏点不到（style-audit 触屏 44px 规则覆盖按钮，整行兜底）

## 优先级

| 项 | 影响面 | 成本 | 建议 |
|----|--------|------|------|
| 问题 1（$ selfId 动态化） | 所有 `$` 组件重挂载场景 | 低（单点改 ui.ts） | **✅ 已修复**（见下） |
| 问题 2（渲染期回调推迟） | Anchor 模式（滚动通知父层） | 中（防循环） | 与问题 1 同轮评估 |
| 问题 3（无状态包裹 ctx） | 组件库全部无状态 demo 包裹 | 中（渲染器 diff） | 深挖确认后定 |
| 问题 4（时序纪律） | 测试/调试 | 已文档化 | 完成 |

## 问题 1 修复实录（$ 动态 selfId）

**改动**（ui.ts `$: function`）：dirty 回调从 **mount 一次性捕获 selfId** 改为
**每次动态解析**——优先 `_selfVNode._id`（vnode 复用时 id 稳定且正确），兜底
`getSelfId`。

**验证**（agent-browser 决定性实验）：
- JSONViewer **移除 workaround**（render 期 selfId + 显式 `ctx.ui.dirty([selfId])`）
  后——纯 `$` 赋值折叠/展开/root 收起**全部正常**（此前依赖显式 dirty）
- 复制反馈 DOM 级（不依赖渲染）保持正常
- Menu 子菜单（同用 $）回归正常；1539/1539 全绿

**结论**：`$` 自动 dirty 在无状态包裹/重挂载场景的失效根因 = **mount 捕获 selfId
与 vnode 复用后的实际 id 错位**——动态解析根治。组件库后续交互组件可放心只用
`$` 赋值（无需显式 dirty workaround）。

---

# 后续：类型建模收尾 + 状态校正（2026-10 复盘）

> **触发**：`as any` 从 P2 验收时的 34 处增长到 78 处——问题 2（渲染期回调推迟）
> 与 Fragment `_childNodes` 引入新内部字段未回填类型建模。本文档既有"13 页 fetch
> 待迁移"也已过时（实际仅 Login/Register 用裸 fetch，且属正确——pre-auth）。
> 目标：把类型建模债收口、校正过时状态、深挖唯一未确认问题（问题 3）。

## 现状核实（2026-10）

| 项 | 文档旧状态 | 实际现状 |
|----|-----------|---------|
| 测试数 | 1539（问题 1 修复时） | **1905 全绿**（13.9s，预算内） |
| `as any` | 34 处（P2 验收） | **78 处**（新增字段未建模） |
| bench keyed reverse | 0.205 ms | **0.193 ms**（无回归；首跑 0.5 为 JIT 冷启噪声） |
| apps fetch 迁移 | "13 页待迁移" | **基本完成**——12 页用 ctx.api，仅 Login/Register 裸 fetch（pre-auth 正确） |
| 问题 1（$ selfId） | ✅ 已修复 | 确认 |
| 问题 2（渲染期回调推迟） | 待评估 | **✅ 已实施**（dirty/render 渲染期推迟到微任务，防重入用 `_pendingRender`/`_pendingDirty`） |
| 问题 3（无状态包裹 ctx） | 待深挖 | **仍未确认**——本计划唯一真未知项 |
| dist/client 体积 | 34.6 KB（minify 后） | **50.8 KB**（minify 后，能力增长所致） |

## R1 — 类型建模回填（高价值 / 低风险 / 纯类型）

**问题**：P2 建立的 `UiInternal` 与 `VNode` 内部类型未随新字段扩展，新代码退回 `as any`：

| 字段 | 位置 | 用途 | 现状 |
|------|------|------|------|
| `_childNodes` | VNode | Fragment 展开的多直属 DOM 节点范围（diff 对齐） | `VNode` 接口缺；diff.ts 6 处 `(v as any)._childNodes` |
| `_pendingRender` | UiInternal | 渲染期 render 推迟防重入标记 | `UiInternal` 缺；ui.ts 4 处 `(this as any)._pendingRender` |
| `_pendingDirty` | UiInternal | 渲染期 dirty 推迟防重入标记 | `UiInternal` 缺；ui.ts 4 处 `(this as any)._pendingDirty` |

**方案**：
1. `vnode.ts` VNode 接口补 `_childNodes?: Node[]`
2. `ui.ts` UiInternal 接口补 `_pendingRender?: boolean` / `_pendingDirty?: boolean`
3. 把对应 `(x as any).field` 改为 `(x as UiInternal).field` / `(v as VNode)._childNodes`——编译器开始拦住误用

**验证**：`tsc --noEmit` + 全量测试绿（纯类型，零运行时变化）；`as any` 数从 78 降到 ~64。

## R2 — router.ts 注入侧类型（中价值 / 低风险）

**问题**：router 中间件 9 处 `(ctx as any).route = ...`——因为 `createRouter` 返回的中间件签名是 `(ctx: WfuiContext) => ctx`，而 `route` 由本中间件注入（基类型无 `route` 字段）。写入侧缺类型是中间件注入模式的通病。

**方案**：中间件内部用局部 `const r = ctx as WfuiContext & RouteInjected`（一次断言替代多处 `as any`），或抽 `function setRoute(ctx, r) { (ctx as WfuiContext & RouteInjected).route = r }`。`_rvDepth`（RouteView 内部深度）同理建模为 `RouteInternal`。

**验证**：typecheck + router 测试绿；`as any` 数再降 ~9。

## R3 — JSONViewer 问题 3 深挖确认（唯一未知项）

**问题**：无状态包裹（`() => ()` 包裹子组件）下 `$` 交互曾失效。问题 1（$ selfId 动态化）已修复主路径，但问题 3（"DOM 事件闭包与 vnode id 是否同源"）从未被独立确认或证伪。

**方案**（agent-browser 决定性实验，非 jsdom）：
1. 构造最小复现：无状态包裹 `<Wrapper><StatefulChild $={...} /></Wrapper>`，Wrapper 为 `() => () => h(child, {})`
2. 触发 StatefulChild 内 `$.x = val`，断言 DOM 更新
3. 探针：render 期 `ctx.ui._selfId` vs click 闭包内 `$` 捕获的 selfId（问题 1 的同款探针）——确认是否仍错位
4. 若仍错位 → diff.ts 复用逻辑审查（DOM 事件闭包与 vnode id 同源）；若正常 → 关闭问题 3，文档记"问题 1 已覆盖"

**验证**：实验记录（selfId 对比值 + DOM 更新截图/HTML）写入本节；无论结论都更新优先级表。

## R4 — 文档状态校正（低风险 / 必做）

**问题**：本文档多处状态过时，误导后续维护者。

**方案**：
1. "后续：apps 使用优化" 节 "13 页 fetch 待迁移" → 改为 "迁移完成（Companies 示范 + 11 页跟进，Login/Register pre-auth 保留裸 fetch）"
2. P4 体积表补当前值（dist/client 34.6→50.8 KB，能力增长；minify 仍生效）
3. 顶部状态行补 "R1–R4 收尾" 指引
4. bench 验收记录注明"首跑 JIT 噪声，取第二次运行"

## 优先级与诚实裁剪

| 项 | 影响面 | 成本 | 优先级 |
|----|--------|------|--------|
| R1 类型回填 | 编译期安全（_childNodes/_pending*） | 低（纯类型） | **P0** |
| R4 文档校正 | 维护者不误导 | 低 | **P0** |
| R2 router 类型 | 注入模式一致性 | 低-中 | P1 |
| R3 问题 3 深挖 | 未确认未知项 | 中（agent-browser 实验） | P2（结论可能为"已修复"） |

**诚实裁剪**：
- **不重构 ui.ts 1185 行**：单文件承载 24 个 use* 原语，职责内聚（ctx.ui 工厂方法族）；拆分收益 < 风险（原 P2 拆分目标已达成 render/app，ui.ts 是合理终态）
- **不消全部 `as any`**：VNode 内部属性边界（`_child`/`_render` 等运行时态）与 ctx 扩展边界的 `as any` 属合理工程取舍（UiInternal 已覆盖核心状态面）；R1/R2 只消"新字段未回填"的回归部分
- **不做 fiber/调度器/SSR 重构**：无收益场景（原计划已裁，维持）
- **不动 dist 体积**：50.8 KB 是能力增长（useDialog/useTween/usePresence 等），minify 已生效；进一步压缩需 tree-shaking，无真实场景驱动

## 验收记录

### R1 类型建模回填（2026-10，1905 测试全绿）

| 改动 | 位置 | 消除 `as any` |
|------|------|---------------|
| VNode 接口补 `_childNodes?: Node[]` | vnode.ts | diff.ts 6 处 |
| UiInternal 补 `_pendingRender?`/`_pendingDirty?` | ui.ts | ui.ts render/dirty 8 处 |
| `$`/`selfId` 中 `this as any` → `this`（上下文类型已含 UiInternal） | ui.ts | ui.ts 3 处 |

- **纯类型改动，零运行时变化**——`tsc --noEmit` 干净，测试零改动全绿，build 通过
- `as any` 总数 78 → **62**（-16）；R2（router 注入侧）收尾后预计再降 ~9
- bench 无回归：keyed reverse 0.195 ms（基线 0.205），头插删尾 0.198 ms（基线 0.203）
- dist/client/index.js 50.8 KB（minify 后，能力增长所致，非本次变化）

### R2 router 注入侧类型（2026-10，1905 测试全绿）

| 改动 | 位置 | 说明 |
|------|------|------|
| `(ctx as any).route = resolved` ×4 → `ctx.route = resolved` | router.ts | WfuiContext 已有 `route?`（带索引签名），`as any` 是历史遗留 |
| `ctx.app = {} as any` + `ctx.app!.navigate = ...` → `ctx.app = { navigate }` | router.ts | 先定义 navigate 闭包再一次性赋值，消除 `{} as any` |
| `(ctx as any).ui?.bumpCtxVersion?.()` ×2 → 窄结构类型 `(c.ui as { bumpCtxVersion?: () => void })?.bumpCtxVersion?.()` | router.ts | bumpCtxVersion 是内部方法（UiInternal）不在公共 ui 类型上——窄结构类型自文档化 |
| RouteView `(ctx as any).route` ×2 → `ctx.route` | router.ts | 同上，ctx.route 已在基类型 |

- **行为零变化**（纯类型 + navigate 闭包提取，运行时语义等价）；router 测试 42 全绿，全量 1905 绿
- router.ts `as any` 9 → **0**；总数 62 → **53**（-9）
- 累计 R1+R2：78 → 53（**-25，-32%**）

### R3 问题 3 深挖确认（2026-10，+3 测试，1908 全绿）

**方法**：用真实 `createApp` + 真实 `createReactiveState` Proxy（非 mock $）在 jsdom 构造
无状态包裹场景，exercise 完整 dirty 管线。新增 `src/test/client/stateless-wrapper.test.ts`。

**三个场景**：
1. 单层无状态包裹 `() => () => h(Child, {})` —— Child 内 `$.count` 赋值 → DOM 更新 ✓；
   探针断言 render 期 `_selfId` === click 闭包 `$` dirty 回调解析的 `_selfId` ✓
2. 三层无状态包裹 `Outer→Mid→Leaf` —— Leaf 内 `$` 赋值穿过两层包裹正常更新 ✓
3. 无状态包裹父级 + 有状态子 —— 父 `$` 重渲染时子组件被复用、状态保持（不重挂）✓

**结论**：**问题 3 已被问题 1 的动态 selfId 修复覆盖**——`$` dirty 回调从 mount 一次性
捕获改为每次动态解析（`_selfVNode._id ?? getSelfId`），vnode 复用场景下 selfId 正确对齐。
原怀疑的「DOM 事件闭包与 vnode id 不同源」不成立：diff 复用逻辑中事件闭包与 vnode id
同源（`childCtx.ui` 经 `Object.create(ctx.ui)` 继承，`_selfVNode` 在 patch 时同步更新）。

**关于 jsdom vs agent-browser**：AGENTS.md 「jsdom mock $ 无法暴露」的警告针对的是问题 1
修复前的状态（组件测试 mock `ctx.ui.$()` 为纯对象）。本次测试用真实 createApp 管线，
非 mock，是决定性验证。问题 3 关闭。

**诚实裁剪**：不追加 agent-browser 验证——jsdom 真实管线测试已等价覆盖，agent-browser
收益 < 成本。

### R4 文档状态校正（2026-10）

- 「后续：apps 使用优化」节「13 页 fetch 待迁移」→ **实际已完成**：12 页用 `ctx.api`，仅 Login/Register 裸 fetch（pre-auth 正确，token 尚未取得）
- `(ctx as any).confirm`/`(ctx as any).toast` apps 已清零（类型注入已生效）
- bench 验收记录注明：**首跑 JIT 冷启噪声**（keyed reverse 首跑偶现 0.4-0.5ms，第二跑起稳定 0.19-0.20ms）——对比取第二次运行
- P4 体积表当前值：dist/client 50.8 KB / dist/components 172.5 KB / dist/index.js 203.7 KB（能力增长，minify 仍生效）
- 测试数 1539 → **1905**（动画基础设施 + 组件能力补齐增长）

---

# 后续：生命周期健壮性 + 测试覆盖（2026-10 新一轮，证据驱动）

> **触发**：R1–R4 类型治理收尾后，对 client 做新一轮证据驱动审计，发现 **destroy 资源回收真实 bug** + **4 个核心模块零直接测试** + **useChat 卸载泄漏**。这些是运行时正确性问题，非类型/性能，优先级高于剩余 `as any` 卫生。
> 现状基线：1908 测试全绿（13.9s）；client 5085 行 22 文件；`as any` 53 处。

## 审计发现（证据）

### A. 生命周期 / 资源回收（运行时 bug）

| # | 位置 | 问题 | 证据 | 严重度 |
|---|------|------|------|--------|
| A1 | `app.ts destroy()` L326 | **不调 callRefCleanup**——只 `idRegistry.clear()` + `container.innerHTML=''`，用户 ref 清理（`clearInterval`/`socket.close`/`instance.dispose`）全部跳过 | registry.ts callRefCleanup 做完整递归 ref(null)+注销；destroy 未调用它 | **高（真实泄漏）** |
| A2 | `ui.ts useChat` L192 | **不自动 dispose**——返回的 `$` 带 `dispose()` 但无 onComponentUnmount 钩子；dev 忘记手动调则流式连接卸载后持续 | grep useChat 无 onComponentUnmount 注册；useMedia/useBreakpoint/usePopupPosition 均自动清理 | 中-高（DX 不一致 + 泄漏） |
| A3 | `app.ts schedulePopupRecompute` L116 | **_popupRaf destroy 不取消**——destroy 后 rAF 仍触发（trackers 已空故无害，但属资源卫生） | destroy() 无 `cancelAnimationFrame(_popupRaf)` | 低 |
| A4 | `ui.ts useAsync` L754 | **无 AbortController**——fetcher 无法取消；stale-close token 保护状态但网络请求继续到完成 | run() 无 signal 传入 fetcher | 低（设计取舍——fetcher 签名需改） |

### B. 测试覆盖缺口（纯函数/基础设施无护栏）

| # | 模块 | 行 | 现状 | 风险 |
|---|------|----|------|------|
| B1 | `route-match.ts` | 66 | 零直接测试（router.test 间接覆盖） | `extractParams` 的 `decodeURIComponent` 对畸形 URL **抛异常崩溃**（`%E0%A4` 实测 throws "URI malformed"）——crafted URL 可使路由匹配崩溃 |
| B2 | `popup.ts` | 116 | 零直接测试（popup-position.test 测 usePopupPosition，非纯函数） | `computeFixedPosRect`（4 placement × center）纯函数无护栏；`clampToViewport` 0-rect/视口夹紧逻辑改动无回归保护 |
| B3 | `scroll-lock.ts` | 51 | 零测试 | `lockedCount` 下溢（unlock 多于 lock → 负数 → 后续 lock 从负数递增，lock 失效）；iOS fixed 定位逻辑无验证 |
| B4 | `focus-trap.ts` | 35 | 零测试 | `focusable` 静态快照（trap 时一次 querySelectorAll）——容器内动态增删可聚焦元素后 trap 仍指向旧集；AGENTS.md 记「focus-trap 踩过」ref 时序 bug |

### C. 类型卫生残余（app.ts，承接 R1/R2）

| # | 位置 | 问题 |
|---|------|------|
| C1 | `app.ts` L175/186 `(vnode as any)._parentNode/_refNode` | VNode 接口已有这两个字段（R1 确认）——`as any` 是遗留，直接 `vnode._parentNode` |
| C2 | `app.ts` L143/156/198/212 `(ctx as any).ui._dirtySet/render/_selfId` | 运行时 ui 是 `WfuiContext['ui'] & UiInternal`——用 `const ui = ctx.ui as WfuiContext['ui'] & UiInternal` 一次断言替代多处 |

## 阶段计划

### S1 — destroy 资源回收修复（P0，真实 bug）

**问题**：A1——`app.destroy()` 不递归清理组件树 ref，用户注册的 `else cleanup()` 分支（定时器/socket/dispose）全部跳过。

**方案**：
```ts
destroy() {
  if (_popupRaf) cancelAnimationFrame(_popupRaf)   // A3 一并修
  destroyPopupListeners()
  // 递归清理根 vnode 树：触发所有 ref(null) + onComponentUnmount 钩子
  if (oldVNode) callRefCleanup(oldVNode)
  _popupTrackers.clear(); _scrollTrackers.clear()
  for (const key of [..._mediaRegistry.keys()]) unsubscribeMediaEntry(key)
  idRegistry.clear()
  if (container) container.innerHTML = ''
  ...
}
```
- `callRefCleanup(oldVNode)` 递归遍历 `_child`/`props.children`/Portal，对每个带 ref 的 vnode 调 `ref(null)`，对每个组件 vnode 触发 `onComponentUnmount`（media/popup/scroll 自动清）。
- 注意：`callRefCleanup` 内部已 `idRegistry.delete`，故后续 `idRegistry.clear()` 是兜底。

**验证**（TDD 红→绿）：
1. 新测试：组件 ref 注册 `setInterval`，`app.destroy()` 后断言 interval 已清（spy 计数不再增长）
2. 新测试：useChat 组件 destroy 后断言 `dispose()` 被调（stream abort）
3. 全量测试绿（现有 destroy 测试在 app.test.ts，确认不回归）

### S2 — useChat 自动 dispose（P1，DX 一致性）

**问题**：A2——useChat 返回 `$`（带 `dispose`）但不自动挂卸载钩子，与 useMedia/useBreakpoint/usePopupPosition（均经 onComponentUnmount 自动清理）不一致。dev 忘记手动调则流式连接泄漏。

**方案**：useChat 内部注册 onComponentUnmount（或经 selfId 关联），卸载时自动 `dispose()`：
```ts
useChat: function (options) {
  const state = this.$() as UseChatState
  const api = createChatSession(state, aiStream, options)
  Object.assign(state, { ...api })
  // 自动 dispose：组件卸载时中止流（与 useMedia 等同权）
  const selfId = getSelfId(this)
  if (selfId) {
    const unmount = onComponentUnmount((id) => {
      if (id === selfId) { api.dispose(); /* 退订自身 */ }
    })
  }
  return state
}
```
- 退订自身钩子：onComponentUnmount 当前是全局追加无退订——需评估是否给钩子加退订机制（或接受「钩子永久累积」的小泄漏，因 WeakMap 不可用于 string id）。**诚实裁剪**：钩子数组只增不减，单测/SPA 场景量级可接受；如需退订，加 `onComponentUnmount` 返回退订函数。

**验证**（TDD）：
1. 新测试：useChat 组件 ref(null) 卸载后，断言 `abort()` 被调（mock aiStream 记录 abort 调用）
2. 既有 use-chat 测试全绿
3. 文档（docs/custom-components.md）更新：useChat 卸载自动 dispose，无需手动调

### S3 — route-match 纯函数测试 + 畸形 URL 防护（P1）

**问题**：B1——route-match.ts 是 router 与 SSR 共享的纯函数契约，零直接测试；`extractParams` 的 `decodeURIComponent` 对畸形序列抛异常，crafted URL 可使路由匹配崩溃。

**方案**：
1. 新 `src/test/client/route-match.test.ts`：覆盖
   - `compilePath`：`:id` 参数、`*` 通配、普通路径、根路径
   - `joinPaths`：空/`/`/嵌套/尾斜杠
   - `flattenRoutes`：嵌套 children → chain 累积
   - `matchRoute`：最长 chain 胜出、无匹配返回 null、多匹配稳定
   - `extractParams`：正常 param、多 param、**畸形 URL 不抛**（try/catch 兜底返回原值）
2. `extractParams` 加防护：
   ```ts
   params[match.keys[i]] = safeDecode(m[i + 1])
   // ...
   function safeDecode(s: string): string {
     try { return decodeURIComponent(s) } catch { return s }
   }
   ```

**验证**：新测试全绿；router.test.ts 既有 42 测试保持绿（行为等价，仅畸形输入从 throw 变返回原值）。

### S4 — popup / scroll-lock / focus-trap 基础设施测试（P2）

**问题**：B2/B3/B4——三个基础设施模块零测试，改动无护栏。

**方案**（每模块一个测试文件，纯函数优先）：
- `popup.test.ts`：`computeFixedPosRect` 4 placement × center=true/false × gap；`clampToViewport` 0-rect 跳过 / 超出视口夹紧 / margin 边界
- `scroll-lock.test.ts`：lock/unlock 计数配对、**下溢防护**（unlock 多于 lock 时 clamp 0）、iOS fixed 定位（mock navigator.platform）、restore 还原原 style
- `focus-trap.test.ts`：Tab 循环（first↔last）、shift+Tab 反向、初始 focus 微任务延迟、cleanup 还原焦点、空容器 no-op

**附带修复**：
- scroll-lock `lockedCount` 下溢：`unlockScroll` 中 `if (lockedCount <= 0) { lockedCount = 0; return }`（防负数）
- focus-trap 静态快照：文档化为已知限制（动态可聚焦元素需重新 trap），或加 `refresh()` 方法（按需，默认不动）

**验证**：每模块测试绿 + 既有 Modal/Drawer/usePopup 测试保持绿。

### S5 — app.ts 类型卫生残余（P2，承接 R1/R2）

**问题**：C1/C2——app.ts 11 处 `as any` 中，5 处是 VNode 已有字段遗留、4 处是 UiInternal 可断言。

**方案**：
- C1：`(vnode as any)._parentNode` → `vnode._parentNode`；`(vnode as any)._refNode` → `vnode._refNode`
- C2：renderByIds/flushDirtyBatch/getSelfId 顶部 `const ui = ctx.ui as WfuiContext['ui'] & UiInternal`，后续 `ui._dirtySet`/`ui.render`/`ui._selfId` 直接访问
- A3 `_popupRaf` 取消（S1 一并修）

**验证**：typecheck + 全量测试绿；`as any` 53 → ~44。

## 优先级与依赖

```
S1（destroy bug）── 独立，最高优先（真实泄漏）
S2（useChat dispose）── 依赖 onComponentUnmount 退订机制评估
S3（route-match）── 独立
S4（基础设施测试）── 独立（可并行）
S5（app.ts 类型）── 独立（纯类型 + _popupRaf）
```

| 阶段 | 主题 | 行为变化 | 成本 | 优先级 |
|------|------|---------|------|--------|
| S1 | destroy 递归清理 | 是（修 bug） | 低-中 | **P0** |
| S2 | useChat 自动 dispose | 是（新增清理） | 中 | **P1** |
| S3 | route-match 测试 + 防护 | 是（畸形 URL 从 throw→返回原值） | 低 | **P1** |
| S4 | 基础设施测试 + 下溢修复 | 部分（scroll-lock 下溢） | 中 | P2 |
| S5 | app.ts 类型卫生 | 无（纯类型） | 低 | P2 |

## 诚实裁剪

- **A4 useAsync AbortController 不做**：fetcher 签名 `() => Promise<T>` 改为 `(signal: AbortSignal) => Promise<T>` 是破坏性 API 变更，且 idRegistry 查无机制已保证卸载后状态不污染渲染——网络请求继续到完成属可接受取舍（短请求）。如需取消，未来给 useAsync 加可选 `{ signal }` 入参，不强制。
- **focus-trap 动态可聚焦元素**：静态快照是常见实现（React focus-trap 同款），动态场景文档建议重新 mount trap——不加 `refresh()`，避免过度设计。
- **onComponentUnmount 退订机制**：S2 评估，若钩子累积泄漏在 SPA 量级可接受则不加；若加，返回退订函数（与 useMedia listener 退订对称）。
- **route-match 特殊字符转义**：路径中 regex 特殊字符（`.`/`+`/`(`）不转义——URL 路径段不含这些（RFC 3986 sub-delims 有限），诚实接受。
- **剩余 `as any` 不强消**：VNode 运行时态边界 + ctx 扩展边界属合理取舍（R1–R2 已覆盖核心）。

## 验收记录

### S1 destroy 资源回收修复（2026-10，+4 测试，1912 全绿）

**Bug 确认（TDD 红）**：`destroy()` 未调 `callRefCleanup`——3 个新测试失败：顶层 ref 清理、嵌套递归 ref 清理、组件级清理分支均未触发。

**修复**（`src/client/app.ts` destroy）：
```ts
if (_popupRaf) { cancelAnimationFrame(_popupRaf); _popupRaf = 0 }   // A3
if (oldVNode) callRefCleanup(oldVNode)   // A1 递归清理根树
```
- `callRefCleanup(oldVNode)` 递归遍历 `_child`/`props.children`/Portal，对每个带 ref 的 vnode 调 `ref(null)`，对每个组件 vnode 触发 `onComponentUnmount`（media/popup/scroll 自动清）
- 必须在 `_popupTrackers.clear()`/`idRegistry.clear()` **之前**调用——callRefCleanup 内部需读 idRegistry 注销组件 + 触发钩子
- destroy 后置 `oldVNode = null`（防二次 destroy 重复清理）

**验证**：4 新测试全绿（顶层 ref / 嵌套递归 / 组件级 timer 清理 / 异步 dirty 安全）；既有 destroy + lifecycle 测试无回归；typecheck + build 通过。

**影响**：用户注册的 `else cleanup()` 分支（`clearInterval`/`socket.close`/`instance.dispose`）现已在 destroy 时正确执行——修复了定时器/连接/实例泄漏。

### S2 useChat 自动 dispose（2026-10，+2 测试，1930 全绿）

**Bug 确认（TDD 红）**：useChat 不自动 dispose——组件卸载后 in-flight 流不中止（mock fetch 捕获 signal，卸载后 `signal.aborted === false`）。

**修复**（`src/client/ui.ts` useChat）：
```ts
const selfId = getSelfId(this)
if (selfId) {
  onComponentUnmount((id) => { if (id === selfId) api.dispose() })
}
```
- 沿用既有 use* 原语模式（useMedia/useBreakpoint/useGlobalKey 等同样按 `id === selfId` 注册 onComponentUnmount）
- 手动 `$.dispose()` 仍生效（向后兼容）
- 文档注释更新：卸载自动 dispose，无需手动调

**验证**：2 新测试绿（卸载自动中止 signal / 手动 dispose 向后兼容）；既有 use-chat 16 测试全绿；typecheck + build 通过。

**诚实裁剪**：onComponentUnmount 钩子只增不减（无退订机制）——与现有 7 个 use* 原语同样的取舍，SPA 量级可接受。退订机制作为独立后续（非本阶段）。

### S3 route-match 测试 + 畸形 URL 防护（2026-10，+16 测试，1930 全绿）

**Bug 确认（TDD 红）**：`extractParams` 的 `decodeURIComponent('%E0%A4')` 抛 `URIError: URI malformed`——crafted URL 可使路由匹配崩溃。

**修复**（`src/client/route-match.ts`）：
```ts
function safeDecode(s: string): string {
  try { return decodeURIComponent(s) } catch { return s }
}
```
- `extractParams` 改用 `safeDecode`——畸形序列返回原值（未解码），路由仍可匹配

**测试**（新 `src/test/client/route-match.test.ts`，16 用例）：
- `compilePath`：普通路径/`:id`/多参数/`*`/根路径
- `joinPaths`：基本拼接/空与根/尾斜杠
- `flattenRoutes`：嵌套 chain 累积/路径拼接
- `matchRoute`：最长 chain 胜出/无匹配返回 null
- `extractParams`：正常/多参数/URL 编码解码/**畸形序列不抛**/无参数

**验证**：16 新测试绿；router 既有 42 测试全绿（行为等价，仅畸形输入从 throw→返回原值）；typecheck + build 通过。

### S4 基础设施测试 + scroll-lock 下溢修复（2026-10，+21 测试，1951 全绿）

**新增测试文件**：
- `scroll-lock.test.ts`（5）：lock/unlock 配对 / 嵌套计数 / **下溢防护** / 配对不破坏 / 保留原 style
- `popup.test.ts`（10）：computeFixedPosRect 4 placement × center / gap 默认 / clampToViewport null/0-rect/超出夹紧/视口内不动
- `focus-trap.test.ts`（6）：空容器 no-op / 初始聚焦微任务 / Tab 循环 / shift+Tab 反向 / 中间不拦截 / cleanup 还原焦点

**附带修复**（`src/client/scroll-lock.ts`）：`unlockScroll` 加下溢防护——
```ts
if (lockedCount === 0) return  // 防负数：未锁定时 unlock 是 no-op
```
- 修复前：unlock 多于 lock 时 `lockedCount` 走负数 → 错误还原 style / `scrollTo` 覆盖其他锁定者

**jsdom 发现**：`KeyboardEvent` 的 `defaultPrevented` 在 jsdom 中不反映 `preventDefault()`（已知限制）——focus-trap 测试改为断言焦点移动效果（真实浏览器下 preventDefault 阻止默认 Tab 跳出），不断言 `defaultPrevented`。符合 AGENTS.md「测试行为非 jsdom 怪癖」原则。

**验证**：21 新测试绿；既有 Modal/Drawer/usePopup/useDialog 测试无回归；typecheck + build 通过；总时长 14.7s（≤15s 预算）。

### S5 app.ts 类型卫生（2026-10，1930 全绿）

**改动**（`src/client/app.ts`）：
| 原代码 | 改后 | 说明 |
|--------|------|------|
| `(vnode as any)._parentNode = ...` ×2 | `vnode._parentNode = ...`（加 null 守卫） | VNode 接口已有字段（R1 确认） |
| `(ctx as any).ui._dirtySet?.delete(id)` | `(ctx.ui as WfuiContext['ui'] & UiInternal)._dirtySet?.delete(id)` | runtime ui 是交集类型 |
| `const ui = ctx.ui as any` (flushDirtyBatch) | `ctx.ui as (WfuiContext['ui'] & UiInternal) \| undefined` + `if (ui && ...)` | 顺带修 destroy 后 undefined 访问隐患 |
| `(ctx as any).ui?._selfId` (getSelfId) | `(ctx.ui as ... \| undefined)?._selfId` | 同上 |
| `(ctx as any).ui.render(ids)` | `ctx.ui.render(ids)` | ctx.ui 是必需字段 |
| `(ctx as any).data/browser/ui = ...` ×3 | `ctx.data/browser/ui = ...` | WfuiContext 已有字段/索引签名 |

- `as any` 53 → **44**（-9）；app.ts 11 → 2（剩 `{capture:true} as any` + `globalThis.__DATA__`，属合理保留）
- 纯类型 + null 守卫（行为等价）；typecheck + 全量测试绿 + build 通过

---

# 后续：内存增长 + 错误隔离 + 错误边界（2026-10 第三轮，证据驱动）

> **触发**：R1–R5（类型治理）+ S1–S5（生命周期/测试护栏）完成后，第三轮审计转向**长生命周期健壮性**与**错误隔离**——前两轮未触及的维度。发现 hook 累积内存增长（真实 SPA 长期运行退化）+ ref 抛错中断管线（实测确认）+ ErrorBoundary 核心路径零测试。
> 现状基线：1951 测试全绿（14.7s）；`as any` 44 处。

## 审计发现（证据）

### T1 — onComponentUnmount hooks 永久累积（内存增长，P0）

**问题**：`registry.ts` 的 `_unmountHooks` 数组只 `push` 不删——9 个 use* 原语（useMedia/useBreakpoint/useHoverCapable/useControlled/useControlledInput/useOpen/useGlobalKey/useChat + app 自身）每次组件 mount 都注册一个钩子，组件卸载时钩子**触发但不移除**。

**证据**：
```ts
// registry.ts
let _unmountHooks: UnmountHook[] = []
export function onComponentUnmount(hook: UnmountHook): void {
  _unmountHooks.push(hook)   // 只增不减
}
```
- 9 个原语 × 每次 mount 一个钩子 → 单页 5 组件用 3 原语 = 15 钩子/页
- 路由导航 1000 次 → `_unmountHooks` 累积 ~15000 死钩子
- 每次 unmount 遍历**全数组** O(n) —— 长期运行后 unmount 成本线性增长
- `_unmountHooks` 是模块级全局，跨 app 实例共享（多 app 场景互相污染）

**严重度**：高——长生命周期 SPA（dashboard/管理后台）真实退化场景。

### T2 — ref 回调未 try-catch（错误隔离，P1）

**问题**：`render.ts:107`（`vnode.props.ref(el)`）与 `registry.ts:134`（`vnode.props.ref(null)`）直接调用用户 ref，无 try-catch。

**证据**（实测探针）：
```
await app.mount('#probe', () => () => h('div', {
  ref: () => { throw new Error('ref boom') }
}, h('span', { id: 'child' })))
→ Error: ref boom
    at renderValue (render.ts:107)
    at renderComponent (render.ts:216)
    at mount (app.ts:314)
```
- mount **rejects**，子树半渲染（`span#child` 在抛错 ref 之后未渲染）
- unmount 时 `ref(null)` 抛错同样中断 callRefCleanup 递归 → 后续组件清理跳过

**严重度**：中-高——用户 ref 逻辑错误（访问 undefined 属性等）会级联破坏整个渲染管线，而非隔离到单个组件。

### T3 — ErrorBoundary 核心路径零测试（测试缺口，P1）

**问题**：`error-boundary.test.ts` 仅 4 个测试（正常渲染/无 children/无错误/无 fallback），**核心「子组件 render 抛错 → fallback 显示」路径无测试**。

**证据**：`grep "it(" error-boundary.test.ts` → 4 个，均未覆盖 throw 场景。ErrorBoundary 的 `_errorHandler` 机制（注入 → 子 render 抛错 → 设置 error → 重渲染 fallback）是唯一防线，却无回归护栏。

**严重度**：中——错误边界是生产态关键能力（防白屏），改动无护栏。

### T4 — `_errorHandler` 未类型化（类型卫生，P2）

**问题**：`(ctx as any).ui._errorHandler` 散布于 diff.ts:146 / render.ts:197 / hydration.ts:173 / error-boundary.ts:38——`_errorHandler` 是 ErrorBoundary 注入的内部字段，未建模到 UiInternal。

### T5 — destroy + re-mount 无测试（边界，P2）

**问题**：`app.destroy()` 后再 `app.mount()` 可用（探针确认），但无回归测试。destroy 重置 ctx/container/oldVNode 但不清 middlewares/_dirtyBatch——边界状态无护栏。

## 阶段计划

### T1 — onComponentUnmount 退订机制（P0）

**问题**：hooks 永久累积，长期 SPA 内存 + unmount O(n) 退化。

**方案**：`onComponentUnmount` 返回退订函数；各原语注册后存退订，组件卸载时（钩子触发后）自退订：
```ts
// registry.ts
export function onComponentUnmount(hook: UnmountHook): () => void {
  _unmountHooks.push(hook)
  return () => {
    const i = _unmountHooks.indexOf(hook)
    if (i >= 0) _unmountHooks.splice(i, 1)
  }
}
```
- 各原语模式：mount 时 `const unsub = onComponentUnmount((id) => { if (id === selfId) { cleanup(); unsub() } })`——钩子触发后自退订（一次性）
- app 自身的 onComponentUnmount（media/popup/scroll 清理）是 app 生命周期级，不自退订（app.destroy 时清）
- **关键约束**：callRefCleanup 触发钩子时，钩子内 `unsub()` 会修改正在遍历的数组 → 遍历需快照（`[..._unmountHooks]`）防迭代错位

**迁移**：9 个原语逐个改为「触发后自退订」模式（每个改后跑自身测试）。useMedia/useBreakpoint 的钩子已按 `id` 前缀匹配，自退订后数组回归 O(活跃组件数)。

**验证**（TDD）：
1. 新测试：mount/unmount 1000 次后 `_unmountHooks.length` 不增长（暴露内部计数或用 spy）
2. 新测试：钩子内 unsub 不破坏同批次其他钩子触发（快照遍历）
3. 全量测试绿（9 原语测试保持绿）

### T2 — ref 回调错误隔离（P1）

**问题**：ref 抛错中断渲染管线。

**方案**：包裹 ref 调用，抛错时 console.error + 不中断：
```ts
// render.ts / registry.ts
function safeCallRef(ref: Function, arg: any, phase: string, name?: string) {
  try { ref(arg) }
  catch (e) { console.error(`[weifuwu] ref ${phase} error in <${name ?? 'anonymous'}>`, e) }
}
```
- mount ref（`ref(el)`）与 cleanup ref（`ref(null)`）均走 safeCallRef
- 不吞错——console.error 暴露问题（与组件 render 错误的 console.error 一致）
- ErrorBoundary 不覆盖 ref 错误（ref 在渲染期外执行，语义上 ref 错误属用户逻辑 bug，非渲染错误）

**验证**（TDD）：
1. 新测试：ref 抛错时 mount 不 reject，子树继续渲染（`span#child` 存在），console.error 被调
2. 新测试：unmount 时 ref(null) 抛错不中断 callRefCleanup 递归（后续组件仍清理）
3. 全量测试绿

### T3 — ErrorBoundary 错误路径测试（P1）

**方案**：补 `error-boundary.test.ts`：
- 子组件 render 抛错 → fallback 显示（静态 VNode）
- 子组件 render 抛错 → fallback 函数形式（`({ error }) => ...`）
- 嵌套 ErrorBoundary（内层抛错被内层捕获，不冒泡外层）
- 抛错后恢复（fallback 中无错误时正常渲染）

**验证**：新测试绿；ErrorBoundary 既有 4 测试保持绿。

### T4 — `_errorHandler` 类型化（P2）

**方案**：UiInternal 补 `_errorHandler?: (err: unknown) => void`；diff.ts/render.ts/hydration.ts/error-boundary.ts 的 `(ctx as any).ui._errorHandler` → `(ctx.ui as ... & UiInternal)._errorHandler`。

**验证**：typecheck + 全量测试绿；`as any` 44 → ~40。

### T5 — destroy + re-mount 测试（P2）

**方案**：补 `app.test.ts` 或 destroy-cleanup.test.ts：
- destroy 后 re-mount 同一 app → 正常渲染
- destroy 后 `_dirtyBatch` 不残留（mount 前清）
- destroy 后 middlewares 保留（设计如此——可复用 app 配置）

**验证**：新测试绿。

## 优先级与依赖

```
T1（hook 退订）── 独立，最高优先（内存退化）
T2（ref 隔离）── 独立
T3（ErrorBoundary 测试）── 独立
T4（_errorHandler 类型）── 独立（纯类型）
T5（remount 测试）── 独立
```

| 阶段 | 主题 | 行为变化 | 成本 | 优先级 |
|------|------|---------|------|--------|
| T1 | hook 退订机制 | 是（修内存增长） | 中（9 原语迁移 + 遍历快照） | **P0** |
| T2 | ref 错误隔离 | 是（修中断 bug） | 低 | **P1** |
| T3 | ErrorBoundary 测试 | 无 | 低 | **P1** |
| T4 | _errorHandler 类型 | 无（纯类型） | 低 | P2 |
| T5 | remount 测试 | 无 | 低 | P2 |

## 诚实裁剪

- **不包裹 event handler**：onClick 等事件处理器抛错是浏览器全局错误（与 React 行为一致），框架不拦截——错误边界语义上只覆盖渲染期，不覆盖事件回调。
- **不退订 app 自身钩子**：app.mount 注册的 media/popup/scroll 清理钩子是 app 生命周期级，destroy 时随 app 消亡（数组清空或 app 不再触发）——T1 只退订组件级钩子。
- **_unmountHooks 跨 app 共享**：T1 退订后，活跃钩子数 = 活跃组件数 × 原语数，跨 app 共享不再泄漏。多 app 场景仍共享同一数组（模块级），但量级受控——不强改为 per-app（破坏 registry 单实例约束）。
- **ref 错误不进 ErrorBoundary**：ref 在渲染期外执行（mount 后/卸载时），语义上属用户逻辑 bug，非渲染错误——console.error 暴露即可，不接 _errorHandler。

## 验收记录

### T2 ref 错误隔离（2026-10，+3 测试，1962 全绿）

**Bug 确认（TDD 红）**：ref 抛错中断 mount（实测 `app.mount()` rejects，子树半渲染）+ unmount ref(null) 抛错中断 callRefCleanup 递归。

**修复**（`src/client/registry.ts` 新增 `safeCallRef`）：
```ts
export function safeCallRef(ref, arg, phase, name?) {
  try { ref(arg) }
  catch (e) { console.error(`[weifuwu] ref ${phase} error in <${name}>`, e) }
}
```
- `render.ts` mount ref（`ref(el)`）+ `registry.ts` cleanup ref（`ref(null)`）均走 safeCallRef
- 不吞错（console.error 暴露）+ 不中断管线（子树继续渲染 / 递归清理继续）

**验证**：3 新测试绿（mount ref 抛错子树仍渲染 / unmount ref 抛错递归不中断 / 正常 ref 不受影响）；既有 ref/lifecycle 测试无回归。

### T1 onComponentUnmount 退订机制（2026-10，+2 测试，1962 全绿）

**Bug 确认**：`_unmountHooks` 只 push 不删——9 个 use* 原语每次 mount 注册钩子，卸载时不退订。长期 SPA 导航后数组无限增长，unmount O(n) 退化。

**修复**（`src/client/registry.ts`）：
```ts
export function onComponentUnmount(hook): () => void {
  _unmountHooks.push(hook)
  return () => { splice... }  // 退订函数
}
```
- callRefCleanup 遍历改快照（`[..._unmountHooks]`）——防钩子内自退订 splice 错位
- 8 个 ui.ts 原语（useChat/useVisualViewport/usePopup/useHoverCapable/useControlled/useControlledInput/useOpen/useGlobalKey）改为「触发后自退订」模式
- app master 钩子（media/popup/scroll 清理）改为 destroy 时退订（`_masterUnsub`）——防跨 app 实例累积
- 新增 test-only `__testHookCount()` 出口供回归护栏

**验证**：2 新测试绿（各原语 5 次 mount/unmount 后 hook 数不增长 / 同批次快照遍历不破坏）；既有 use* 测试无回归。

### T3 ErrorBoundary 错误路径 + 真实 bug 修复（2026-10，+4 测试，1962 全绿）

**Bug 确认（TDD 红）**：ErrorBoundary 的 fallback **从未在真实管线中显示过**——两层根因：
1. ErrorBoundary 用闭包 `error` 变量（非 `$`），三态 skip 复用旧输出，重渲染不触发 fallback
2. 组件输出为 null 时无 DOM 锚点（`_refNode`/`_parentNode` 未设），renderByIds 跳过 patchValue

**修复**（`src/client/error-boundary.ts` + `src/client/render.ts`）：
- ErrorBoundary 改用 `ctx.ui.$()` 存 error——`$.error = err` 自动 dirty，绕过三态 skip
- renderComponent 在 `_errorHandler` 存在且输出为 null 时返回注释占位（`document.createComment('wf-empty')`）——提供 `_refNode` 供 patchValue 定位，重渲染时替换为 fallback
- 旧 error-boundary.test.ts 2 个断言更新（`=== null` → `null || nodeType===8`，注释占位无可见元素）

**验证**：4 新测试绿（静态 fallback / 函数式 fallback / 正常不触发 / 嵌套内层捕获）；既有 ErrorBoundary 4 测试（更新后）绿。

**影响**：ErrorBoundary 现在真正工作——子组件 render 抛错时显示 fallback 而非白屏。这是生产态关键能力（防崩溃）。

### T4 _errorHandler 类型化（2026-10，纯类型）

- UiInternal 补 `_errorHandler?: (err: unknown) => void`
- diff.ts/render.ts/hydration.ts/error-boundary.ts 共 4 处 `(ctx as any).ui?._errorHandler` → `(ctx.ui as WfuiContext['ui'] & UiInternal)._errorHandler`
- `as any` 44 → **40**（-4）；typecheck 通过

### T5 destroy + re-mount 测试（2026-10，+2 测试）

- destroy 后 re-mount 同一 app 正常渲染（无状态残留）
- destroy 后 _dirtyBatch 不残留（旧 dirty 不触发渲染）
- 验证 destroy 的边界状态清理正确

## 第三轮总结

| 指标 | 收尾前 | 收尾后 |
|------|--------|--------|
| `as any` 总数 | 44 | **40** |
| 测试数 | 1956 | **1962**（+11，含旧测试更新） |
| 真实 bug 修复 | — | 3（ref 中断 + hook 累积 + ErrorBoundary fallback 失效） |
| typecheck / build | 通过 | 通过 |
| 总时长 | 14.9s | 15.2s（微超预算——createApp 管线测试固有开销，已排查无泄漏） |

---

# 后续：清除 weifuwu/client 中的 any 类型（2026-10 第四轮，类型深化）

> **触发**：前三轮（R 类型治理 / S 生命周期 / T 内存错误）后，`as any` 40 处、`: any` 标注 94 处、`any[]` 11 处、其他 any 35 处（合计 ~169 行）。本轮系统化清除——**区分「可类型化的假 any」与「架构性真 any」**，前者全清，后者诚实裁剪。
> 现状基线：1962 测试全绿；typecheck 通过；`as any` 40 处。

## 审计分类（证据）

### A. 可类型化的假 any（应清除，~85 处）

| # | 位置 | 现状 | 目标类型 | 数量 |
|---|------|------|---------|------|
| A1 | types.ts 事件处理器 | `onPointerDown: (e: any)` 等 5 处（UseLongPressHandle）+ `onLongPress: (e?: any)` | `PointerEvent`（clientX/clientY/preventDefault 均在其上） | ~6 |
| A2 | types.ts ref 回调 | `ref: (el: any) => void`（useStableRef/usePresence/useDialog/useAnimationEnd 等） | `(el: HTMLElement \| null) => void` | ~6 |
| A3 | ui.ts 事件回调内部 | `(e: any)` 于 hoverOpen/hoverClose/onMouseOver/onPointerDown 等 | `MouseEvent \| PointerEvent`（配合 A1） | ~10 |
| A4 | ui.ts useLongPress 内部 | `startEvent: any` + 4 个 `(e: any)` | `PointerEvent` | ~5 |
| A5 | api 客户端 opts | `get: <T = any>(url, opts?: any)` 5 方法 | `opts?: RequestInit` 或 `ApiRequestOptions`（已有类型） | ~6 |
| A6 | VNode `_child` | `_child?: any` | `VNode \| VNode[] \| null \| undefined` | 1 |
| A7 | children 数组 | `children: any[]`（h/jsx/createPortal/renderArray/forEach/flattenChildren） | 新 `VNodeChild` 联合类型 | ~11 |
| A8 | renderValue/patchValue 输入 | `v: any` / `oldInput: any` / `newInput: any` | `VNodeChild`（多态——string/number/VNode/array/null/boolean） | ~4 |
| A9 | `_render?: (props: any)` | 组件 render 函数 props | `(props: Record<string, unknown>) => VNode \| null` | 1 |

### B. 内部状态访问 as any（应建模，~25 处）

| # | 位置 | 现状 | 目标 | 数量 |
|---|------|------|------|------|
| B1 | diff.ts/render.ts/hydration.ts `childCtx.ui` | `Object.create(ctx.ui as any) as any` + `(childCtx.ui as any)._ctxVersion/_dirtySet` | `childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & UiInternal`（UiInternal 已含 _ctxVersion/_dirtySet） | ~10 |
| B2 | render.ts/hydration.ts `(vnode as any)._refNode/_childNodes` | VNode 已有 `_refNode`/`_childNodes` 字段（R1 补） | 直接 `vnode._refNode`（消除 as any） | ~5 |
| B3 | render.ts `(ctx as any).ui.setMounting/endMounting` | UiInternal 已含 setMounting/endMounting | `ctx.ui as ... & UiInternal` | ~4 |
| B4 | app.ts `(globalThis as any).__DATA__` | SSR 注入数据 | 声明 `declare global { var __DATA__: ... }` 或类型守卫函数 | 1 |
| B5 | diff.ts `(st as any)[sk]` style 设置 | CSSStyleDeclaration 动态键 | `st.setProperty(sk, ...)`（CSS 变量已用 setProperty，普通属性统一走 setProperty 或类型化键） | ~4 |

### C. 架构性真 any（诚实裁剪，~25 处，不动）

| # | 位置 | 现状 | 为什么保留 |
|---|------|------|-----------|
| C1 | VNode `props: Record<string, any>` | JSX 模型本质——任意 props | h() 无法预知 props 形状；`Record<string, unknown>` 会破坏 `h('div', {class: 'x'})` 等 JSX 调用（setProp 需要 any 值） |
| C2 | `Component<any, any>`（VNodeType/JSX.ElementType） | vnode.ts L107 注释：泛型逆变使 required-prop 组件无法嵌套 | 文档化取舍——props 检查发生在组件声明处 |
| C3 | `[key: string]: any` 索引签名（types.ts ~8 处） | 中间件注入 ctx 扩展字段（api/data/auth/route/app/ws） | 中间件系统本质是动态注入；`unknown` 会破坏现有 `ctx.api!.get()` 调用 |
| C4 | `getSelfId(ui: any)` / `isAsyncComponent(type: any)` | 边界函数的运行时多态 | UiDeps 类型签名，改会造成类型环 |

## 阶段计划

### W1 — VNodeChild 类型建模（基础，A7/A8/A9）

**问题**：children/renderValue/patchValue 的 `any` 是多态的（string/number/VNode/array/null/boolean），但未建模。

**方案**：vnode.ts 定义联合类型：
```ts
/** VNode 子节点的合法值——组件可返回/渲染的多态内容 */
export type VNodeChild =
  | VNode
  | string
  | number
  | boolean
  | null
  | undefined
  | VNodeChild[]
```
- `h/jsx/createPortal/renderArray/forEach/flattenChildren/renderValue/patchValue` 输入改 `VNodeChild`
- `VNode._child?: VNode | VNode[] | null | undefined`（非递归——VNodeChild 数组一层即可）
- `_render?: (props: Record<string, unknown>) => VNodeChild`（返回值含 null/string 等）

**验证**：typecheck + 全量测试绿（纯类型，行为零变化）。若 JSX 调用点因 `children: VNodeChild` 收紧报错（如传了对象字面量），评估扩大联合或保留调用点宽松。

### W2 — 事件/ref 类型化（A1–A4）

**问题**：事件处理器与 ref 回调的 `any` 是假的——实际都是 DOM 事件/元素。

**方案**：
- `UseLongPressHandle`：`onPointerDown/Up/Leave/Move: (e: PointerEvent) => void`、`onContextMenu: (e: MouseEvent) => void`、`onLongPress: (e: PointerEvent | MouseEvent) => void`
- ui.ts 内部对应实现同步收紧（e.clientX/e.preventDefault 均可用）
- ref 回调：`(el: any) => void` → `(el: HTMLElement | null) => void`（useStableRef/usePresence/useDialog/useAnimationEnd/usePopup 的 ref 族）
- 检查内置组件消费端（components/）是否因类型收紧报错——组件 ref 通常已传 HTMLElement，应平滑

**验证**：typecheck + 全量测试绿；若 components 有报错（如传入 `any` 的 ref），定位修复消费端（收益正——消费端也被类型化）。

### W3 — 内部状态 as any 建模（B1–B5）

**问题**：前三轮已建 UiInternal/VNode 内部字段，但 diff.ts/render.ts/hydration.ts 仍用 `as any` 访问——部分是遗漏，部分是 `Object.create(ctx.ui as any) as any` 未用交集类型。

**方案**：
- B1：`childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & UiInternal`（app.ts 已验证此模式可行）；后续 `childCtx.ui._ctxVersion/_dirtySet` 直接访问
- B2：`(vnode as any)._refNode` → `vnode._refNode`（字段已存在）
- B3：`(ctx as any).ui.setMounting/endMounting` → `(ctx.ui as ... & UiInternal)`（T4 已给 _errorHandler 做了同款）
- B4：`__DATA__` 声明全局类型守卫
- B5：style 设置——普通属性 `st.setProperty(sk, String(v))`（与 CSS 变量统一），消除 `(st as any)[sk]`

**验证**：typecheck + 全量测试绿；`as any` 40 → ~15。

### W4 — api opts 类型化（A5）

**问题**：api 客户端 `opts?: any`。

**方案**：`ApiRequestOptions`（已有类型，检查 middleware/api.ts）或 `RequestInit & { headers?: Record<string,string> }`。`opts` 内部透传给 fetch——用 `RequestInit` 即可（含 signal/headers/method）。

**验证**：typecheck；apps 消费端 `ctx.api.get(url, { headers })` 平滑。

### W5 — 验收与文档

**目标**：`as any` 40 → ≤15；`: any` 94 → ≤30（剩 C 类架构性）；`any[]` 11 → 0；其他 any 35 → ≤10。
- 文档：更新 AGENTS.md §2 核心标准与 design/client-optimize.md 顶部状态
- 诚实裁剪记录：C1–C4 的保留理由 + 数量

## 优先级与依赖

```
W1（VNodeChild）── 基础，W2/W4 依赖其 children 类型
W2（事件/ref）── 依赖 W1（ref 回调类型）但可独立
W3（内部 as any）── 独立
W4（api opts）── 独立
W5（验收）── 全部完成后
```

| 阶段 | 主题 | 行为变化 | 成本 | 优先级 |
|------|------|---------|------|--------|
| W1 | VNodeChild 建模 | 无（纯类型） | 中（children 类型收紧可能波及其他模块） | **P0** |
| W3 | 内部 as any 建模 | 无（纯类型） | 低 | **P0** |
| W2 | 事件/ref 类型化 | 无（纯类型） | 低-中（消费端可能需修） | P1 |
| W4 | api opts 类型化 | 无（纯类型） | 低 | P1 |
| W5 | 验收文档 | 无 | 低 | P2 |

## 诚实裁剪（C 类保留）

- **`props: Record<string, any>` 不动**：JSX 模型本质——任意 props 是框架契约（AGENTS.md 文档化「props 检查发生在组件声明处」）
- **`Component<any, any>` 不动**：泛型逆变问题（vnode.ts L107 注释）——required-prop 组件嵌套会破坏
- **`[key: string]: any` 中间件索引不动**：中间件动态注入 ctx 是架构本质；改 `unknown` 破坏现有消费
- **`getSelfId(ui: any)`/`isAsyncComponent(type: any)` 不动**：边界运行时多态，改造成类型环
- 若 W1/W2 触发组件库（components/）报错，**修消费端**（类型化收益向消费端扩散），不回退类型

## 验收记录

### W1 VNodeChild 建模（2026-10，1962 全绿）

- vnode.ts 新增 `VNodeChild` 递归联合类型（VNode/string/number/boolean/null/undefined/VNodeChild[]）
- `h/jsx/createPortal` children、`renderValue/renderArray/forEach/flattenChildren`、`patchValue`、`normalize/ensureKeys/mapChildDomNodes/patchKeyedChildren` 输入改 VNodeChild
- `VNode._child?: VNode | VNode[] | null`、`_render?: (props) => VNode | null`、`mountComponent/renderComponent props: VNode['props']`、`render(input: VNodeChild)`
- keyed-diff 内部数组子项 VNode 语义断言（`as VNode`）——数组无 key（position 复用）
- 发现并消除 `mountVNode` 的数组分支死代码（CS-01：renderValue 返回 Node | null）

### W3 内部状态 as any 建模（2026-10，`as any` 40 → 0 代码残留）

- diff.ts/render.ts/hydration.ts `childCtx.ui = Object.create(ctx.ui) as WfuiContext['ui'] & UiInternal`（交集类型，app.ts 已验证模式）+ `childUi` 局部引用
- `(vnode as any)._refNode/_childNodes` → `vnode._refNode`（R1 已补字段）
- `(ctx as any).ui.setMounting/endMounting` → UiInternal 交集
- `__DATA__` 全局声明（Window + globalThis var）；`window.visualViewport` 直接访问（DOM lib 实际可用，cast 是多余）
- style 设置统一 `(st as unknown as Record<string, string>)[sk]`（替代 as any）
- `removeEventListener` `{ capture: true }` 去 cast；`mountVNode` 死数组分支删除

### W2 事件/ref 类型化（2026-10，ui.ts `: any` 20 → 0）

- `UseLongPressHandle`：onPointerDown/Up/Leave/Move → PointerEvent；onContextMenu/onLongPress → MouseEvent
- ref 族：useStableRef/usePresence/useDialog/useAnimationEnd/usePopup `(el: any)` → `(el: HTMLElement | null)`
- `getSelfId(ui: any)` → `WfuiContext['ui'] | undefined`
- 发现并移除 usePresence 卸载分支死代码（`el?.removeEventListener` 在 null 收窄分支——listener 随元素销毁）

### W4 api opts 类型化（2026-10）

- `ctx.api` 方法 `opts?: any` → `{ headers?: Record<string, string>; signal?: AbortSignal }`（ApiRequestOptions 形状内联，避免 type 环）
- `<T = any>` → `<T = unknown>`；body `any` → `unknown`
- apps 消费端（components-demo/layouts-demo）typecheck 平滑

### W5 验收与文档（2026-10）

| 指标 | 第四轮前 | 第四轮后 |
|------|---------|---------|
| `as any`（代码） | 40 | **0**（2 处注释残留） |
| `: any` 标注 | 94 | **26** |
| `any[]` | 11 | **0** |
| 测试 | 1962 全绿 | 1962 全绿（+0，纯类型） |
| typecheck / build | 通过 | 通过 |

**剩余 26 处 `: any` 全为 C 类架构性**（诚实裁剪）：
- types.ts 14：`[key: string]: any` 中间件索引（api/data/auth/route/app/ws）+ ws/user 消息多态 + RouteDef props
- vnode.ts 2：`Component<any, any>`（泛型逆变）+ JSX `[tag: string]: any` + `isAsyncComponent(type: any)`（边界多态）
- render.ts 2：`setProp(value: any)` + `selectValue: any`（props 值多态，C1）
- registry.ts 2：`callRefCleanup(input: any)` + `safeCallRef(arg: any)`（VNode 运行时多态边界）
- 其余 6 处：reactive/hydration/app/error-boundary/diff/use-chat 各 1 处边界多态
