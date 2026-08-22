# vdom 状态机化改造计划（状态机 + 事件流架构）

> 目标（用户决策 2026-XX）：vdom 内部机制**完全改为基于状态机 + 事件流的
> 模式**——每个实体（节点/组件/区间）有显式状态机，每个操作（命令/迁移）
> 有 Pre/Post/Effect/Reject 精确定义——消灭"隐式路径"（静默 no-op/兜底
> 分支/防御性 return）——状态迁移完备性由机器验证。
>
> 前提（已实证）：命令流 = 事件流已就位（13 种命令）；transform 6×6 转换
> 表 = 状态机雏形；对账器（终态等价）已把 fuzz 从 17/300 归零。本计划把
> 隐式状态显式化 + 迁移完备性强制——**渐进迁移，验证器全程护航，不盲目
> 重写**（重写会把验证基线清零）。

---

## 1. 架构总览（状态机 + 事件流模型）

```
┌─ 事件流层（生成——已就位，不改）─────────────────────┐
│  build/diff → Command[]（13 种事件——NDJSON 可序列化）│
└──────────────────────┬──────────────────────────────┘
                       ↓ 事件消费
┌─ 状态机层（本计划核心）─────────────────────────────┐
│  三实体状态机：NodeState / CompState / IntervalState │
│  迁移表：状态 × 事件 → 迁移（或显式 Reject）          │
│  状态存储：nodes 表（+状态）/ 实例表（+状态）/ 区间推导 │
└──────────────────────┬──────────────────────────────┘
                       ↓ 迁移执行
┌─ DOM 层（消费端）──────────────────────────────────┐
│  真实 DOM 变异 + 事件代理表 + ref 表 + 实例注册表      │
└─────────────────────────────────────────────────────┘
                       ↑
┌─ 验证层（护航——逐迁移对账）─────────────────────────┐
│  Sim 状态机验证器：每个事件消费后验证 Post + 不变量    │
│  fuzz（终态等价——已归零）+ 场景层真实 DOM 对账        │
└─────────────────────────────────────────────────────┘
```

**核心纪律**：没有隐式路径——每个状态 × 事件对必须有迁移定义或显式
Reject；每个迁移执行后必须满足 Post（机器检查）。

## 2. 三实体状态机定义

### 2.1 NodeState（DOM 节点——元素/文本/锚）

```
ABSENT → CREATED → INSERTED → ACTIVE → REMOVED
（不存在）（表有记录）（已挂载）（子树完成）（已清理）
```

| 事件 | ABSENT | CREATED | INSERTED | ACTIVE | REMOVED |
| --- | --- | --- | --- | --- | --- |
| create（同 tag） | → CREATED | 幂等复用（attrs 更新） | 不变 | 不变 | — |
| create（异 tag） | → CREATED | 替换（旧→REMOVED） | 替换（旧→REMOVED） | 替换（旧→REMOVED） | — |
| insert | — | → INSERTED | 幂等 skip | 幂等 skip | — |
| close | — | — | → ACTIVE | 不变 | — |
| setText/setProp | — | 更新 | 更新 | 更新 | — |
| remove | — | → REMOVED | → REMOVED | → REMOVED | — |
| move | — | — | 移动+id 重映射 | 移动+id 重映射 | — |
| done.full（未 touched） | — | → REMOVED | → REMOVED | → REMOVED | — |

**状态不变量**：
- CREATED：`nodes[id]` 存在 ∧ 未挂载（isConnected=false）
- INSERTED：父链到 root ∧ `data-wf-id = id`
- ACTIVE：INSERTED ∧ close 已消费 ∧ 子树槽位 = childrenOf 展开序列（同构）
- REMOVED：`nodes[id]` 不存在 ∧ ref/事件表无该 id 前缀

### 2.2 CompState（组件实例）

```
UNMOUNTED → MOUNTING → MOUNTED → UNMOUNTING
```

