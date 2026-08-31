# KEYED-COMPONENT-MOVE-PLAN——keyed 组件顺移底层机制修复（2027-10）

> **定位**：VDOM-CORE-EXCELLENCE A 波次登记缺口（keyed 组件顺移）的
> 底层机制收口。**探针实证后缺口重定位**：
> - ~~状态丢失~~：keepSegments（A 波次已修）——工厂增量 0/段保留/闭包
>   状态在——**已解决**
> - **真缺口**：顺移走「输出物理重建」（remove 区间 + lastOutput 清 +
>   全量 emit + mount 信号重发）——正确性 ✓ 但 ①命令数 ~3N（vs 物理
>   move N）②输出 DOM 引用失效（ref/动画/第三方持引用场景）③unmount/
>   mount 生命周期信号噪声（实例面重注册——语义噪声）
>
> **目标**：keyed 组件跨槽位移动 → **输出锚物理 move**（零重建/零段
> 扰动/零信号噪声/**DOM 引用稳定**）——命令数 O(N)、真实 detach+insert。

---

## 1. 机制设计（v2 命令流层）

### M1 段输出根枚举（单一实现源）

```ts
/** 段输出的物理节点 id 清单（keyedId 子空间——tracker 实证形态） */
function outputRootIds(seg: Segment, kid: string): string[] {
  const out = seg.lastOutput
  if (out === undefined || out === null) return [kid + '.0']       // 锚
  if (Array.isArray(out)) return out.map((_, i) => `${kid}.${i}`)  // 数组平铺
  const t = (out as VNode).type
  if (typeof t === 'string' || typeof out === 'string' || typeof out === 'number')
    return [kid + '.0']                                            // 单 el/text
  return [kid + '.0']                                              // 嵌套组件（子空间递归首根）
}
```
- **数据源**：tracker 实证（A 波次 SIM-DBG：root.0.kk%2E2.0/.0.0/.1——
  锚/text/数组项全在 `kid.i`）
- **单测**：形态全覆盖（锚/单 el/数组/嵌套组件）

### M2 顺移物理 move 命令生成

**movedComp 排除撤销** → 组件项 moved 走专用分支：
```ts
for (const m of moved) {
  const c = newCs[m.newIdx] as VNode
  if (typeof c.type === 'function') {
    // keyed 组件物理 move：逐输出根 detach+insert（id 自映射——段/状态零扰动）
    const kid = keyedId(parent, keyOf(c)!)
    const roots = outputRootIds(segments.get(kid), kid)
    let ref = prevOutputRoot   // 新位置左邻输出根（M3）
    for (const rid of roots) {
      cmds.push({ op: 'move', id: rid, parent, ref, newId: rid, noMove: false })
      ref = rid                // 链式：数组多节点保持相对顺序
    }
  } else { /* 元素项：现有槽位 remap（noMove: true）原样 */ }
}
```

### M3 ref 链（新位置左邻输出根）

- `outputRootId(c, parent, idx, segments)` 统一 helper：
  **元素/文本 → 槽位 id**（pathId）；**组件 → kid + '.0'**（首输出根）
- moved 排序（allLeft 正序/allRight 逆序——现状保留）——**ref = 新序
  前一项的 outputRootId**（已 move 到位或未动——节点必在）

### M4 消费端/Tracker（零改动验证）

- **procMove（noMove=false）**：detach + insert(ref 后)——**已有语义** ✓
- **tracker**：move 自映射（id===newId）——**Post hasPrefix(newId) ✓**
  （锚/el 在 tracker——A 波次已修）
- **Sim**：同 procMove 语义——**终态等价由对账器裁决**

---

## 2. 波次（紧凑 3 步）

### M1 段输出根枚举 + 单测
- `outputRootIds` 实现 + 形态单测（锚/单 el/数组/嵌套——4 形态）
- 验收：tsc 0 错 + 单测绿

### M2 物理 move 命令生成 + 回归
- movedComp 排除撤销 → 组件项物理 move 分支（M2 命令 + M3 ref 链）
- **回归门**：fuzz D5/D6 1310 对全绿 + reconcile 1200+300 全绿
  （**任何不等价 = 立即回退重建路径**——判负记录）
- 验收：tsc 0 错 + fuzz 全绿

### M3 P 契约升级 + 性能对账 + 收尾
- key-inject P 后半段**恢复「工厂不重跑」断言** + 新增：
  - **零 unmount/mount 信号**（生命周期零噪声）
  - **状态闭包保持**（内部计数器跨顺移延续——DOM 引用稳定的行为面）
- 命令数对账：删头前移命令数对比（重建 ~3N vs move ~N）——**基线登记**
- 全量回归（契约/场景/showcase）+ audit:vdom + 计划登记收官

---

## 3. 风险与回退

| 风险 | 缓解 |
|---|---|
| ref 链落空（前邻节点不在） | 前邻输出根必在（已 move/未动）——Sim 终态等价兜底 |
| 数组多节点顺序错乱 | 链式 move（ref=前节点）——D6 数组输出场景覆盖 |
| fuzz 捕获新不等价 | **立即回退 movedComp 排除**（重建路径是已验证安全网）——判负记录 |
| lastOutput 形态盲区 | M1 单测形态全覆盖 + keepSegments 兜底（段在即正确） |

## 4. 验收判据（红线）

1. fuzz D5/D6 1310 对 + reconcile 1200+300 全绿（不回归）
2. P 契约：删头前移 = 零生命周期信号 + 工厂不重跑 + 状态闭包保持
3. 命令数基线：删头前移 ≤ N+常数（move 形态）
4. 全量回归门：契约 417+/417+ · 场景 123/123 · showcase 320/320 ·
   audit:all exit 0
