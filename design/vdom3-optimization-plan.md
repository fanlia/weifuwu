# vdom3 优化计划（2026-12——执行状态：阶段 1-3 + 4.1 已完成）

> 目标：在事件代理/精准事件流的基础上，消除已知热点、强化不变量、简化架构。
> 每项含：现状 / 问题 / 方案 / 验收 / 风险。按优先级分阶段执行。

---

## 阶段 1：热点消除（P0——高频路径）

### 1.1 findComponent O(1) 索引（组件定位）

**现状**：
```ts
// root.ts / router.ts——每次 ctx.render() 遍历整树找组件
findComponent(current, compId)  // DFS O(树大小)
```

**问题**：滚动跟随的 renderByIds 每帧多次 updateComponent——每次全树 DFS——大应用（1000+ 组件）逐帧遍历。这是**组件级更新**（vdom3 核心语义）的最热路径。

**方案**：**组件 id → vnode 引用索引**：
```ts
// root.ts / router.ts 内部（或共享模块）
const compIndex = new Map<string, VNode>()
// buildVNode 组件分支：注册（v._id → v）
// removeNodeWithLifecycle：注销（组件实例 id 移除时）
updateComponent(compId): const comp = compIndex.get(compId)  // O(1)
```
- 注册点：build.ts 组件分支（mount/reuse 时 `compIndex.set(v._id, v)`）
- 注销点：组件输出移除（patchCompKind out==null / removeNodeWithLifecycle——组件 vnode 移除时 delete）
- **索引维护者**：引擎（build/render）——root/router 消费

**验收**：
- 基准：1000 组件树——100 次组件级更新——对比 DFS vs 索引（预期数量级提升）
- 现有测试全绿（组件级更新语义不变——索引与 DFS 结果一致）

**风险**：低（索引与树同步——注册/注销点明确；不一致时索引 miss → 回退 DFS（防御））。

### 1.2 dispatch 祖先链优化（元素 → 挂载点/绑定元素）

**现状**：
```ts
// delegate.ts dispatch——每层 getAttribute
while (el && !el.hasAttribute('data-v3-id')) el = el.parentElement
```

**问题**：深 DOM（10+ 层）点击——每层 getAttribute——大规模列表高频交互时明显。

**方案**：① **原生 `el.closest('[data-v3-id]')`**（浏览器 C++ 实现——比手动循环快）——jsdom 支持；② **挂载点缓存**（nodeId → 挂载点——首次查找后缓存——patch 时失效——按需）。

**验收**：bench（1000 节点点击分发）对比；组件测试全绿（祖先链语义不变——含 Tabs 容器 onKeyDown 场景）。

**风险**：低（closest 语义等价；缓存需失效策略——元素移动/移除时清）。

### 1.3 currentTarget 还原优化

**现状**：dispatch 每次分发 `Object.defineProperty(e, 'currentTarget', ...)`——每 handler 一次属性定义。

**方案**：① **预取描述符**（`Object.getOwnPropertyDescriptor(Event.prototype, 'currentTarget')` 缓存——defineProperty 复用）；② **惰性**（仅对组件库依赖 currentTarget 的事件分发时定义——如 click/keydown/mouseover——全量事件清单评估）。

**验收**：bench（点击分发吞吐）；组件测试全绿（Img/DatePicker/Menu/Rate 的 currentTarget 断言）。

**风险**：低。

---

## 阶段 2：不变量强化（P1——自动守护）

### 2.1 DOM ↔ 事件流运行时对照审计（__WF_VDOM_AUDIT 扩展）

**现状**：静态审计保证"无事件流不渲染"（引擎 DOM 操作全有事件）——但运行时绕过（未来改动/组件副作用）无自动检测。

**方案**：**MutationObserver 对照事件流**（dev 模式可选开启）：
```ts
// audit.ts 扩展：auditDomEvents(root, stream)
// MutationObserver 记录 childList（added/removedNodes 的 data-v3-id）
// 对照事件流（node:insert/remove/move 的 target）——不匹配 → warn（绕过点）
// 例外：mount 清空/unmount 销毁/portal 容器——白名单
```
- 开启：`__WF_VDOM_AUDIT = '1'`（dev）或 `createRoot(..., { audit: true })`
- 对照逻辑：**移除节点必须有 node:remove**（严格）；插入节点必须有 node:insert（move 例外——added+removed 同 id）

**验收**：
- 测试：注入绕过（直接 removeChild）→ audit 捕获 warn
- components-demo 浏览器开启——零误报（正常操作无 warn）

**风险**：低（dev 模式——生产零开销）；MutationObserver 微任务时序（事件先于操作——对照需缓冲对齐）。

### 2.2 subscribe 过滤订阅

**现状**：`stream.subscribe(fn)`——订阅者收到全部事件。

