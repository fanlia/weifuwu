# vdom4 计划——精准事件流引擎 + ui-dom 端口化（2026-12——方向调整：独立引擎 ✅）

> **执行状态（2026-12）**：方向调整——**vdom4 = 独立引擎（engines/vdom4/），不兼容
> vdom2/vdom3，组件直接改为 vdom4 方式**（不再在 vdom3 兼容面内打补丁——P2b 的
> vdom3 内值化已回滚）。vdom3 内已完成的机制（命令化 diff/锚点法/影子/dispose/
> hydration——4bf4fe11..f684f4cd）是 vdom4 的**概念验证**——架构原则不变，实现重写。
> 已完成的 ui-dom 端口化（UI-1/2/3/5——contracts/services/边界审计）是 vdom4 的
> 骨架——组件库迁移时保留（组件经门面接触引擎）。
>
> **新方向的关键决策（用户 2026-12）**：
> ① **不兼容**：组件/ctx 面按 vdom4 方式重设计——不需要 V3Ctx/V3Ui 兼容 shim
> ② **消灭挂起超时 hack**：vdom4 禁止 `Promise.race([renderFn(), setTimeout rej])`
>    ——渲染管线的推进不依赖「用户 renderFn 的完成」——架构本身支持

> 目标：消除 vdom3 的「历史同步」类 bug 类别（锚点捕获/剪枝吞更新/双轨竞态——同款
> 修复 6 次的土壤），建立「**一份历史 + 两个纯函数 + 一个薄执行器**」的引擎架构；
> 同步把 ui-dom 重构为「契约 + 服务」稳定层——**v5 换引擎 = 新增 engines/ 目录 + 改一行**。
>
> 双线并行：**引擎线（P0-P5）** + **ui-dom 线（UI-1..5）**——最终合流于双引擎切换矩阵。
> 组件模型（两阶段组件/render-only/ctx 面）**不变**——组件库零改动是硬约束。

---

## 1. 背景：vdom3 的问题（本计划的驱动因素）

| # | 问题 | 证据 | 消除手段 |
|---|------|------|---------|
| 1 | **事件流名不副实**——文档宣称「事件流即执行」，实现是「边 diff 边改 DOM + 旁路 emit」；DOM=fold 打折（handler 不入流 / prop prev 填 `''` / 环形缓冲溢出即丢） | render.ts patch 家族直接 createElement/insertBefore；events.ts 环形缓冲 | P0 命令化 diff——命令 = 决策产物，执行 = fold(命令) |
| 2 | **全局可变状态**——registry/stream/delegate/compIndex/nodeUid 模块级单例；多应用互相污染；测试靠 reset 纪律（nodeUid 无 reset） | events.ts `let nodeUid`；root.ts per-call reg 注入 | P4 会话实例化 |
| 3 | **diff 多套语义并存**——patchInner/patchChildren（domIdx+widthOf 宽度推导）/patchKeyedChildren/moveKeyedNodes；锚点失效静默 append；同款 bug 修 6 次 | git 历史：anchor 先捕获×2、剪枝克隆 el、循环 anchor、双游标、keyed prev 推进 | P1 锚点法（每槽恒一锚——消灭推导） |
| 4 | **契约即纪律**——props 不可变/稳定引用——违规静默（audit 事后 warn）；业务为引擎引用比较买单（Chat.tsx 一次改 5 处） | build.ts propsSnap；审计 `[vdom3/audit]` warn | P2 值化后声明可比较；配合深度冻结（dev 违规即抛错） |
| 5 | **双轨更新**——root/router 各两套（update/updateComponent/updatePage——四段重复代码）；update 与 updateComponent 独立队列可并发交错；组件输出 null 恢复时 parent 定位丢失（`parentNode ?? root`） | root.ts/router.ts | P4 统一渲染原语 + epoch |
| 6 | **生命周期不完整**——RootHandle.unmount 只清 innerHTML（不清理 delegate/全局监听）；portal 关闭时 ensurePortalContainer 副作用 | root.ts unmount() | P3 效果系统 + dispose 协议 |
| 7 | **性能默认开销**——auditOrder O(n²)（每次 patchChildren 末尾）；propsSnap JSON.stringify 每组件每次 build；默认开 = 生产也跑 | audit.ts/render.ts/build.ts | P1 影子对照 O(n)；P2 propsSnap 删除 |
| 8 | **SSR 三份分叉**——renderToEvents/renderToEventStream/eventsToHtml（Fragment 分支语义不一致）；hydration 不收养（mount 追加+删旧——SSR HTML 全量重建） | ssr.ts；mount() ssrOld | P5 一条管线 + 路径 id 吸收 |
| 9 | **ui-dom 门面 = 引擎内部**——index.ts 导出 vdom3 全部 20+ 内部符号（stream/NodeRegistry/replay/scheduler…）；HookEnv 是 vdom2 形状（createV3Ui shim）；render(['id']) 跨组件渲染未实现（warn 降级） | index.ts；ui.ts | UI-1..5 端口化 |

