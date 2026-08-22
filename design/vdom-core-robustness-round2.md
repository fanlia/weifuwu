# vdom core 健壮性第二轮计划（client/vdom/core 边界路径歼灭）

> 目标：client/vdom/core 目前契约层 100 + 场景层 107 全绿——但**主路径测试
> 掩盖边界盲区**。本轮以探针实证（命令流断言）歼灭 8 个缺口——全部核心层
> 根因（diff/transform/事件表/实例注册表）——一处修复全库受益。
>
> 方法：先探针实证（已做——/tmp/probe-core.ts 系列——命令流证据）→ 修复 →
> 契约测试锁定 → 场景测试 DOM 验证 → 全量回归。

---

## 0. 基线（2026 现状——探针实证）

`npm run test:client`（100 ✅）/ `npm run test:scenario`（107 ✅）——但探针
（命令流直跑 diffStream/renderToStream——零 DOM——同契约层方法）抓出 **8 个
缺口**，其中 1 个**崩溃级**（G1），5 个 DOM 残留/资源泄漏级（G2/G3/G5/G7/G8），
1 个行为错误级（G4——事件残留继续触发），1 个死代码（G6）。

---

## 1. 缺口清单（探针实证——命令流证据）

| # | 缺口 | 严重度 | 触发路径 | 命令流证据 |
| --- | --- | --- | --- | --- |
| G1 | **组件输出多根 → 同位置异类型组件切换 → TypeError 崩溃**——`removeVNodeTree` 对数组 lastOutput 读 `v.props`（undefined） | 🔴 高（崩溃——渲染管线中断） | `diffSame` 类型检查分支（same.ts:53）——A 输出数组 → B | probe2b：TypeError: Cannot read properties of undefined (reading 'children') |
| G2 | **组件输出多根 → 元素/组件/null 转换只 remove 首锚**——第二节点起 DOM 残留（同构破坏——锚点法区间未清） | 🟠 中 | `transitionComponent`（transform/component.ts）单 `remove oldId` | probe2/probe7：remove 只有 `root.0.0`——`root.0.1` 无命令 |
| G3 | **Fragment 符号 vnode（`<></>`）fragment→fragment 走 rebuild**——旧项残留（内容变化/缩短均无 remove） | 🟠 中 | `diffSame`「其余同态」分支（same.ts）`emit(newV)` 重建无清理 | probe1/probe1b：remove 为 `[]` |
| G4 | **事件 handler 从 props 移除（onClick 消失）→ 无解绑命令**——事件表残留旧 handler 继续触发（行为错误） | 🟠 中 | `diffAttrs` 函数面只遍历 newV.props（attrs.ts） | probe3：setProp 为 `[]` |
| G5 | **keyed 混合数组/冲突重建——unkeyed 组件项移除不发 unmount**——onUnmounts 不执行 + 实例残留 | 🟠 中 | `diffKeyedChildren` step 0 + `!subseq` 重建路径（children.ts） | probe4：ops 只有 remove/move/done |
| G7 | **keyed 组件类型切换（renderComponent 内部 dispose 路径）lastOutput 数组区间无清理命令** | 🟠 中 | `renderComponent` 类型检查分支（component.ts）——dispose 后直接全量渲染 | probe9：remove 为 `[]` |
| G8 | **嵌套组件移除——unmount 不递归**——子实例残留（onUnmounts 不执行） | 🟠 中 | `disposeComponent` 单实例删除（component.ts） | probe10：diff 后 keys 仍 `["root.0.0","root.0.0.0"]` |
| G6 | serve.ts 第二个 `if (!currentTree && applier.absorb.failed)` 不可达（前一 if 已 reset） | 🟡 低 | serve.ts 死代码 | 代码审查 |

**共性根因**（全部核心层——按 AGENTS.md 归类纪律修核心不修组件）：
- ① **多节点区间清理不统一**：transform/fragment.ts 已有完整递归
  `removeChildTree`——但 component 转换/类型切换/rebuild 路径各自单发 remove
  ——区间语义三处漂移（G1/G2/G3/G7 同根）
- ② **函数面 diff 单向**（只遍历新 props——旧 props 消失的键无命令）——
  G4
- ③ **unmount 命令发射点不全**（keyed 混合/重建路径漏发）+ **dispose 不递归**
  （子实例）——G5/G8

---

## 2. 修复方案（按严重度排序——每项：根因 → 修复 → 验收）

### P0 —— G1 崩溃（先修——渲染管线中断）

