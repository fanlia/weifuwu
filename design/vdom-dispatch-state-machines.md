# vdom 分派全状态机化（Phase 7——if/else 收敛到查表）

> 状态：**已完成**（2026-12）
> 背景：四状态机（route / lifecycle / x2y / KEY_DIFFERS）落地后，vdom2 仍有 7 处分派型
> if/else 链（build/hydrate/removeOldOutput/patchProps/setProp/auditTree/位置循环）。
> 统一原则不变：**分派逻辑走查表（状态 × 事件 → 行为）；值判断（props 相等/null/tag 匹配）
> 保留条件**——本计划把剩余分派型 if/else 全部收敛为查表，值判断型 if 保留。
>
> **实施结果（2026-12）**：全部收敛完成——新增 BUILDERS/REMOVERS/DISPOSERS/PROP_SETTERS/
> PROP_PATCHERS/HYDRATERS/AUDITERS/CHILD_HTML/POS/KEYED_NEW/REMOVE_OLD/NAME_SHORT/NAME_FULL
> 13 张分派表；`src/test/vdom-dispatch-audit.test.ts` 审计基线（A1 分派入口查表 + 零 else if /
> A2 全目录 else if ≤ 19 / A3 表完整性）全绿；**vdom 测试 109 全绿（106 既有 + 3 新增审计），
> tsc --noEmit 0 错误**。分派函数体零 else if；仅剩 19 个 else if 全部为值判断
> （nodeType/null/key 匹配——按原则保留条件）。

## 1. 目标分派点 → 状态机表

| 分派点 | 文件 | 状态 | 转换表 |
|--------|------|------|--------|
| `buildVNode` | build.ts | kind（7 种）| `BUILDERS[kind]` |
| `removeOldOutput` | patch.ts | kind | `REMOVERS[kind]` |
| `disposeSubtree` | patch.ts | kind（comp→dispose / 其余→递归）| `DISPOSERS[kind]` |
| `patchProps` | patch.ts | 属性通道 | `PROP_PATCHERS[channel]` |
| `setProp` | transform.ts | 属性通道 | `PROP_SETTERS[channel]` + `propChannelOf`（单一判定源）|
| `renderValueHydrating` | hydrate.ts | kind | `HYDRATERS[kind]` |
| `auditTree` | audit.ts | kind | `AUDITERS[kind]` |
| `arrToHtml` 内层 | x2html.ts | kind（hole/array/其他）| `CHILD_HTML[kind]` |
| `vnDesc`/`dumpTree` 名称 | trace.ts | type class | `NAME_OF[class]` |
| **diffUnkeyed/diffKeyed 位置循环** | patch.ts | **(oldKind, newKind) 位置转换** | **`POS[oldKind][newKind]`** |

**位置级（POS）说明**：数组 diff 每个位置是 (oldKind, newKind) 转换——与 x2y 同构的
位置语义矩阵。PosKind = 'hole' | 'real'（text/native/comp/portal）| 'multi'（arr/frag）。
位置级值判断保留：数组缩短裁剪（i ≥ newChildren.length）、引用短路（oldC === newC）、
disposed 兜底（I1）、插入位置推导。

**属性通道（propChannelOf）**：单一判定源（transform.ts 导出）——
enumerated/class/style/ref/event/value/indeterminate/innerHTML/aria/boolean-attr/default。
setProp 与 patchProps 共用——patchProps 的「移除分支」= 各通道的 nv==null 处理（值判断保留）。

## 2. 审计基线（enforcement）

`src/test/vdom-dispatch-audit.test.ts`——静态扫描 vdom2 源码：
1. 各分派入口函数体必须包含对应表引用（`BUILDERS[` / `REMOVERS[` / `PROP_SETTERS[` /
   `PROP_PATCHERS[` / `HYDRATERS[` / `AUDITERS[` / `POS[` / `KEY_DIFFERS[` / `TRANSITIONS[`）
2. 分派函数体内禁止 `else if`（值判断型单层 `if` 允许）
3. 全目录 `else if` 总数 ≤ 基线（只降不升）

## 3. 实施顺序（已完成——每步 vdom 测试回归保绿）

```
✅ Step 1：transform.ts——propChannelOf + PROP_SETTERS（setProp 表化）
✅ Step 2：patch.ts——PROP_PATCHERS（patchProps 表化，复用 propChannelOf）
✅ Step 3：patch.ts——REMOVERS（removeOldOutput）+ DISPOSERS（disposeSubtree）
✅ Step 4：build.ts——BUILDERS（buildVNode 表化）
✅ Step 5：hydrate.ts——HYDRATERS
✅ Step 6：audit.ts——AUDITERS
✅ Step 7：x2html.ts——CHILD_HTML；trace.ts——NAME_OF
✅ Step 8：patch.ts——POS 位置转换表（diffUnkeyed/diffKeyed）→ KEYED_NEW + REMOVE_OLD
✅ Step 9：审计测试 + 全量 vdom 回归
```

## 4. 验收标准（全部达成）

1. ✅ 全量 vdom 测试绿（109 = 106 既有 + 3 审计；相关回归 134 全绿）
2. ✅ 7 处分派链全部收敛为查表——分派函数体零 `else if`（A1 强制）
3. ✅ 审计基线测试通过——新分派代码必须走表（防回退；A2 全目录 else if ≤ 19）
4. ✅ 行为不变：9×9 矩阵 / 占位法 / keyed 移动 / portal 复用 等既有测试全绿；tsc 0 错误