---

## 2. 架构原则（定稿——vdom4 北极星）

### P1 精准事件流
> **首帧全量命令 + 后续增量命令——同一个 diff 函数。** mount ≡ `diff(声明, ∅)`；
> patch ≡ `diff(声明', 影子)`。命令是决策的产物（不是旁路记录）；全量是增量的特例。

### P2 影子状态是唯一真相
> 影子（DOM 抽象 + 组件实例树）由 fold **唯一推进**；build/diff **只读**。
> **声明可以陈旧，影子不能**——组件级更新改影子，父级 diff 零命令（引用相同 → 子树跳过）——
> 无需「根不剪枝」特例、无需锁、无需世代协调父子。历史从两份（旧树+DOM）变一份。

### P3 纯函数管线
> build/diff/fold 纯（输入输出显式数据）；apply 薄无决策；副作用（ref/事件/清理）
> 集中在**效果协议**（由命令派生、顺序确定）。决策正确性与执行正确性分离，各自可测。

### P4 契约与引擎分离（ui-dom 端口化）
> ui-dom = **契约（contracts/）+ 服务（services/）**稳定层；引擎 = **适配器（engines/）**。
> v5 换引擎 = 新增 `engines/vdom5/` + index.ts 一行——组件库/hooks/中间件/用户代码零改动。

---

## 3. 目标架构

### 3.1 引擎管线（engines/vdom4/）

```
state（闭包 let / store——输入源）
  │ ctx.render() / store 通知 → scheduler（串行 + epoch）
  ▼
① renderFn      → 声明树（值化 vnode——type/props/key/children，无回填字段）
② build         → 新声明（纯展开——查影子复用实例：同位置同类型 → 复用 renderFn/lastOutput）
③ diff          → Command[]（纯——声明 vs 影子——位置来自影子的槽位锚，O(1)）
④ fold          → 影子'（纯——命令逐条推进——DOM = fold(命令) 数学成立）
⑤ apply         → DOM（薄——无决策——createElement/insertBefore/setProp/效果）
```

### 3.2 核心数据结构

```ts
// 声明（值化 vnode——契约层）
interface DeclNode { type: string | symbol | Component; props: Record<string, unknown>; key: string | null; children: DeclChild[] }

// 影子（唯一真相——引擎内部）
interface Shadow {
  nodes: Map<id, { tag: string; props: Record<string, unknown>; parent: string | null; slot: number; children: string[] }>
  instances: Map<compId, { type: Component; renderFn: RenderFn; lastProps: Record<string, unknown>; lastOutput: DeclNode | null }>
}

// 命令（diff 的产物——可序列化/回放/传输）
type Command =
  | { op: 'mountComp'; compId: string; type: Component; props: Record<string, unknown> }
  | { op: 'unmountComp'; compId: string }
  | { op: 'create'; id: string; tag: string } | { op: 'createText'; id: string; value: string } | { op: 'createHole'; id: string }
  | { op: 'insert'; id: string; parent: string; ref: string | null }
  | { op: 'remove'; id: string } | { op: 'move'; id: string; parent: string; ref: string | null }
  | { op: 'setProp'; id: string; key: string; value: unknown } | { op: 'setText'; id: string; value: string }
  | { op: 'bind'; id: string; event: string; handler: EventListener }   // 事件代理覆盖

// 效果（apply 派生——协议化顺序）
type Effect = { kind: 'ref-mount' | 'ref-cleanup'; id: string; fn: (el: any) => void }
            | { kind: 'unbind'; id: string } | { kind: 'hooks'; compId: string }
```

