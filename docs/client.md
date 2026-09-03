# weifuwu 客户端文档（client）

> 前端开发者入口。**代码即文档**：本文件只写「地图 + 规则要点」——
> 细节全部指向源码/测试（源码就是最高保真文档）。
> 组件编写规范入口在本文件 §5（新增/修改组件必读）。

## 目录

- [1. 快速上手](#1-快速上手)
- [2. 组件清单](#2-组件清单)
- [3. 设计语言](#3-设计语言)
- [4. 布局系统](#4-布局系统)
- [5. 组件编写规范（唯一入口）](#5-组件编写规范唯一入口)
- [6. 前端架构导论](#6-前端架构导论)
- [7. 关键范式](#7-关键范式)

---

## 1. 快速上手

```tsx
import { createApp, Router, Button, Modal } from 'weifuwu'

const app = createApp({ mount: '#root' })
app.router(Router())
// 组件 = 工厂同步 + 渲染纯同步——见 §5.1
```

前端三层：`uiServe`（应用引导）/ `uiSsr`（服务端渲染）/ `components`（UI 组件库）。
入口实现：`src/client/index.ts` · 中间件：`src/client/middleware/`。

## 2. 组件清单

**134 个组件**——源码目录即清单：`src/client/components/<Comp>/<Comp>.ts`（每个含
`<Comp>.css` + 契约测试）。展示与使用示例：`apps/showcase/`（localhost:3200——
`/components/<id>` 每组件一页 + demo 源码即用法）。

组件分类速查（详见 `apps/showcase/src/demos/` 与 registry）：

| 类 | 代表组件 |
| --- | --- |
| 通用基础 | Button / Card / Badge / Avatar / Alert / EmptyState / Loading / Modal / Drawer |
| 表单 | Input / Textarea / Select / DatePicker / Upload / Form / Checkbox / Switch / Slider |
| 数据展示 | Table / VirtualTable / Chart / Tree / CodeBlock / DiffView / Kanban |
| 导航 | NavBar / TabBar / Breadcrumb / Pagination / Menu / NavMenu / Anchor |
| 反馈 | Toast / Confirm / Notification / Popconfirm / ProgressBar / Skeleton |
| AI 特色 | AiChat / ChatInput / ToolCallCard / ApprovalCard / CitationCard / StreamingText |
| 命令式 | `toast()` / `confirm()` / `ui.openPopup()` / `ui.render()` |

移动端适配：断点 768px · 44px 命中区 · safe-area 常量——组件与布局内建。

**三库对照**（antd / Element Plus / shadcn-ui 映射）——表格历史长度大，按需查：
源码键 `apps/showcase/src/registry/components.ts`（每组件 `meta: { antd, ep, shadcn }`
字段）是**机制化事实源**——查询即 grep，不再维护纸质映射表。

## 3. 设计语言

微流明（Whisper Luminance）：中性色主导、品牌色点睛、动效短促有目的（120–300ms）、
1px 边界即结构。**Token 即规范**——`src/client/layout/style.css`（183 双层 token：
色阶/排版/动效/圆角/阴影/z-index）——组件只引用 token、零硬编码（audit 强制）。

品牌换色 = 改 seed 一个值；预设主题 = `data-theme` 一个属性（minimal/dark）。

## 4. 布局系统

`src/client/layout/`——49 原语（`_*.css`）+ 92 工具 + 2 内部，全部 `wf-` 前缀：

- **原语**：`wf-stack` / `wf-row` / `wf-grid` / `wf-center` / `wf-card-surface` / `wf-divider`
- **工具**：`wf-padding` / `wf-margin` / `wf-text-*` / `wf-bg-*` / `wf-hidden`
- **命名规则**：三类词根 + 三后缀（完整词根表见 `apps/showcase/src/demos/layout.tsx`
  与 `src/test/contract/layout-inventory.test.ts` L1 计数断言——**测试即登记表**）

零值形态唯一（`none` 归一）· 对齐域禁方向词 · 双名歼灭——layout-inventory 8 断言锁定。

## 5. 组件编写规范（唯一入口）

> 新建/修改组件前读本节——其余 § 按需。
> 规则可执行、检查可机制化：**红线写错即响**（§5.6），作者只需记住清单。

### 5.1 作者契约

- 工厂**同步**（类型层强制）· 渲染**纯同步** · 异步全在 hooks/事件回调
- 状态闭包 mount 作用域 · 稳定回调/ref 定义 mount 层
- 资源清理 `ctx.ui.hold(fn)` · 浏览器环境经 `ctx.browser`（**零全局 window/document**
  ——SSR 崩溃铁律，BackTop 实证）
- **memo（opt-in 2027-09）**：高频输入/大输出组件可在工厂返回的 render 函数上挂
  `render.shouldRender = (prevProps, nextProps) => boolean`——返回 **false = 跳过
  本拍渲染**（复用上拍输出——DOM 零扰动）。语义：返回 false 表示「不需要重渲染」。
  回调/类函数属性差异**不触发**（比较器自有豁免权——如 CodeEditor 忽略 onChange
  闭包引用）。默认不挂 = 行为完全不变。典型：CodeEditor（value/lang/rows/readOnly
  比较——高频输入页面零 diff 扰动）

### 5.2 三件套

```
src/client/components/<Comp>/
  <Comp>.ts    # 组件
  <Comp>.css   # 样式（必有——style-audit 文件数基线 +1）
  <Comp>.test.ts  # 契约 harness（命令流断言——零浏览器）
```

### 5.3 API 形状

props camelCase · **`className=`（组件 props）`class=`（DOM 元素）** ·
受控三件套（value/onChange + 缺回调 warn）· 事件经事件表（函数 props 不写 attribute）·
受控回流门控（引用比较 + live 门控）· value 走 property · aria 布尔归一 ·
可交互 div 三件套：role + tabindex + onKeyDown

### 5.4 CSS 纪律

全部 `--wf-*` token 化（零硬编码色/字号）· 类名 `wf-` 前缀 ·
**状态变体类必须有规则或 `:where(.wf-x) {}` 显式声明**（L3 已扩围组件源码——未定义立即红）·
动效 `--wf-dur-*`/`--wf-ease-*` · transition 含 visibility（隐藏不可 Tab 聚焦）

### 5.5 测试二层（覆盖哨兵 ≥2 层）

1. **契约 harness**（`<Comp>.test.ts`——mount/render/createTable 命令流断言）
2. **showcase comp**（`apps/showcase/test/comp-<id>.test.ts`——真实 DOM：
   浮层断言「在哪」（assertPopupGeometry）· 表单断言值回流 · 交互断言操作→状态）

### 5.6 红线（机制化——写错即响）

| 红线 | 机制 |
| --- | --- |
| 空串=空洞 · isHoleKind/isTextKind 单源 | audit:semantics |
| 硬编码色/字号 | audit:theme + style-audit S1/S6 |
| 状态变体类未定义 | layout-inventory L3 |
| 受控回流未门控 · 死变量/死函数 | audit:interactivity |
| renderFn 同步段 timer · 全局 window | effect-guard + audit:vdom |
| 交互面无测试断言 | audit:interactivity L2 |
| 事件进 attrs / value 走 attribute | 契约 7/8 |

### 5.7 注册与文档

`src/client/components/index.ts` 导出 · `apps/showcase/src/registry/components.ts`
**追加不替换**（四字段 + gotchas）· demos 注册（组件名=demo 键）·
style-audit 文件数基线 +1 · 覆盖哨兵跑绿（`scripts/audit-component-coverage.mjs`）

### 5.8 修改纪律

范围：应用层修用例 · 组件层修组件 · **核心层修核心**（引擎 bug 透过组件暴露）·
R-03：类名/结构变更**反查测试选择器**（`[class*="..."]` 定位器）·
行为变化**必带契约测试** · 机制化优先（能进审计不靠记忆）

## 6. 前端架构导论

```
浏览器导航/URL ──► UIRouter（共享 trie 内核 src/shared/router/）
                      │
                    uiServe ──► 渲染周期（src/client/vdom/core/v2/cycle.ts）
                      │            build/diff → 命令流（13 种 NDJSON）
                      │            → apply（DOM）→ cleanup（卸载）
                      └──► ctx 中间件（router/api/auth/ws/i18n/confirm/toast）
```

- **命令流即文档**：13 种命令（create/insert/remove/setProp/…）序列化可回放——
  `src/client/vdom/core/patch/types.ts` 类型定义就是协议
- **状态机**：NodeState/CompState/IntervalState——`patch/state-machine.ts` 单一实现源
- **SSR ≡ SPA 首帧**：uiSsr 同路由器同 bundle——吸收零差异
- hooks 面：`src/client/vdom/hooks/`（useAsyncData/useObservable/signal——getter 纪律）
- 全链路 Observable（cycle/observable.ts）——组合/取消/回放四优势

## 7. 关键范式

- **命令式弹窗唯一形态**：`ctx.ui.openPopup(opts)` → PopupHandle——`src/client/vdom/hooks/popup-manager.ts`
  ——**anchor 必传**（无 anchor 触发按钮被当外部点击 + toggle 死循环）
- **焦点管理三范式**：`src/client/components/` 内实现 + `src/test/scenario/e2e-focus*.test.ts`
  场景断言（Trap 浮层 / 可交互 div 键盘可达 / 列表 roving focus）
- **受控输入纪律**：onInput 逐键 + onChange 失焦——ChatInput 实现即示例
- **getter 纪律**：一切会变化的值 = `() => T`——任意位置调用取最新
- **组件定时器**：工厂期创建 + `ctx.ui.hold` 注册清理（renderFn 窗口内建 timer = dev warn）

---

> **运行**：`npm run test:client`（428 契约）· `npm run test:scenario`（123 场景）·
> `npm run test:showcase`（324 组件测试）——全量防线见 AGENTS.md §1。
