# weifuwu/client 优化计划

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