### 3.3 树路径 id 协议

- id = `root.0.0`（root 的槽 0 的槽 0）——**确定性**：同一份声明 → 同一组 id——SSR/客户端一致
- keyed 列表项用业务 key（`data-wf-key`），非 keyed 用路径——吸收匹配双通道
- 吸收器：遍历 SSR DOM 按 `data-wf-id`/key 构造影子（**唯一的新代码**）——之后常规管线
- 事件绑定是 diff 的自然产物：吸收的影子缺 handler → diff 产出 bind 命令

### 3.4 ui-dom 端口化结构

```
src/ui-dom/
├── index.ts            ← 门面（只导出契约 + 服务 + 当前引擎公开 API——收窄）
├── contracts/          ← 引擎无关（纯类型/接口——v5 不动）：vnode.ts / ctx.ts / renderer.ts / hooks.ts
├── services/           ← 引擎无关实现（v5 不动）：render-service（语义 id + 跨组件渲染）/ hook-env / popup-tracker / media
├── hooks/ middleware/ browser.ts store.ts i18n.ts motion.ts testing.ts   ← v5 不动
└── engines/
    ├── vdom4/          ← 新引擎 + adapter.ts（RendererService 实现——唯一耦合点）
    └── vdom3/          ← 过渡保留（双引擎矩阵）→ UI-5 删除
```

```ts
// RendererService——ui-dom 与引擎的唯一接触面（5 个原子能力）
interface RendererService {
  createRoot(vnode, el, options): RootHandle
  createRouter(routes, el, options): RouterHandle
  scheduleRender(target: { kind: 'root' | 'comp'; id?: string }): void   // 按 compId 渲染
  mountCommand(vnode, container): { unmount(): void }                    // confirm/toast/notification
  renderToString(vnode, options): string | Promise<string>               // SSR
}
```

---

## 4. 阶段计划

### 引擎线

#### P0 命令化 diff（在 vdom3 内改造——决策/执行分离）
**内容**：
- [ ] patch 家族改造：diff（纯函数——比较旧树/新树/DOM 状态 → 输出命令列表）与 apply（执行命令 → DOM）分离
- [ ] 事件流从「旁路 emit」改为「命令列表派生」——emit 点收敛到 apply 单点
- [ ] 命令格式落地（§3.2）——replay 直接消费命令列表（旁支扶正）
- [ ] 回归：vdom3 全部测试在改造后全绿（行为不变——只改内部组织）

**验收**：diff 函数无 DOM 操作（grep 审计）；命令列表可独立回放；事件流与命令列表一致（单点 emit）
**风险**：中——改造面大（render.ts 47KB）——但行为不变可逐测试验证；P0 不动数据结构（仍读旧树）
**依赖**：无（vdom3 现有测试是安全网）

#### P1 锚点法 + 影子状态
**内容**：
- [ ] 每数组槽位恒一锚（多节点项包锚——恒宽 1）——消灭 domIdx/widthOf/_outFirst/_outLast
- [ ] 影子数据结构（§3.2）——diff 输入从「读 DOM/回填字段」改为「读影子」——锚失效 = 抛错（不再静默 append）
- [ ] auditOrder 从 O(n²) 索引扫描改为「影子槽位对照」O(n)——锚序号即索引
- [ ] 回归：anchor 类 6 次修复的测试场景全部重跑（空洞/重建/剪枝 el/循环 anchor/双游标/keyed prev）