| 事件 | 迁移 | 说明 |
| --- | --- | --- |
| 工厂调用（renderComponent） | UNMOUNTED → MOUNTING | await 工厂（可异步） |
| mount 命令 | MOUNTING → MOUNTED | 初始化完成审计 |
| renderFn 调用 | MOUNTED → MOUNTED | 每次渲染（状态不变——更新语义） |
| unmount 命令 / remove 区间消费 | MOUNTED → UNMOUNTING → UNMOUNTED | onUnmounts 逆序 + 递归子实例 |
| 类型切换（rec.type ≠ factory） | 任意 → UNMOUNTED → 重新 MOUNTING | dispose + 重建 |

**状态不变量（定理 3 生命周期同构）**：
- MOUNTED ⟺ 其 DOM 区间存在（节点/组件/区间三态联动）
- UNMOUNTED ⟹ 注册表无记录 ∧ onUnmounts 已执行

### 2.3 IntervalState（区间——组件/Fragment 输出的 DOM 投影）

```
COLLAPSED（0 宽锚）→ EXPANDED（N 个连续槽位）
```

| 事件 | 迁移 | 说明 |
| --- | --- | --- |
| 展开（emit 数组/FRAG/组件多根） | COLLAPSED → EXPANDED | 槽位 = pathId(parent, index+i) 连续 |
| 收缩（removeVNodeTree/transition） | EXPANDED → COLLAPSED/ABSENT | **全槽位移除**（区间一等化——G2/G7 根治） |
| 转换（transform 表） | EXPANDED ↔ COLLAPSED | 锚 ↔ 真实节点互换（占位法） |

**状态不变量**：EXPANDED ⟺ 槽位连续 ∧ 首槽位 id = 区间起点 ∧ 区间内组件实例存活。

## 3. 操作规格表（每个操作精确定义）

### 3.1 规格模板

```ts
/** <op> 操作规格
 *  Pre   : 前置条件（状态机合法输入）
 *  Post  : 后置条件（机器验证——违反 = bug）
 *  Effect: 副作用（DOM/事件表/ref 表/实例表）
 *  Reject: 显式拒绝（不再静默 no-op——隐式路径消灭）
 */
```

### 3.2 13 命令规格摘要（文档正文逐条展开）

| 命令 | Pre | Post 关键 | Reject |
| --- | --- | --- | --- |
| create | tag 合法 | nodes[id] 存在 ∧ 状态 ∈ {CREATED,INSERTED,ACTIVE} | —（异 tag 替换是合法迁移） |
| createText/createAnchor | — | 同 create | — |
| insert | id ∈ nodes ∧ parent ∈ {root} ∪ nodes | 节点挂载（ref 后/头部）∧ 状态 = INSERTED | id ∉ nodes → 显式错误（生成层 bug） |
| remove | id ∈ nodes（幂等允许缺失） | REMOVED ∧ 前缀记录/ref/事件全清 | — |
| move | id ∈ nodes ∧ parent ∈ {root} ∪ nodes | 节点移动 + 子树 id 重映射（nodes/事件/ref） | parent 不可达 → 显式错误 |
| setText | id 是文本节点 | textContent = value | id ∉ nodes → 显式错误 |
| setProp | id ∈ nodes（元素） | 属性/事件表/ref 表更新（undefined = 解绑） | 非元素 → 显式错误 |
| ref/unref | id ∈ nodes（元素） | ref 表注册/退 null | — |
| mount/unmount | compId ∈ registry（mount）/存在（unmount） | 状态 = MOUNTED/UNMOUNTED | 不匹配 → 显式错误 |
| close | 状态 = INSERTED | 状态 = ACTIVE | 未 INSERTED → 显式错误 |
| done | — | 未 touched 节点全部 REMOVED（full） | — |

### 3.3 转换表（transform——异态迁移——已 6×6，规格化补全）

```
TRANSITIONS[oldState][newState] = 迁移函数 | 显式声明：
  - 对角（同态）→ "交 diff 层"（显式声明——不再隐式 null——
    fuzz#79 教训：text×text 落空静默——必须显式）
  - 异态 → 迁移函数（text.ts/hole.ts/element.ts/component.ts/fragment.ts）
迁移函数规格：旧侧区间完整让位（removeVNodeTree——单一实现源）→ 新侧渲染
```

## 4. 验证体系（状态机验证器）

### 4.1 Sim 升级为逐迁移验证器