**根因**：`diffSame` 类型检查分支 `removeVNodeTree(rec.lastOutput as VNode, ...)`
——lastOutput 是数组（组件输出多根）→ `childrenOf` 读 `v.props` → undefined
崩溃。`removeVNodeTree`（cleanup.ts）与 `removeChildTree`（transform/fragment.ts）
是**两套重复实现**——数组防御只在后者。

**修复**（核心层——统一区间清理）：
- `removeVNodeTree` 加数组防御（`Array.isArray(v)` → 逐项递归）——与
  `removeChildTree` 对齐
- **去重**：`removeVNodeTree` 内部改调 `removeChildTree`（单一实现源——
  fragment.ts 的实现已含数组/hole/text/嵌套递归全分支）
- `diffSame` 类型检查分支在 `removeVNodeTree` 前先处理 `Array.isArray
  (rec.lastOutput)` 的区间 id（`pathId(parent, index + i)` 逐项——与
  transitionFragment 的展开语义一致）

**验收**：探针 2b 不崩——remove 含 `root.0.0` + `root.0.1`——契约测试锁定。

### P1 —— G2 + G7（组件多根区间清理——transform 让位 + 类型切换两路径）

**根因**：`transitionComponent` 只 `remove oldId`（首锚）——组件输出多根时
（数组平铺到 `parent.i+1...`）第二节点起残留。G7 同根：`renderComponent`
类型检查分支 dispose 后不清理 lastOutput 区间。

**修复**（核心层）：
- `transitionComponent` 需要旧输出结构——**TransformContext 扩展
  `registry`（可选）**：组件转换时查 `registry.get(ctx.oldCompId).lastOutput`
  → 数组/多节点 → 复用 `removeChildTree` 按展开区间逐项移除（首锚 +
  平铺项）→ 再 `emitNode` 新侧
- `renderComponent` 类型检查分支：dispose 后对 `rec.lastOutput`（数组 →
  展开区间；vnode → removeVNodeTree）完整清理——与 diffSame 分支行为对齐
- 单节点输出路径不变（remove oldId = 首锚 = 唯一节点——零噪音）

**验收**：probe2/probe7/probe9 全绿——多根收窄为单节点/null/异类型组件时
remove 覆盖全部平铺项——契约测试锁定。

### P2 —— G3（Fragment 符号 vnode 同态对照）

**根因**：`diffSame`「其余同态」分支对 fragment→fragment 直接 `emit(newV)`
重建——create 幂等复用旧节点但**内容变化/缩短的旧项无 remove**。

**修复**（核心层）：`diffSame` 增加 fragment 分支——`fragment → fragment`
走 `diffChildrenItems` 逐项对照（与数组同态完全对齐——keyed/unkeyed 列表
策略复用——条件渲染 `<></>` 内容更新精准增量）。其余同态（text→text 等
已被 diffSlot 前置拦截——实际不可达）保持兜底。

**验收**：probe1/probe1b 全绿——fragment 内容变化只发增量
（setText/setProp/remove 精准——无 create 残留）——契约测试锁定。

### P3 —— G4（事件 handler 移除——函数面 diff 补向）

**根因**：`diffAttrs` 函数面只遍历 `newV.props`——旧 props 有而新 props 无的
事件键不发命令——`EventRegistry` 表项残留——旧 handler 继续触发（行为错误）。

**修复**（核心层——三处）：
- `diffAttrs`：补旧侧遍历——`oldV.props` 有而 `newV.props` 无的函数键 →
  发 `{ op: 'setProp', id, key, value: undefined }`（ref 同——value
  undefined 语义 = 解绑）
- `procSetProp` 事件分支：`value === undefined` → `eventRegistry.remove(id,
  name)`（**单事件删除**——EventRegistry 补 `removeEvent(nodeId, event)`
  方法——现有 `remove(nodeId)` 是全子树删除——不能误删）
- `procSetProp` ref 分支：`value === undefined` → `refRegistry.set(id,
  undefined, prev)`（prev 退 null 已有——补 undefined 时删表条目避免残留
  ——RefRegistry.set 补 undefined 分支）

**验收**：probe3 命令流含 setProp undefined——DOM 层（场景测试）点击不触发
旧 handler——契约测试锁定。

### P4 —— G5（keyed 混合/重建路径 unmount 补发）

**根因**：`diffKeyedChildren` step 0（unkeyed 旧项移除）与 `!subseq` 冲突
重建路径只发 `remove`——unkeyed 组件项实例不卸载（`removeOldSlot` 有
unmount——同文件两处行为漂移）。

**修复**（核心层）：两路径补 `unmount`——unkeyed 组件项
（`typeof oldVn.type === 'function'`）→ `{ op: 'unmount', compId: cid }`
（与 removeOldSlot 对齐——位置身份 compId = `pathId(parent, i)`）。