**验收**：`_outFirst/_outLast/widthOf/domIdx` 从 render.ts 消失（grep=0）；vdom3-audit-order-repro 场景在影子模式下天然正确（无 anchor 捕获逻辑）
**风险**：中——多节点项包锚引入额外 DOM 节点（注释锚）——组件测试的 DOM 结构断言需同步调整
**依赖**：P0

#### P2 vnode 值化 + buildLog
**内容**：
- [ ] vnode 回填字段（el/_id/_child/_render/_outFirst/_outLast/_propsSnap）全部移入影子
- [ ] 实例 id 延迟分配（build 输出「新实例」标记——apply 分配）——nextNodeId 不再被 build 调用
- [ ] build 副作用收敛为 buildLog（实例注册/卸载钩子注册/新实例标记）——stream.emit 从 build 移除
- [ ] propsSnap 删除（值化后声明可深比较——配合 dev 深度冻结：props 原地改 → 立即抛错）
- [ ] 剪枝语义重定义：props 未变 → 复用 lastOutput（build 层零展开）；引用相同 → diff 层子树跳过

**验收**：build 无副作用（grep：build.ts 无 stream.emit/无全局 Map 写入）；vnode 类型无回填字段
**风险**：高——组件复用语义的迁移点（_render/_child 从 vnode 字段 → 影子 instances）——组件级更新
（updateComponent）同步改造；「根不剪枝」特例删除（P4 统一原语承接）
**依赖**：P1（影子先行——字段有处可去）

#### P3 效果系统 + 生命周期统一
**内容**：
- [ ] ref/事件绑定/卸载钩子统一为效果（§3.2）——由命令派生——执行顺序协议化（insert 后 ref-mount、remove 前 ref-cleanup → unbind → hooks）
- [ ] 完整 dispose 协议：根卸载 = 全树效果清理（delegate/全局监听/portal 容器/定时器）——修复 RootHandle.unmount 泄漏
- [ ] removePortalContent 的 ensurePortalContainer 副作用消除（关闭不创建容器）

**验收**：卸载后 delegate 监听零残留（泄漏检测测试——round3 阶段 4 的检测固化为断言）；dispose 幂等
**风险**：低——效果派生是纯转换——协议化后测试可穷举
**依赖**：P2

#### P4 会话实例化 + epoch + 统一渲染原语
**内容**：
- [ ] 引擎实例化（Engine per root：shadow/scheduler/nextId/delegate 全在实例内）——消灭模块级全局
- [ ] 统一渲染原语 `engine.update(target)`（root/comp 一个入口）——root/router 四段重复代码收敛
- [ ] epoch 世代：渲染中触发 → 合并/丢弃判定（不再靠 updating/dirty 标志猜测）；组件输出 null 恢复的位置从树结构定位（父链——不再 `parentNode ?? root`）
- [ ] 组件级更新成为一等路径（子内部状态变化 → 子级会话——「根不剪枝」特例删除）

**验收**：多 root 并发渲染隔离（每 root 独立影子/命令流）；组件输出 null→恢复位置正确（新测试）
**风险**：高——调度语义重写（vdom3 的 busy/dirty/queue 三种机制收敛为一个）——滚动跟随/多弹层并发场景重点回归
**依赖**：P2

#### P5 统一管线（SSR/流式/hydration）
**内容**：
- [ ] 树路径 id 协议（§3.3）——SSR 输出带 data-wf-id
- [ ] hydration = 吸收器（DOM → 影子）+ 常规管线（diff 增量——通常零命令）——删除 mount 追加+删旧
- [ ] renderToEvents/renderToEventStream/eventsToHtml 三份分叉收敛为一条命令管线（两种输出：命令序列化 / HTML）
- [ ] 流式 = 命令分块传输（骨架先到）