现有 Sim（终态对账）升级：
1. **状态跟踪**：每个节点带 NodeState 字段；实例带 CompState
2. **迁移表驱动**：命令消费前查迁移表——未定义迁移 = 显式 Reject（测试红）
3. **Post 验证**：每个命令消费后验证 Post（insert 后必须挂载/remove 后必须清除/close 后必须 ACTIVE）
4. **不变量验证**：三态联动（Comp.MOUNTED ⟺ Interval 存在）+ 事件表投影 + data-wf-id 一致性
5. **终态对账**（保留）：fuzz 零不等价

### 4.2 验证矩阵

| 层 | 验证内容 | 频率 |
| --- | --- | --- |
| 契约层 fuzz | 终态等价（300 对 → 扩展 3000 对）+ 迁移表完备（每个状态×事件对至少触发一次） | CI 每轮 |
| 场景层 | 真实 DOM 对账（渲染后 reconcile——childNodes/引用/portal）+ 状态检查（dev 注入） | CI 每轮 |
| showcase | 组件回归（166 测试——行为面） | CI 每轮 |

### 4.3 覆盖引导

fuzz 生成器按迁移表引导：每个迁移（NodeState×事件 / CompState×事件 / 转换表 6×6 异态对）在固定用例中至少覆盖一次——迁移完备性 = 机器检查的完备性。

## 5. 迁移路径（渐进——验证器全程护航）

> 纪律：每阶段结束——reconcile fuzz 全绿 + 契约 105 + 场景 107 全绿。
> **不盲目重写**：状态机化 = 显式化 + 检查化——事件流层（build/diff 生成）
> 基本不动；patch 消费层加状态跟踪；隐式路径逐点消灭。

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| **P0 规格落地** | 本计划 → design/vdom-state-machine.md 正式版；操作规格表（13 命令 + 转换表）完整展开；状态机定义（三实体）定稿 | 文档评审 |
| **P1 验证器升级** | Sim 加状态跟踪 + 迁移表查询 + Post/不变量验证；固定用例覆盖全部迁移 | 现有 105 契约全绿；新迁移用例红→绿 |
| **P2 消灭隐式路径** | ① diffSlot 文本分支统一（已修——fuzz#79）② transitionOf 对角 null → 显式"交 diff 层"声明 ③ diffSame 兜底分支 → 显式迁移或 Reject ④ 防御性 return 审计（procInsert/procMove 等）→ 标注 Reject 语义 | fuzz 3000 对零不等价；迁移完备性用例全绿 |
| **P3 运行时状态检查** | CommandApplier dev 模式：命令消费后断言 Post（状态合法）——生产零开销（dev only） | 场景层全绿（dev 检查开启） |
| **P4 状态存储显式化** | nodes 表/实例表加状态字段（内存标注——非序列化面）；dispatch 查迁移表（switch 保留——迁移表为规格注释 + 检查） | 契约/场景全绿；性能无回退 |
| **P5 收口** | fuzz 扩展 10000 对（多种子）零不等价；场景层 e2e-reconcile 入仓；文档沉淀（AGENTS.md 状态机章节——定理 + 规格表作为验收纪律） | 全量回归 + showcase 166 |

## 6. 风险与边界（诚实裁剪）

- **开销**：状态跟踪/Post 检查仅 dev 模式/测试层——生产路径零增量
- **兼容**：命令流协议不变（NDJSON 13 种）——SSR/服务端/事件代理不受影响
- **验证器与实现的漂移**：Sim 升级后仍是独立实现——**单一实现源原则**
  （patch 语义核心提取为纯函数模块——Sim 与 CommandApplier 共用）——
  作为 P3 前置（消灭 isConnected 类误报的根治）
- **不覆盖**：组件层 hooks 状态机（useX 内部——场景层测试兜底）；渲染
  队列/redirect（serve 内部——已知边界）；性能优化（正确性优先）
- **重写风险**：渐进迁移——每阶段验证器全绿——不出现"无护航的重写窗口"

## 7. 测试计划（最后一步——验证架构收口）