**验收**：probe4 命令流含 unmount——onUnmounts 执行（契约：计数器断言）——
契约测试锁定。

### P5 —— G8（dispose 递归——子实例清理）

**根因**：`disposeComponent` 单实例删除——组件 vnode 的 compId（parent.i）
≠ 其子树内子组件实例 id（parent.i.0 / parent.i.k{key} / compId.0 特判）——
unmount 只消费自身——子实例记录残留 + onUnmounts 不执行。

**修复**（核心层）：`disposeComponent` 补递归——删除 `compId` 及
`compId + '.'` 前缀全部实例（LIFO 逆序——与 disposeAllComponents 同语义）
——注意组件输出组件的 `compId.0` 特判路径自然覆盖。

**验收**：probe10 diff 后 keys 为 `[]`——onUnmounts 执行——契约测试锁定。

### P6 —— G6（死代码清理）

**修复**：serve.ts 删除不可达的第二个 `if (!currentTree && applier.absorb.failed)`
块（前一 if 已 `reset()`——failed 恒 false）。

---

## 3. 测试计划（每修复：契约 + 场景——两层都绿才提交）

### 契约层（src/test/contract/——命令流断言——node 直跑）

| 文件 | 新增用例（命令流断言） |
| --- | --- |
| `transform.test.ts` | ① 组件多根 → 元素：remove 覆盖全平铺项（G2）② 组件多根 → null：同上 + 占位锚（G2）③ 组件多根 → 异类型组件：remove 全区间 + unmount（G1/G2 回归——探针 2b 崩溃锁定）④ fragment → fragment 同态对照：内容变化精准增量（G3） |
| `diff.test.ts` | ⑤ 事件移除：onClick 消失 → setProp value=undefined 命令（G4）⑥ ref 移除：同上（G4）⑦ keyed 混合数组 unkeyed 组件移除 → unmount 命令（G5）⑧ 冲突重建路径 unkeyed 组件 → unmount（G5）⑨ 嵌套组件移除 → unmount 递归（G8——注册表 keys 断言）⑩ keyed 组件类型切换多根 → remove 全区间（G7） |
| `keyed.test.ts` | ⑪ 混合数组分类/身份决策补充（G5 前提） |
| `events.test.ts` | ⑫ EventRegistry.removeEvent 单事件删除语义（G4 前提） |
| `vnode.test.ts` | ⑬ removeVNodeTree 数组防御纯函数（G1 前提——cleanup.ts 单测） |

### 场景层（src/test/scenario/——真实 DOM 行为锁定）

| 场景 | 锁定契约 |
| --- | --- |
| `e2e-fragment-update` | `<></>` 内容更新/缩短——childNodes 长度恒定 + 旧项真正移除（G3 DOM 实证） |
| `e2e-event-removal` | 条件 onClick（`props.enabled ? handler : undefined`）——enabled 翻 false 后点击不触发（G4 DOM 实证——事件表残留实证） |
| `e2e-nested-unmount` | 嵌套组件卸载——内层 onUnmount 执行（计数器 + 订阅清理）（G8 DOM 实证） |
| `e2e-multinode-transform` | 组件输出多根 → 单元素/null 切换——DOM 无残留节点（G2 DOM 实证） |

### 回归

- `npm run test:client`（契约 100+ 新增）→ `npm run test:scenario`（场景 107+ 新增）
- showcase 组件层不涉及（无公共面变更——transform 内部——组件代码零改动）

---

## 4. 分层归因与纪律

- **全部核心层修复**（diff/transform/事件表/实例注册表——引擎机制）——
  按 AGENTS.md 归类纪律：不修任何组件/应用——组件库 132 组件自动受益
- **修复顺序**：P0（崩溃）→ P1 → P2 → P3 → P4 → P5 → P6——每项独立提交
  + 契约测试先红后绿（探针脚本 = 失败用例——转为正式契约测试）
- **探针沉淀**：/tmp/probe-core.ts 系列全部转为 src/test/contract/ 正式用例
  （命令流断言——零 DOM——~0.2s 保持）

## 5. 已知边界（诚实裁剪）

- G4 的 DOM 实证依赖真实浏览器（node 无 DOM）——命令层断言 + 场景层
  playwright 双锁
- G8 递归卸载的 onUnmounts 顺序（LIFO）与 disposeAllComponents 一致——
  不做更深顺序语义变更（保守——最小修复面）
- 本轮不触碰渲染队列/redirect（serve 内部——已知边界——间接覆盖）