**验收**：SSR→hydration 首帧零重建（MutationObserver 断言无 create 命令）；SSR/客户端声明比对（dev mismatch 检测）
**风险**：中——吸收器与第三方 DOM（echarts）共存边界；确定性纪律（Date/random/locale 红线不变）
**依赖**：P4

### ui-dom 线（关键策略：UI-1/UI-2/UI-3 在 vdom3 上先行落地——行为零变化）

#### UI-1 契约抽取
**内容**：
- [ ] VNode/Component/V3Ctx/V3Ui 类型抽到 contracts/（vnode.ts/ctx.ts）——独立类型树（不再 extends vdom2 WfuiContext 残留）
- [ ] index.ts 导出路径不变（转发）——组件库 192 处零改动

**验收**：typecheck 全绿；components/ 零 import engines/（审计脚本固化）
**风险**：低——纯类型移动

#### UI-2 RendererService 抽象 + v3 adapter
**内容**：
- [ ] RendererService 接口（§3.4）——createRoot/createRouter/scheduleRender/mountCommand/renderToString
- [ ] vdom3 adapter 实现（行为不变）——commands.ts 的 confirm/toast/notification 改走 mountCommand
- [ ] testing.ts 基于 RendererService 重写（可注入假引擎——vdom4 的「无 DOM 断言」测试模式）

**验收**：现有测试全绿（行为零变化）；testing 的引擎依赖收口
**风险**：低——接口抽取 + 转发
**依赖**：UI-1

#### UI-3 HookEnv 重构 + 服务上移
**内容**：
- [ ] HookEnv 引擎无关形状（compId/scheduleRender/onUnmount/registerSemanticId/浏览器与服务表——无 render(ids)/registry/isMounting）
- [ ] `render(['id'])`/selfId 跨组件渲染上移为 services/render-service（语义 id → compId 映射——调 renderer.scheduleRender）——**补全 vdom3 未实现的能力**
- [ ] createV3Ui shim 删除（HookEnv 重构后不再需要）

**验收**：hooks 全部改造后测试全绿；`render(['stats'])` 跨组件精准刷新新测试通过（此前 warn 降级）
**风险**：中——hooks 27 种能力逐个迁移（usePopup/useInView/useScrollPosition 等）——组件库回归面大
**依赖**：UI-2

#### UI-4 双引擎测试矩阵（隔离性硬证明）
**内容**：
- [ ] 同一套 ui-dom 测试（组件库 + hooks + testing）在 vdom3 与 vdom4 上全绿
- [ ] 换引擎演练：diff 统计 = index.ts 一行 + engines/vdom4/ 新增——记录为 v5 预期模板

**验收**：矩阵全绿；演练 diff 符合预期（组件库/hooks/middleware/用户代码零改动）
**风险**：中——矩阵暴露 vdom3/vdom4 行为差异（P1 锚点 DOM 结构变化等）——逐项对齐
**依赖**：UI-3 + P4

#### UI-5 v3 删除 + 边界审计固化
**内容**：
- [ ] engines/vdom3/ 删除（git 历史保留）——回滚保险 = git revert
- [ ] import 边界审计固化为 CI 测试（components/hooks/middleware/services 零 import engines/）
- [ ] 双实例校验（`__wf_ui_dom_instance` 探针）——§6.1 纪律第三道防线

**验收**：grep 审计=0；单模块实例校验通过
**风险**：低
**依赖**：UI-4

---

## 5. 测试与验收策略

### 5.1 测试策略
- **fuzz 收敛不变量**（核心）：随机声明 + 随机影子 → `diff` → `fold` → 断言 `影子' 与声明同构`；
  随机命令序列 → `apply` → 断言 `DOM 与影子同构`——纯函数的性质测试（先例：689ea2ca fuzz 折叠不变量）
- **Counter 验收样例**：design/vdom4-plan.md 附录 A（首帧 6 命令/点击 1 命令/父更新 0 命令/移除 unmountComp+remove）——
  每阶段实现对照此样例验证输出