### 契约层新增
- `state-machine.test.ts`：三实体状态机迁移表完备性（每迁移至少一次用例）
- `command-spec.test.ts`：13 命令 Pre/Post/Reject 规格用例（非法输入 → Reject
  断言——不再静默）
- reconcile 扩展：fuzz 3000 对 + 组件树专项（输出多根/输出组件/keyed 切换/
  嵌套卸载）

### 场景层新增
- `e2e-reconcile`：真实 DOM 逐迁移对账（dev 检查注入——childNodes/引用/portal）
- 现有 107 场景全量回归

### 验收标准
```
① 契约层：105 现有 + 新增全部绿——fuzz 3000 对零不等价（多种子稳定）
② 场景层：107 现有 + e2e-reconcile 全绿（状态检查开启）
③ showcase：166 测试全绿（行为面无回退）
④ 迁移完备性：三实体状态机每个迁移至少一个用例——机器可查
⑤ 隐式路径审计：diffSlot/transitionOf/diffSame/防御性 return 全部显式化
```

## 8. 执行顺序与进度

```
P0  规格文档定稿（本计划）                              ✅ 完成
P1  验证器升级（Sim 状态机化 + 迁移用例）——现有测试护航   ✅ 完成
    - Sim 加 NodeState 跟踪（created/inserted/active）
    - Post 验证：insert（挂载/状态）/ close（ACTIVE）/ remove（记录清除）/
      setText/setProp（节点存在性）——违反 = 显式 throw
    - 迁移覆盖用例 9 个（状态流/Reject×5/幂等 skip/remap 保持）——14/14 绿
P2  消灭隐式路径（对角显式化/兜底分支/防御审计）          ✅ 完成
    - transform 落空分支显式 Reject（diffSlot/diffComponentOutput/
      emitWithKey 共 5 处——fuzz#79 教训：静默落空消灭）
    - diffSame 兜底 → 显式 Reject——**抓到一个真实隐式路径**：
      element↔element 同态但 tag 不同（div→span）之前走"兜底重建"
      （节点记录残留隐患）——改为显式重建迁移（remove 让位 + 新侧渲染）
    - 防御性 return 审计标注（procInsert/procMove/procSetText/procSetProp
      ——Reject 语义注释——生产保留防御——Sim 测试层显式捕获）
P3  验证器可信度兜底 + dev 状态检查
    P3a  e2e-reconcile（场景层真实 DOM 对账）                  ✅ 完成
         - registry 新增 reconcile 场景（keyed 增删/循环移位/
           条件空洞/数组展开——复杂树 + 5 个交互路径）
         - auditDom 页面内对账（id 唯一/格式/兄弟连续/投影完整）
         - 5 测试全绿（初始/增项/空洞往返/冲突重建/组合交互）
    P3b  CommandApplier dev 模式 Post 断言                        ✅ 完成
         - patch/verify.ts（createDevVerifier——insert/remove/setText/
           setProp/move 的 Post 断言——console.error 报告不中断）
         - CommandApplier.devVerify 字段 + apply 后调用（生产零开销）
         - serve.ts 注入：window.__WF_DEV__ 开启（场景测试 addInitScript）
         - e2e-reconcile 5 测试全部开启 dev 模式——违例零报告
    P3c  单一实现源（patch 核心纯函数化——Sim/CommandApplier 共用——
         消灭双实现漂移——较大重构——独立排期）                    ← 下一步
P4  状态存储显式化 + dispatch 迁移表化（评估——switch 保留 + 规格注释）
P5  收口（fuzz 万级 + 文档沉淀）
```

### 当前状态（2026-XX）

| 项 | 状态 |
| --- | --- |
| 契约层 | 114/114 全绿（105 现有 + reconcile 14：终态等价 5 + 状态机迁移 9） |
| 场景层 | 112/112 全绿（107 现有 + e2e-reconcile 5——真实 DOM 对账） |
| fuzz | 300 对零不等价 + 零状态机违例（种子 42——可复现） |
| tsc | 通过 |
| 修复实录 | fuzz#79（文本交叉静默）/ fuzz#117（FRAG 区间）/ fuzz#214（keyed 文本漏删）/ G3（fragment 对照）/ G4（对称 diff）/ G8（递归卸载）/ div→span 重建显式化 |
```
