# vdom 确定性修复计划（状态机 + 事件流理念）

> 2026-XX——目标：vdom 内部流程完全确定——算法确定 + 状态机完备 ⟹ 不应再有 bug。
> 剩余 1/300 是"算法不确定性的最后残余"——本计划消灭它 + 建立防再生机制。

---

## 0. 哲学主张（确定性定义）

```
vdom 内部确定性 = 三件套：
① 算法确定：同一 (oldTree, newTree, registry 状态) → 唯一命令流（无分支猜测）
② 状态机完备：命令流消费的每个迁移合法 + 无静默路径（违例显式报错）
③ 命令流自足：命令流完整描述 DOM 变更（零消费端猜测）

⟹ bug 只可能出现在三类不确定源：
A. 算法不确定（分支条件不精确——如 noMove 的"DOM 位置自然到位"假设）
B. 状态机不完备（迁移未定义——静默 no-op）
C. 命令流不自足（消费端需要猜测——生成端漏发命令）

修复方向 = 消灭三类不确定源（而非打补丁）。
```

## 1. 当前残余（诚实盘点）

| # | 问题 | 类别 | 状态 |
|---|---|---|---|
| 1 | **1/300**：keyed 顺移 move 命令缺失 → 旧 keyed 项 DOM 位置与新项插入交互错位 | **A（算法不确定）** | 对账器已抓——未修 |
| 2 | 渲染队列 FIFO/redirect | 间接覆盖 | 已知边界 |
| 3 | useTween/useDrag 等 hooks | 未测 | 已知边界 |
| 4 | ai-stream/auth 中间件 | 未测 | 已知边界 |
| 5 | Sim vs proc* 差异点 | 结构分析（无差分实测） | 已知边界 |

## 2. 1/300 根因（完整 d2 流分析）

```
old: FRAG > [span{k1} > X(组件输出), Y, Z]
new: FRAG > [CompX(组件), span{k1} > span{k1} > Comp]

d2 流（完整）：unmount root.2/root.3（Y/Z 移除）→ unmount root.0.0.0
  remove root.0.0.0（X 输出移除）→ create root.0.0:div insert root.0.0^root.0
  （CompX 输出）→ mount → create root.1.0:span ...（新 root.1 链）

**关键：d2 流中没有任何 move 命令！**
```

**调试定位结论（P1-1 完成——debug-dci/debug-moved 门控插桩实证）**：

1. **非 keyed 问题**：顶层组件输出对照 `id=root oldKeys=[null,null]
   newKeys=[null]`——生成器组件的输出树与 props.children 独立（key 不在
   输出树）——**全 unkeyed 位置身份分支**（非 diffKeyedChildren）
2. **确切根因**：全 unkeyed 分支 i=0 的 diffSlot（旧 span → 新 CompX——
   异态转换 transitionElement/transitionComponent）的**旧侧移除不完整**：
   d2 缺 `remove root.0`（旧 span 自身槽位）与 `unmount root.0`（旧组件
   自身）——只发了 X 输出清理（unmount root.0.0.0 + remove）——旧 span
   DOM 残留 → CompX 输出 div 的 `insert root.0.0^root.0`——parentOf 命中
   旧 span（DOM 节点）——div 错插进 span 内——终态错位

**类别 A（算法不确定）**：转换路径的移除命令不自足（组件自身
unmount/remove 缺失——只清理输出区间）——**与"每处移除 = 完整区间 +
组件 unmount"纪律违例**（转换场景的自身槽位未覆盖）。

**修复方向（P1-2）**：transitionComponent/transitionElement 的移除命令
补全——组件自身 unmount（ctx.oldCompId）+ 自身槽位 remove（ctx.oldId）
+ 输出区间清理（已有）——转换后旧侧零残留。

## 3. Phase 1：修复 1/300（算法确定性）

### P1-1：调试定位 move 缺失
- 加临时打印：`moved` 数组内容 + subseq 值（keyed 分支内）
- 确认：moved 为空的原因（oldIdxByKey/keyOf/newCs 的哪个环节）
- 复跑 reconcile（10 秒超时纪律）

### P1-2：修复
预期修复方向（视 P1-1 结果）：
- moved 为空 → 修正 moved 计算（keyed 项 oldIdx 提取）
- subseq 判定走偏 → 修正顺移前置条件
- 分支未达 → 修正 keyed 路径判定