- **回归遗产**：vdom3 全部测试 + 6 次 anchor 类修复场景 + audit 抓出的历史事故（Form 提交按钮/聊天搜索替换/统计页 grid）
- **影子断言模式**：vdom4 测试优先断言 fold 后影子（无 DOM 也可测——服务端/测试共享）
- **双引擎矩阵**（UI-4）：同一测试文件双跑——引擎无关性的硬证明

### 5.2 性能预算
- 组件级更新：O(变化)（引用相同 → 子树跳过——diff 不遍历整树）
- 首帧 1000 节点：≤ 现 vdom3 mount 量级（命令列表分配——池化复用）
- 审计：影子对照 O(n)——auditOrder O(n²) 消除；propsSnap 删除
- 全量测试预算 ≤ 15s 纪律保持（§7.1）

### 5.3 用户可推导性验收
- 规则表（design/vdom-transform-rules.md 的 vdom4 版）：写 JSX 知 vnode 结构（不变）；
  **更新行为 = 精准事件流**（改状态 → render → 命令列表可观测 `__wf_tail` 等价物）
- 契约违规从「warn」升级为「dev 立即抛错」（props 深度冻结——P2）

---

## 6. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| P0/P1 改造面大（render.ts 47KB）——回归 | 高 | 行为不变的内部组织改造先行；逐测试验证；vdom3 测试是安全网 |
| 组件复用语义迁移（_render → 影子 instances） | 高 | P1 影子先行——字段有处可去；组件级更新同步改造 |
| 调度语义重写（busy/dirty/queue → 统一原语） | 高 | 滚动跟随/多弹层并发重点回归；epoch 可观测（测试断言） |
| hooks 迁移（UI-3——27 种能力） | 中 | 逐个迁移 + 组件库回归面大；HookEnv 形状先行冻结 |
| 锚点额外 DOM 节点影响组件测试断言 | 中 | 测试同步调整清单；锚是注释节点（对用户不可见） |
| 双引擎并行维护成本 | 中 | 过渡期仅 UI-4 矩阵期；UI-5 删除 v3 |
| 第三方 DOM 修改 → 影子漂移 | 中 | 锚点法漂移局部化 + 漂移检测（影子 vs 真实对照） |
| 事件流能力降级（undo/sync 低收益项裁剪） | 低 | 诚实裁剪登记：undo 不自包含/sync 无生产使用——回放保留（命令 = 唯一中间表示） |

## 7. 执行顺序与依赖

```
UI-1 → UI-2 → UI-3 ─────┐
                          ├→ UI-4（双引擎矩阵）→ UI-5
P0 → P1 → P2 → P3 → P4 ─┘
                    └→ P5（可延后——统一管线独立于矩阵）
```

- **UI 线先行**（契约/接口先在 vdom3 上落地——行为零变化、每步可提交可回滚）
- **引擎线渐进**（P0→P4 每步独立验证——P4 完成即与 UI 线合流）
- **P5 可延后**（SSR/hydration 统一是锦上添花——矩阵验证不依赖）
- 每阶段独立提交；完成即归档（git 历史可追溯——design 纪律）

## 8. 完成定义（DoD）

- [ ] P0-P5 全部验收通过；vdom3 测试遗产全绿（改造后语义等价）
- [ ] UI-1..5 完成；双引擎矩阵全绿；import 边界审计 = 0
- [ ] fuzz 收敛不变量测试就绪；Counter 验收样例各阶段对照通过
- [ ] agent-platform 生产应用在 vdom4 上运行（真实交互验收——agent-browser）
- [ ] 性能预算达标；全量测试 ≤ 15s
- [ ] 规则表 vdom4 版 + 裁剪登记（design/components-cuts.md）同步

---

## 附录 A：Counter 验收样例（每阶段实现对照此样例验证输出）

组件模型不变：

```tsx
const Counter = (initProps, ctx) => {
  let count = initProps.initial ?? 0
  return (props) =>
    h('button', {
      onClick: () => { count += props.step ?? 1; ctx.ui.render() }
    }, count)
}
```

### A.1 首帧（全量命令——6 条）

