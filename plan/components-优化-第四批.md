# 组件优化第四批 —— Children 类型单源化（VNodeChild 55 处）+ C6 哨兵

> 目标：weifuwu/components 第四批——探针 8 面——真面 1 个（children 类型面缝隙 55 处——`children?: any` · `any[]` · Layout style any）+ C6 哨兵（类型面红线条）。

## 探针实证（/tmp/probe-n4-*.mjs）

| 面 | 读数 | 判定 |
| --- | --- | --- |
| 类型严格度（variant/size/type） | union 88 · string 1（RelationGraph type——数据面自定义合理） | ✅ 判负（单例） |
| HTML 注入面 | innerHTML 6（Editor 机制面——DOM 直写设计）· sanitize/escape **14 处**（Editor/model + FilePreview markdown） | ✅ 判负（XSS 防线已建——sanitize 面健康） |
| onChange 签名 | 值首参 37 主形态 · 零参 3（合法形态）· 多参 2 | ✅ 判负（主形态一致） |
| 公共 prop 覆盖 | size 48 · disabled 54 · variant 18 · loading 9（按需） | ✅ 判负 |
| hooks 使用分布 | openPopup 36（命令式弹层主面）· useOpen 4（组件化弹层）· onUnmount 13 · hold 10 | ✅ 判负（设计一致） |
| portal 面 | 3 组件 createPortal——弹层主体走内核 popup 机制 | ✅ 判负 |
| **children 类型面** | **`children?: any` ×44**（DropZone/Watermark 等）· `any[] = []` ×8（Textarea/CopyButton）· Layout `any; style?: any` ×3 · Resizable 1 | ⚠️ **真面①** |
| VNodeChild 单源 | **已存在**（vnode.ts L32——`VNode \| string \| number \| boolean \| null \| undefined \| VNodeChild[]`——index.ts L59 已导出——**组件没用**） | ⚠️ 单源就位未接线 |

**真面①（55 处）**：children 类型 = any（44）· any[]（8）· Layout/R 系列（4）——**VNodeChild 类型已单源但组件全部绕过**——接线 = API 类型面统一（防 children 误用——map/遍历类型安全）——**进 typecheck 闭环**（tsc 驱动修复——替换后组件内 children 使用处类型错误暴露修正）。

## 波次计划

### W0 —— C6 哨兵 + 残留确认

1. **C6-① 类型面哨兵**：组件 props `children?: any` / `\w+?: any`（props 接口内——非实现层）＝红——登记表（55——W1 清 0）
2. **C3-② 扩展**：as any 词面 + **类型注解 any**（`?: any`/`: any`——props 面——只降不升基线）
3. 残留确认：RelationGraph type（判负登记——数据面自定义）· 零参 onChange（合法形态判负）· Layout style any（入真面）
4. 负控：新增 `children?: any` → 红

**验收**：C6-① 55 登记 · 负控红 · 既有线全绿

### W1 —— Children 类型单源化（55 → 0）

1. **批量替换**：`children?: any` → `children?: VNodeChild`（44）· `any[] = []` → `VNodeChild[]`（8）· Layout/R 系（4——含 style any → CSSProperties）
2. **import 补全**（`import type { VNodeChild } from '../../vdom/index.ts'`——并入既有 vdom import）
3. **tsc 驱动闭环**：children 使用处类型错误（map 回调/属性访问——原 any 掩盖）逐处修（**真实收益**——暴露隐藏类型问题）
4. **测试回归**：契约 452（children 运行时不变——纯类型化）

**验收**：C6-① 55→0 · tsc 0 · 契约 452 · showcase 328 · **children 使用处零类型错误**

### W2 —— 收尾确认

1. Layout style any（观感——value 面？——看上下文——若 CSSProperties 可表达 → 修）
2. RelationGraph（判负登记入 docs）· 零参（判负）
3. 全量回归门

**验收**：C6-① 0 · 全量门绿

### W3 —— 收尾

1. docs/client.md §5.3 API 形状补 children 类型纪律（VNodeChild 单源）
2. AGENTS 快照（C6 · VNodeChild 55 接线）
3. 全量回归门（client/showcase/场景/server/平台/audit）
4. 计划归档

## 判负记录

| 面 | 判负理由 | 推翻条件 |
| --- | --- | --- |
| RelationGraph type?: string | 数据面自定义类型（图节点 type——非控件枚举） | type 值域收敛为枚举（公共 API 面） |
| 零参 onChange ×3 | 合法形态（回调无参——通知式） | 值参语义（onChange 无值回传）实证 |
| HTML 消毒面扩 | sanitize 14 处已建（Editor/model + FilePreview markdown）——面健康 | 新 HTML 渲染组件无 sanitize（审计链） |
| hooks 分布归一 | openPopup 命令式 + useOpen 组件化 = 设计双轨（弹层两形态） | 双轨混淆（组件化弹层误用 openPopup）实证 |