**修复原则**：命令流完整自足——k1 顺移必须发 move（remap）——
旧 keyed 项 DOM 位置由 insert ref 精确定位（而非"自然到位"假设）。

### P1-3：契约测试（命令流断言）
- reconcile.test.ts 加案例：`FRAG > [span{k1} > X, ...]` → `[CompX, span{k1} > ...]`
  （生成器形态固定）——断言 d2 含 move root.0→root.1 + 终态等价
- 命令流断言锁定：顺移场景 move 命令必须存在（noMove 的语义范围）

### P1-4：回归
- 契约 115 全绿（fuzz 归零 0/300）
- 场景 112 全绿 + tsc

## 4. Phase 2：fuzz 归零 + 扩大覆盖（确定性验证）

### P2-1：fuzz 归零确认
- 修复后 300 对归零（多种子：42/7/2026/99 × 400 对）

### P2-2：生成器增强（组合覆盖盲区）
- **keyed 组件项**（`parent.k{key}` 组件实例——当前生成器只有 keyed 元素）
- 组件内部状态（setState——跨渲染状态保持验证）
- ctx.render 异步（渲染队列交互）
- FRAG 内 keyed 项与 unkeyed 组件项混排（1/300 形态的推广）

### P2-3：确定性审计（不变量验证）
- 同一树对 → 命令流字节级唯一（重复 diffStream 两次比对——排除
  Map 迭代序/随机/时间等非确定源）

## 5. Phase 3：确定性不变量体系（防再生机制）

### P3-1：位置推断审计（类别 A 根治）
- 所有"DOM 位置自然到位"假设逐一验证或消除：
  - `noMove` remap（keyed 顺移）——**唯一位置推断残留**
  - `insert ref` 定位（其余全部 ref 显式——无推断）
- 审计结论：noMove 之外无位置推断——修复后归零

### P3-2：slotCount 完备性审计（投影维度）
- 所有"按索引 +1"循环（build/diff/transform/removeVNodeTree/renderNative/
  transitionFragment）逐一核对 slotCount 推进 + 最后槽位 ref
- 单一实现源确认（node/children.ts——无重复实现漂移）

### P3-3：命令流自足性审计（类别 C 根治）
- 每处移除 = 完整区间（removeVNodeTree）+ 组件 unmount——无单锚 remove
- 每处 create = 幂等语义明确（替换/复用/吸收）
- 消费端零猜测（Sim 与 proc* 的语义对照——差异点全部标注 Reject）

### P3-4：差分双跑（消费端根治——单一实现源延伸）
- 同一命令流：Sim 消费 vs 真实 DOM 消费——终态对比
- 实现：e2e 场景里 server 端生成命令流 → 测试端 Sim 消费对比页面 DOM
- 根治 Sim 与 proc* 漂移（isConnected 历史教训的终局）

## 6. Phase 4：机制保障

### P4-1：CI 红门禁
- fuzz 归零为红门禁（不等价 = CI 失败）
- 契约 + 场景 + tsc 三层全绿门槛

### P4-2：确定性文档沉淀
- AGENTS.md 更新：确定性三件套定义 + 修复归档（1/300 归类）

## 7. 验收标准（全部达成 = 计划完成）

```
✅ P1：1/300 修复——fuzz 归零 0/300（多种子）
✅ P2：生成器增强覆盖（keyed 组件项/内部状态/异步）——fuzz 全绿
✅ P3：三类不确定源审计归零（位置推断/slotCount/命令流自足）
✅ P4：CI 门禁 + 差分双跑
✅ 契约 115+/115+ 场景 112/112 tsc ✅
```

## 8. 执行顺序与估计

```
P1（1/300 修复）          —— 1 步（调试 → 修复 → 测试）
P2（fuzz 扩大）           —— 2 步（生成器增强 → 多种子归零）
P3（不变量体系）          —— 3 步（审计 × 3）
P4（机制保障）            —— 1 步（CI + 文档）
总计 ~7 步——每步验收（测试绿）后进入下一步
```

## 9. 风险与诚实边界

- P1 修复可能暴露新的 fuzz 案例（连锁）——每次修复后 fuzz 复跑直到归零
- P2 生成器增强可能产生新组合失败——逐形态加入（小步快跑）
- P3 审计是"确认"而非"新验证"——对账器已保证必被抓——审计防止未来再生
- 已知边界（hooks/中间件/渲染队列）不属 core 算法确定性范围——保持诚实裁剪