```
build：工厂 → renderFn → 声明（button ── text '0'）
diff(声明, ∅)：
  [ mountComp c1 / create n1 button / bind n1 click / createText t1 '0' / insert n1 root / insert t1 n1 ]
fold：影子 = { n1(button, slot 0), t1(text '0', slot 0) } + instances[c1]
apply：createElement → 代理注册 → append——一次同步落地
```

### A.2 点击（组件级精准——1 条命令）

```
事件代理 dispatch → onClick → count++ → ctx.render()（绑定 c1）
build：重跑 renderFn（不经 props 比较——工厂不重跑）→ 声明（text '1'）
diff(声明, 影子)：text '0'→'1' → [ setText t1 '1' ]     （onClick mount 层稳定 → 无 bind 命令）
fold → apply：t1.nodeValue = '1'
```

### A.3 父更新·props 变（增量链——可能为 0）

```
父 renderFn → 新声明 → build 展开 Counter：查影子实例（同位置同类型 → 复用——count 闭包保持）
props 比较：step 变 → 重跑 Counter renderFn；输出不变 → 命令 []
```

### A.4 父更新·props 未变（零展开零命令）

```
build：复用 lastOutput 引用（不跑 renderFn）
diff：引用相同 → 子树整体跳过 → 命令 []
```

### A.5 组件移除（unmountComp + 清理效果）

```
diff：影子多出实例 → [ unmountComp c1 / remove n1 ]
apply 效果协议：ref(null) → 卸载钩子 → unbindAll → DOM remove → instances 注销
```

### A.6 SSR/hydration（同管线——影子初始化不同）

```
SSR：build + diff(∅) → 全量命令 → HTML（带 data-wf-id=root.0.0.0）
hydration：吸收器按 id 建影子（props 无 handler）→ 常规 diff → [ bind ]（唯一增量）
          —— 完全一致时命令 []（零 DOM 操作——无重建）
```

---

## 9. 方向调整附录（2026-12——独立引擎 vdom4）

### 9.1 为什么独立引擎（不兼容）

vdom3 内改造的教训：**兼容面（V3Ctx/V3Ui/hooks shim）拖累架构**——
P2b（值化）在 vdom3 内推进时，`updateComponent` 双轨（busy/dirty/updatingComps）、
挂起超时 hack、组件级更新的 comp 定位（findComponent + _render 字段）全部成为
「值化」的阻碍——因为兼容面要求 vnode 保留字段、ctx 保留旧形状。

vdom4 独立引擎：**组件/ctx/vnode 全部按新架构设计——无兼容包袱**。

### 9.2 组件模型（vdom4 方式——非兼容）

```ts
// 两阶段保留（工厂 + renderFn）——但 ctx 面重设计：
// ctx.render()（统一渲染原语——root/comp 同一入口）
// ctx.data（唯一异步边界——数据管道：缓存/并发合并/错误/超时由管道管理）
// ctx.ui.*（hooks——浏览器能力——保留但形状 vdom4 化）
// ctx.browser（环境抽象）
const Counter = (initProps, ctx) => {
  let count = initProps.initial ?? 0
  return (props) => h('button', { onClick: () => { count++; ctx.render() } }, count)
}
```

### 9.3 消灭挂起超时 hack（架构原则——禁止 `Promise.race + setTimeout rej`）

**vdom3 为什么需要它**：`updateComponent` await 用户 renderFn——永不 resolve →
busy 卡死 → 管线瘫痪。超时竞速是补丁（且有害：3s 后 resolve 的正常渲染被丢弃）。

**vdom4 消灭它的三个机制**（渲染推进不依赖用户异步完成）：

1. **ctx.data 是唯一异步边界**：renderFn 的 await 只允许 `ctx.data.get`（缓存命中
   同步返回——未命中管道 fetch——**请求生命周期/超时/错误由管道管理**——不是渲染
   管线竞速）。渲染期确定性红线扩展：**renderFn 禁止直接 fetch/定时器/任意 await**
   （dev audit 检测——违规 warn）