**方案**：
```ts
subscribe(filter: Entity[] | Entity | ((e) => boolean), fn?)  // 兼容重载
// 例：subscribe(['dom', 'error'], fn)——只收 dom 层 + 错误
```

**验收**：过滤订阅测试（只收指定层）；现有 subscribe 调用兼容（重载）。

**风险**：低。

---

## 阶段 3：架构简化（P2）

### 3.1 useAnimationEnd 裁剪

**现状**：组件库 0 处使用者——被 `onAnimationEnd` prop（bindDelegated 代理路径）替代。

**方案**：**删除**（V3Ui 面移除 + 实现删除）——无使用者——干净裁剪（CS-05 诚实裁剪：登记 design/components-cuts.md）。

**验收**：grep 零引用；类型检查全绿。

**风险**：低（无使用者——但公开 API 删除需在文档标注——minor 版本语义）。

### 3.2 事件流水位事件（stream:watermark）

**现状**：`stream:overflow` 在已溢出时发（降频 64）——无预警。

**方案**：**水位事件**（80% 满时发一次 `stream:watermark`——payload: { usage, capacity }）——早于溢出的预警——可配置阈值（createEventStream(max, { watermark: 0.8 })）。

**验收**：测试（容量 5——4 条时 watermark）；overflow 逻辑不变。

**风险**：低。

### 3.3 组件 id 索引的注册表统一（与 1.1 合并实现）

**说明**：1.1 的 compIndex 可与 delegate 的注册表模式统一（同一模块——id 生命周期一致）——实现时合并。

---

## 阶段 4：深度优化（P3——评估后实施）

### 4.1 buildVNode 结构共享克隆

**现状**：纯函数式——每层 `{ ...vnode }` 克隆——整树克隆（大树分配压力）。

**方案**：**分支级结构共享**——克隆只在"该分支子树变化"时进行——兄弟分支复用旧引用（对照树语义保持：patch 需要旧树——复用引用 = 旧树节点共享——diff 时同引用跳过？——**关键**：patch 的 oldV 是"上次 built"——如果新树复用旧分支引用——patch(oldOut, built) 时同引用分支——**可直接跳过**（浅比较引用——零 diff）——**收益**：静态分支（无变化的子树）零克隆零 diff）。
- 实现：build 组件分支输出——与 oldOut 同引用时直接复用（不克隆）
- 风险：中（对照语义——`_child`/`el` 字段共享——必须保证"复用分支不被后续 patch 修改"——**纯函数式保证**（不就地修改）——需验证）

**验收**：bench（静态子树占多数的更新——克隆/分配下降）；全量测试（diff 语义不变）。

### 4.2 per-root 实例化（stream + delegate）——【暂缓——诚实裁剪】

**现状**：全局单例——多应用（微前端/嵌套）事件流混合。

**评估**：weifuwu 应用（agent-platform/components-demo/layouts-demo）均为单应用整页——
多应用共存（微前端/嵌入第三方页）是高级场景——收益低、架构成本高
（per-root id 分配器、delegate 实例化、事件流注入、测试基建适配）。

**决策**：暂缓（记录——如需多应用隔离，按此方案扩展——当前单应用语义完整）。

---

## 实施顺序与验收总纲

| 阶段 | 内容 | 估时 | 验收 |
|---|---|---|---|
| 1 | findComponent O(1) + dispatch closest + currentTarget 优化 | 1-2 天 | bench + 全量测试全绿 |
| 2 | DOM↔事件流审计 + subscribe 过滤 | 1 天 | 绕过注入测试 + 浏览器零误报 |
| 3 | useAnimationEnd 裁剪 + watermark | 0.5 天 | 零引用 + 水位测试 |
| 4 | 结构共享 + per-root（评估后） | 2-3 天 | bench + 多应用隔离测试 |

**每阶段独立提交**——可单独合并/回退。全量测试（src + 组件 + db + apps 类型）每阶段必跑。

## 风险总表

| 风险 | 缓解 |
|---|---|
| compIndex 与树失配 | 注册/注销点审计 + miss 回退 DFS（防御） |
| closest 兼容性 | jsdom/浏览器均支持——测试覆盖 |
| 结构共享破坏对照语义 | 纯函数式不变量测试（现有 vdom3-core 全量）+ bench 前后 diff 一致性 |
| per-root 隔离的 id 冲突 | 默认全局兼容——per-root 可选（阶段 4 评估） |
| audit 误报（组件副作用） | 白名单（mount/unmount/portal 容器）+ 组件副作用事件流（effect:）对照 |

## 非目标（诚实裁剪）

- 不做 vdom3 重写（优化不是重构——现有事件流/代理/组件库资产全保留）
- 不做运行时双引擎（per-root 是可选隔离——非架构替换）
- 组件副作用全事件化（effect: 已覆盖框架原语——组件直接 DOM 操作黑盒——dev audit 兜底检测）