2. **同步骨架先行**：build 的同步部分（props/结构）立即推进——异步数据未就绪 →
   组件输出确定性加载态（骨架/占位）——**管线不等待**——数据就绪 → ctx.data 通知
   → 统一渲染原语补渲染该组件（与 vdom2 的 ctx.data 三场景同语义——但由管道驱动）
3. **统一渲染原语 + 串行调度**：`engine.update(target)`（root/comp 一个入口——
   一个调度队列——epoch 世代）——**无 busy/dirty/updatingComps 双轨**（vdom3 的
   并发复杂性来源）——渲染中触发 = 世代校验合并/丢弃——**无「等待」语义**

**验收**：vdom4 源码 grep `Promise.race` / `setTimeout.*rej` = 0；挂起场景（renderFn
永不 resolve）下管线照常推进（该组件保持旧输出——其余正常渲染——dev 报错定位）。

### 9.4 组件迁移（改为 vdom4 方式）

| vdom2/vdom3 面 | vdom4 面 | 迁移 |
|---|---|---|
| `ctx.ui.render()` / `ctx.render()` | `ctx.render()`（统一） | 机械替换 |
| `ctx.ui.selfId + render(['id'])` | `ctx.render(['id'])`（语义 id 服务保留） | 保留 |
| `ctx.ui.useXXX` hooks | `ctx.ui.useXXX`（形状 vdom4 化——HookEnv 契约已引擎无关） | 小改 |
| `ctx.data` | 同（管道——三场景） | 保留 |
| 组件内部状态 | 闭包 `let` + `ctx.render()`（render-only 不变） | 保留 |
| `ctx.browser` | 同 | 保留 |

迁移顺序：引擎最小闭环（build/diff/fold/apply 同步组件）→ ctx 面 → 组件库
批量迁移（机械）→ 异步数据（ctx.data 管道）→ 测试基线（组件全量 1327 复绿）。

### 9.5 独立引擎文件结构

```
src/ui-dom/engines/vdom4/
├── types.ts      — vnode（纯数据——无回填字段）+ Command + 影子类型
├── shadow.ts     — 影子（实例表（路径 compId）+ 锚列表 + 节点登记——fold 唯一推进）
├── build.ts      — 纯展开（查影子复用实例——**无副作用**——输出暂存 nextOutput）
├── diff.ts       — 纯 diff（新树 vs 影子 → Command[]）
├── fold.ts       — 影子推进（Command[] → 影子'）
├── apply.ts      — 执行器（薄——DOM + ref/事件/生命周期/dispose）
├── scheduler.ts  — 统一调度（engine.update(target) + epoch——无双轨）
├── ctx.ts        — 组件 ctx（vdom4 面）
├── root.ts       — createRoot（会话 Engine 实例）
├── router.ts     — createRouter
├── data.ts       — ctx.data 管道（缓存/并发合并/错误/超时——唯一异步边界）
└── ssr.ts        — 统一管线（事件流 + 吸收——复用 vdom3 验证的语义）
```

### 9.6 与 vdom3 内改造的关系（资产复用）

| vdom3 机制 | vdom4 复用方式 |
|---|---|
| 命令化 diff（gen/apply） | 重写为纯函数（diff/fold/apply 分离——vdom3 的 gen 与 apply 已分但同文件） |
| 锚点法/逻辑容器锚列表 | **直接复用**（shadow.ts 的语义——P1 验证） |
| props 深度冻结 | **直接复用**（build.ts 的 deepFreeze） |
| dispose 协议 | **直接复用**（disposeTree 语义） |
| hydration 结构吸收 | **直接复用**（absorb 队列语义） |
| 语义 id 服务 | **直接复用**（services/hook-env.ts——引擎无关） |
| 路径 compId（P2b-1 验证） | **直接复用**（c0.0.c.1 格式——确定性） |
| 事件流观测 | vdom4 可选（观测层降级——不阻塞执行） |
