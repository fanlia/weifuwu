# weifuwu/layout + weifuwu/components 视觉与交互精修计划（P8）

> 目标：从"零自定义 CSS"（P5-P7 已达成）迈向**专业质感与交互完备**。
> 前置事实：P0-P7 已交付 z-index 层级 / 无障碍基线 / 暗色 / 排版 / 组件变量化 / @layer / prose；全量 796 测试 + style-audit 8 项全绿。
> 本阶段不动架构，聚焦四件事：**动效语言**（当前近乎为零且 exit 动画是死代码）、**键盘可达性**（多处可聚焦不可操作）、**语义一致性**（对比度/图标/Badge-Tag 重复）、**过渡态集成**（loading/数字动画）。

## 阶段总览

| 阶段 | 内容 | 工作量 | 风险 | 依赖 | 状态 |
|---|---|---|---|---|---|
| P0 | 动效 Token + exit 动画机制（修死代码） | M | 中 | — | ✅ |
| P1 | 键盘可达性补齐（Table/Card/Tabs/Modal/Dropdown/DatePicker） | L | 中 | — | ✅ |
| P2 | 语义色对比度达标 + 硬编码色值 token 化 | S | 低 | — | ✅ |
| P3 | 内联 SVG 图标体系（替换文本字形/emoji） | L | 低 | — | ✅ |
| P4 | 组件语义分化与交互安全（Badge/Tag、Toast、Confirm、elevate、DatePicker 触达） | M | 低 | P3 | ✅ |
| P5 | 排版精细化（类型阶梯 + tabular-nums + CJK token + display 级） | S | 低 | — | ✅ |
| P6 | 过渡态集成（Table loading / StatCard 数字动画 / Button loading spinner） | M | 低 | P0 | ✅ |

每阶段门禁：全量测试 + style-audit 扩展 + build + agent-browser 走查。

---

## P0 — 动效 Token + exit 动画机制（修死代码）

**问题（三处实证）**：
1. `Modal.css`/`Drawer.css` 定义了 `.wf-modal--exit`/`.wf-drawer--exit` 及退场 keyframes，但 `Modal.ts`/`Drawer.ts` 只渲染 `--enter`——**退场类从未挂上，是死代码**（违反 CS-01 精神）。
2. `Confirm` 命令式路径 `finish()` 直接 `callRefCleanup` 立即卸载——Modal 退场动画永远跑不出来，弹窗"啪"地消失。
3. `Toast.css` 只有 `wf-toast-in` 入场，无退场。
4. 动效 Token 只有 `--wf-transition: 150ms ease` 一档——没有 easing 曲线、时长阶梯、位移量，组件动效无法收敛成同一语言。

**方案**：

a) 动效 Token（`_tokens.css` 语义层新增，默认值不破坏现状）：

```css
/* 动效 — 时长阶梯 + 缓动曲线 + 位移量 */
--wf-dur-fast: 120ms;
--wf-dur-base: 200ms;
--wf-dur-slow: 300ms;
--wf-ease-out: cubic-bezier(0.16, 1, 0.3, 1);   /* 入场：快出缓停 */
--wf-ease-in:  cubic-bezier(0.4, 0, 1, 1);       /* 退场：渐入加速 */
--wf-ease-snap: cubic-bezier(0.34, 1.56, 0.64, 1); /* 选中/弹跳类 */
--wf-motion-sm: 4px;
--wf-motion-md: 8px;
--wf-motion-lg: 24px;  /* drawer 全幅位移 */
--wf-transition: var(--wf-dur-base) var(--wf-ease-out); /* 保持旧名兼容 */
```

b) exit 动画公共机制：`src/client/motion.ts` 新增 `animateOut(el, classSuffix, done)`——

```ts
/** 挂 --exit 类，animationend 后回调（含 reduced-motion 立即回调） */
export function animateOut(el: HTMLElement, onDone: () => void): void
```

- 挂载 `wf-modal--exit` / `wf-drawer--exit` 类 → `animationend`（或 `prefers-reduced-motion: reduce` 匹配时）→ `onDone()`（卸载/清理）。
- `Modal`/`Drawer` 关闭路径改为：先 `animateOut` 再置 `open=false`；`Confirm.finish()` 经同一机制延迟 `callRefCleanup`。
- `Toast` 补退场（`wf-toast-out`：opacity→0 + translateY(-8px)，200ms ease-in）。

c) 微交互基线（P0 顺带，成本低收益高）：
- `Button` 补 `:active { transform: scale(0.98) }`（按压反馈）——同时给 `.wf-btn` 加 `will-change` 仅在按压瞬间。
- `Card hover`/`StatCard` 抬升改引用动效 Token（与 P4 的 elevate 提炼同步做）。
- `Tabs` 下划线补 `transition: transform/left`（激活指示滑动）。
- `wf-tab--active`/`wf-segmented` 选中态加 ease-snap。

**验证**：
- `style-audit` 新增：① 动效 Token 存在（`--wf-ease-out`/`--wf-dur-base`）；② **`--enter` 与 `--exit` 类必须成对**（扫组件 CSS，有 `--enter` 无 `--exit` 即报）；③ `@keyframes` 命名统一 `wf-<component>-*` 前缀。
- 组件测试：Modal 关闭先挂 exit 类、animationend 后才置 open=false（renderVNode 断言类名时序 + 假 animationend）。
- `Confirm` 测试：`finish` 后 container 延迟移除。
- 浏览器走查：Modal/Drawer/Toast/Confirm 关闭均有退场；reduced-motion 下直接消失（无闪烁）。

---

## P1 — 键盘可达性补齐

**问题（"可聚焦不可操作"是最差可达性，全列实证）**：

| 组件 | 现状 | 问题 |
|---|---|---|
| `Table` 可排序 th | `tabindex=0` + onClick | **无 onKeyDown**，Enter/Space 无效 |
| `Card clickable` | `role="button" + tabindex` | 无按键处理 |
| `Tabs` | 无 tabindex/无 keydown | 无 roving tabindex，方向键不切换 |
| `Modal` | focus trap 已做 | **无 Escape 关闭** |
| `Dropdown`/`Popover`/`Tooltip` | 无 | 无 Escape、无 `aria-expanded`/`aria-haspopup` |
| `DatePicker` | 面板 fixed | 日历无键盘导航 |

**方案**（组件 .ts 层，逐项）：

- `Table`：排序 th 加 `onKeyDown`——Enter/Space 触发 `onSort`（防重复触发：keydown 与 click 用同一 handler，事件互斥）。
- `Card`：clickable 时加 `onKeyDown`（Enter/Space → onClick），并补 `aria-disabled` 语义。
- `Tabs`：roving tabindex——`tabIndex: 激活 ? 0 : -1` + 左右方向键移动焦点并切换（`onKeyDown` 在 tablist 上，防止焦点丢失）；补 `aria-controls`。
- `Modal`：`keydown` 监听 Escape → `onClose`（focus trap 的 handler 扩展，或独立监听；只在 open 时挂）。**注意**：`Confirm` 现有独立 Escape 监听（`Confirm.ts` 内 `escCleanup`）——Modal 加 Escape 后须让 Confirm 删除自己的监听，统一走 Modal（防双触发 `onCancel`）。
- `Dropdown`/`Popover`/`Tooltip`：触发钮补 `aria-expanded`/`aria-haspopup`；面板打开时 Escape 关闭 + 焦点归还触发钮（复用 focus-trap 归还逻辑）。
- `DatePicker`：日历格 `tabindex` 管理（当前月格可聚焦）+ 方向键移动 + Enter 选中 + Escape 关闭；触达尺寸顺带在 P4 处理。

**验证**：
- 组件测试：Table 排序 th 的 keydown Enter/Space 均触发排序；Tabs 方向键切换 active 且焦点不丢；Modal Escape 调 onClose；Dropdown Escape 关闭；DatePicker 方向键选中。
- `style-audit` 无需扩展（JS 逻辑）；浏览器走查键盘全程（Tab 顺序 + Enter/Space/Escape/方向键）。

---

## P2 — 语义色对比度达标 + 硬编码色值 token 化

**问题**：
1. `Badge`/`Tag`/`Toast` 全部 **500 级文字色 + 50 级底色**：`#22c55e` on `#f0fdf4` ≈ **2.2:1**，远低于 WCAG AA 4.5:1。状态色恰好是信息密度最高的区域。
2. 硬编码漏网（暗色下失控）：`Modal.css`/`Drawer.css` 的 `rgba(0,0,0,0.4)` 遮罩、`Button` primary 与 `.wf-bubble--own` 的 `#fff`——都未进 Token。

**方案**：

a) 语义层补 700 级文字色（引用原始层新增 `--wf-green-700` 等）：

```css
--wf-color-success-text: var(--wf-green-700);   /* #15803d 等 */
--wf-color-warning-text: var(--wf-amber-700);
--wf-color-error-text: var(--wf-red-700);
--wf-color-info-text: var(--wf-sky-700);
--wf-color-on-brand: #fff;                       /* 品牌色上的文字/图标 */
```

- `Badge`/`Tag`/`Toast`/`Alert` 文字色切到 `-text` 级（`--wf-*-bg` 底色不变）。
- 亮暗都验证：暗色段同样映射 `--wf-dark-*-700`（原始层新增）。

b) 遮罩/品牌上文字 token 化：
- `--wf-overlay: rgba(0, 0, 0, 0.4)`（暗色映射 `--wf-dark-overlay: rgba(0,0,0,0.6)` 或同值）。
- `Button` primary/danger、`bubble--own`、`DatePicker` 选中格改用 `var(--wf-color-on-brand)`。

**验证**：
- `style-audit` 新增：① 语义文字色 Token 存在且暗色段有映射；② 组件 CSS 中 `background: var(--wf-color-*-bg)` 与 `color: var(--wf-color-*)`（500 级）不得配对出现（扫 `--success-bg`/`--color-success` 组合）；③ 组件 CSS 不得出现 `rgba(` 裸值与 `color: #fff`（`on-brand` 白名单）。
- 静态对比度计算测试（`style-audit` 内硬编码 RGB 断言）：`--wf-color-*-text` 对 `--wf-*-50` 底 ≥ 4.5:1。
- 浏览器走查暗色：Badge/Toast 可读、遮罩不泛灰。

---

## P3 — 内联 SVG 图标体系

**问题（一致性最大债）**：全库混用三种图标语言——文本字形（Modal/Drawer `✕`、Toast `✓✕⚠ℹ`）、**emoji**（StatCard `🤖✨`、AiChat `🤔⚙️`、快捷卡片）、文本箭头（Table 排序 `▲▼⇅`）。emoji 跨平台渲染不一致，与字形混排时粗细/基线全不对齐。

**方案**：

a) 内置 SVG 图标集：`src/components/icons.ts`——24px stroke 风格、`currentColor` 着色、走 `--wf-color-*`：

```
方向：chevron-down/up/left/right、arrow-left、sort-asc/desc、sort
状态：check、close、alert、info、warning
操作：search、send、stop、retry、upload、trash、edit、plus
```

- 签名：`Icon({ name, size?, className? })` 或 `icons.close` 直接返回 VNode——按组件库风格用 `h('svg', …)` 手写 path，零外部依赖（FS-05 约束）。

b) 替换清单（组件 .ts 层，全库一处不漏）：

| 组件 | 现状 → 替换 |
|---|---|
| `Modal`/`Drawer` close | `✕` → `Icon close`（补 `:focus-visible` 样式） |
| `Toast` 类型图标 | `✓✕⚠ℹ` → `Icon check/close/alert/info`（容器加色块或图标着色，`--wf-toast-*` 语义） |
| `Table` 排序 | `▲▼⇅` → `Icon sort-asc/desc`（仅激活列显示，hover 显示中性 sort） |
| `StatCard`/快捷卡片 icon prop | 接受 VNode/Icon name（`icon="robot"`），emoji 兼容保留（文档说明优先 Icon） |
| `AiChat` 思考/工具状态 | `🤔⚙️` → `Icon`（`thinking`/`tool`），labels 文案不受影响 |
| `Tag` close | 现有文本 `×` → `Icon close` |
| `DatePicker` 翻月 | 文本 `‹›` → `Icon chevron`（如现状是文本则替换） |

c) CSS 侧：`.wf-icon { width/height: 1em; flex-shrink: 0 }` + `fill: none; stroke: currentColor; stroke-width: 1.8`，随字号缩放。

**验证**：
- 组件测试：Modal/Toast/Table 渲染出 `svg` 节点且带 `aria-hidden`。
- `style-audit` 新增：组件 .ts 不得出现裸字形字符 `✕✓⚠ℹ▲▼⇅`（白名单：文案性 emoji 如 AiChat 的占位文案）。
- 浏览器走查：四应用图标视觉一致（粗细/基线/暗色跟随）。

---

## P4 — 组件语义分化与交互安全

**问题**：
1. **Badge 与 Tag 视觉近重复**（同语义色系、radius 10px vs radius-sm）——心智模型模糊。
2. **Confirm 遮罩点击即取消**——危险确认可被误触（`Modal` 的 overlay `onClick: onClose` 直接复用）。
3. **Toast**：无退场（P0 修）、无 action 按钮（"撤销"场景缺失）、默认时长不一致（组件 `duration=0`，中间件 `3000`）。
4. **Card/StatCard hover 抬升是复制粘贴**（`translateY(-2px) + shadow-md` 两处）。
5. **DatePicker 触达 32px**（不在 44px 规则内）、today 态只靠字重、range hover 无预览。

**方案**：

- **Badge vs Tag 分化**（文档 + 样式微调）：Badge = 状态/计数，不可交互（胶囊 10px、加 dot 变体）；Tag = 可关闭标签（radius-sm 不变）。`docs/style-guide.md` 场景速查表写明二分。
- **Confirm**：新增 `maskClosable?: boolean` prop，**默认 `false`**（danger 变体强制，遮罩点击不再取消）；Escape 保持现有行为（已实现，改为统一走 Modal 的 Escape，见 P1 注意项）。
- **Toast**：`action?: { label, onClick }`（action 按钮点击不自动关闭，回调后手动 remove）；默认时长统一（组件默认与中间件一致，`duration=3000` 或明确文档）；退场 P0 已含。
- **elevate 去重**：`_surface.css` 提炼 `.wf-elevate`（hover 抬升 = 动效 Token + shadow-md），`Card hover`/`StatCard clickable` 共用。
- **DatePicker**：日历格 min 尺寸 36px（桌面）→ 44px（`@media (pointer: coarse)` 走 base 规则或组件内规则）；today 加边框高亮（`--wf-color-border-dark`）；range hover 预览格（`--in-range-preview` 背景）；键盘导航 P1 已含。

**验证**：
- 组件测试：Confirm 遮罩点击不触发 onCancel（maskClosable=false 默认）；Toast action 点击回调且不自动关闭。
- `style-audit`：Card/StatCard CSS 不再各自定义 `translateY(-2px)`（提炼后查重复）；Badge/Tag radius 差异化存在。
- 走查：删除类 Confirm 点遮罩无效；移动端 DatePicker 触达达标。

---

## P5 — 排版精细化

**问题**：
1. 字号 12/13/14/15/16/21/24/30/36——13/15 碎片值，21 后跳 24；缺 display 级（`PageHeader` 顶级标题仅 21px）。
2. `StatCard` 数值 3xl + `line-height: 1`——数字变长时**宽度抖动**（无 `tabular-nums`）。
3. CJK 重心偏移：`_base.css` th 与 `_app-shell.css` nav-group 硬编码 `text-transform: uppercase`——中文 no-op，0.5px 字距对中文反而该收。

**方案**（全部向后兼容，旧 token 保留别名）：

- 新增 display 级 token：`--wf-font-size-display: 30px`（`wf-text-display` 工具类）——`PageHeader` 可选 `display` prop 切 30px + `--wf-letter-spacing` 收窄。
- `.wf-nums` 工具类：`font-variant-numeric: tabular-nums`——`StatCard` 数值默认套用。
- CJK token 化：`--wf-heading-case: none`（默认），th/nav-group 改 `text-transform: var(--wf-heading-case)`；中文场景字距改 `--wf-heading-tracking: 0`（默认 0，英文用户可覆盖 0.5px）。
- 行高配对：为 2xl+ 补 `--wf-line-height-heading`，h1-h6 已引用 tight，保持。
- 类型阶梯表写进 `docs/style-guide.md`（含 display 级），README 计数同步。

**验证**：
- `style-audit`：新增 `wf-nums`/`wf-text-display` 存在；th/nav-group 无裸 `uppercase`（必须 `var(--wf-heading-case)`）。
- 走查：StatCard 数字递增不抖；中文页面表头/分组标题层级正常；PageHeader display 级生效。

---

## P6 — 过渡态集成

**问题**：`Skeleton`/`Loading`/`EmptyState` 是孤立组件——`Table` 无 `loading` prop（加载中无法保留表头）、`StatCard` 无数字动画、`Button.loading` 只换文案（加载态下按钮宽度跳动）。

**方案**：

- `Table` 加 `loading?: boolean` + `loadingRows?: number`——loading 时保留 thead，tbody 渲染骨架行（`Skeleton` 或 `.wf-skeleton` 类复用）。
- `StatCard` 加 `animate?: boolean`（数字从 0 递增到 value，`requestAnimationFrame` 驱动，`prefers-reduced-motion` 下直接终值）——依赖 P0 的动效纪律。
- `Button.loading` 改为 spinner 图标 + 文案（`Icon loading` 旋转动画，类 `.wf-btn-spinner`），并用 `min-width` 约束防跳动（`--wf-btn-min-width` 钩子或 `inline-flex` 换行保护）。
- `EmptyState` 与数据组件对接文档化（"Table emptyText 已覆盖空态，页面级空态用 EmptyState"）。

**验证**：
- 组件测试：Table loading 渲染骨架行且表头保留；StatCard animate 终值为目标值（mock rAF）；Button loading 含 spinner 节点。
- `style-audit`：`.wf-btn-spinner` 存在且引用 `--wf-*`。
- 走查：列表加载有骨架而非空白；按钮 loading 不跳宽。

---

## 诚实裁剪（不做）

- **完整 icon 库**（数百图标）：只做基础集（~15 个），业务图标应用层自备（组件 icon prop 接受任意 VNode）
- **Spring/物理动效**：保持零依赖，`ease-snap` 弹跳即上限
- **拖拽手势动效**（toast 滑动消除、drawer 边缘拖拽）：实现成本高，无需求
- **页面级路由过渡**：属应用层职责（AppLayout），组件库不提供
- **复杂 widget ARIA 模式**：DatePicker 只做方向键 + Enter + Escape，不做完整 combobox grid 模式
- **Skeleton 多态变体**（circle/text/paragraph）：保持单类 + `--wf-skeleton-radius` 钩子
- **容器查询断点**：`@container` 布局维持现状

## 执行顺序与依赖

```
P0 动效（地基，exit 机制被 P4/P6 依赖）
 → P1 键盘（独立，量大先行）
 → P2 对比度 + token 化（独立，小步快发）
 → P3 图标（P4 依赖）
 → P4 语义分化（P0/P3 依赖）
 → P5 排版（独立）
 → P6 过渡态（P0/P3 依赖）
```

- P0/P2/P5 可独立发布；P3 完成后 P4 依赖解除；P1 全程独立。
- 每阶段：`npm test`（含 style-audit 扩展）+ `npm run build` + agent-browser 走查对应组件。
- 文档同步：README 组件数/Token 数、`docs/style-guide.md`（Badge/Tag 二分、动效 Token、图标用法）。

## 验收记录

### P0 — 动效 Token + exit 动画机制 ✅

- **新增 9 个动效 Token**（128 → 137）：`--wf-dur-fast/base/slow`（120/200/300ms）+ `--wf-ease-out/in/snap` 三曲线 + `--wf-motion-sm/md/lg`（4/8/24px）
- **`src/client/motion.ts` 新增 `animateOut(el, done, fallbackMs)`**：挂退场类 → animationend → 回调；兜底 timeout 防 animationend 丢失挂死；reduced-motion 下动画被降为 0.01ms 等效瞬时
- **Modal/Drawer 退场状态机**（`phase: closed|open|exit`）：open=false 先渲染 `--exit` 帧（不再立即消失），挂载期一次性监听 animationend（enter 结束忽略），exit 结束 `ctx.ui.render()` 卸载——`--exit` 死代码复活
- **Confirm 命令式退场**：`finish()` 挂 `wf-modal--exit` + animateOut 后清理，不再"啪"地消失；resolve 仍立即返回，DOM 异步清理
- **Toast 退场**：`wf-toast-out`（向右淡出 200ms ease-in）+ `data-id` 定位；加类后查 `getComputedStyle().animationName` 自适应——真浏览器播动画，jsdom/禁用环境立即移除（测试零改动）
- **微交互基线**：Button `:active` 按压反馈（scale 0.98）、Tabs 激活指示滑动过渡、SegmentedControl 选中态 ease-snap
- **style-audit +2 条规则**（14 条）：动效 Token 存在性、`--enter`/`--exit` 类必须成对（防退场死代码回归）
- **测试**：Modal 退场 DOM 测试（patch 管线：open=false → `--exit` 帧仍挂 DOM → animationend → 卸载）；Confirm 命令式测试统一手动触发 animationend（jsdom 无 CSS 动画）；修复 `dispatchEvent` 需 jsdom Event（`window.Event`）的坑
- 全量 841 前端测试通过（+3），typecheck + build 通过，README 计数同步（128 → 137）
- 诚实边界：Toast 退场方向未按位置变体细分（统一向右）；Dropdown/Popover/Select 面板仍瞬关（瞬时面板属设计决策，非浮层类）；`--wf-transition` 旧 token 保持 150ms ease 不随新语言变化（避免全组件动效突变）

### P2 — 语义色对比度 + 硬编码 token 化 ✅

- **新增 13 个 Token**（115 → 128）：原始层 `--wf-brand-700`/`--wf-green-700`/`--wf-amber-700`/`--wf-red-700`/`--wf-sky-700` + `--wf-dark-overlay`；语义层 `--wf-color-{primary,success,warning,error,info}-text` + `--wf-color-on-brand` + `--wf-overlay`；暗色两段映射 `-text` → 暗色 500 级（暗色下 500 即浅色文字）、`--wf-overlay` → `--wf-dark-overlay`（0.4 → 0.6）
- **对比度实测**（WCAG AA ≥ 4.5:1）：亮色 700 级 on 50 级底全部达标（brand 7.0 / green 4.8 / amber 4.8 / red 5.9 / sky 5.3）；暗色 500 级 on 50 级底全部达标（4.7–9.0）
- **25 个组件/布局文件转换**：Badge/Tag/Toast/Alert/AiChat/StatCard/ApprovalCard/ToolCallCard/Field/Input/Select/Textarea/FileUpload/Dropdown 的语义文字切 `-text`；Button primary/danger、气泡、DatePicker 选中格、Checkbox/Pagination/Steps/Avatar 的 `#fff` 切 `--wf-color-on-brand`；Modal/Drawer 遮罩切 `--wf-overlay`；全库 `color: var(--wf-color-primary)` 文字用途（链接/ghost/导航激活/排序表头/Tabs/SegmentedControl/`wf-text-primary` 等）切 `--wf-color-primary-text`；Editor 顺带修掉不存在的 `--wf-color-primary-light` 兜底 → `--wf-color-primary-bg`
- **style-audit +4 条规则**（12 条）：① 对比度计算测试（亮暗双验证，防色值改动回归）② 组件文字禁 500 级语义色 ③ 遮罩禁硬编码 rgba ④ 文字禁裸 #fff
- 全量 983 测试通过（829 前端 + 154 DB），build 通过，README 计数同步（115 → 128）
- 诚实边界：暗色下品牌实心按钮（`on-brand` #fff on `--wf-dark-brand-500` #6b8aff ≈ 3.1:1）维持现状——属暗色品牌调性决策，非本阶段范围，已登记

### P3 — 内联 SVG 图标体系 ✅

- **`src/components/Icon/`（Icon.ts + Icon.css + Icon.test.ts）**：25 个 stroke 图标（feather 风格 24px、`currentColor`、`1em` 随字号缩放、`aria-hidden`），零外部依赖（FS-05）；`icons` 从 `weifuwu/components` 导出
- **全库字形替换**（13 个组件）：Modal/Drawer/Tag/Alert 关闭 → `close`；Alert/Toast 类型 → `check/close/alert/info`；Table 排序 → `sort/sort-asc/sort-desc`（`wf-table-sort-icon` 激活高亮，不再用文本箭头挤压文字）；DatePicker 翻月 → `chevron-left/right`（补 `aria-label`）；Pagination → `chevron-left/right`（补 `aria-label`）；Steps 完成 → `check`；ApprovalCard → `pause/check/close`；ToolCallCard → `settings/check/close`；FileUpload 删除 → `trash`；SearchInput → `search/close`（🔍 emoji 一并替换）
- **style-audit +1 条规则**（16 条）：组件 .ts 禁止裸文本字形（`✕✓⚠ℹ⇅▲▼‹›⏸`），emoji 属文案性 labels 白名单（AiChat 占位文案保留）
- 修复两个测试断言（Pagination/Steps 改断言 Icon 组件）；Pagination `PL` 声明 TDZ 修复
- 全量 847 前端测试通过，typecheck + build 通过
- 诚实边界：Checkbox 对勾保留 CSS `::after` 字形（伪元素内小标记，非组件代码）；AiChat 思考/工具 emoji 属可定制 labels 文案不替换；图标集只做基础 25 个，业务图标应用层自备

### P5 — 排版精细化 ✅

- **新增 4 个 Token**（137 → 141）：`--wf-font-size-display`（30px）、`--wf-heading-case`（默认 none）、`--wf-heading-tracking`（默认 0）、`--wf-nums`（tabular-nums）
- **CJK 感知**：th/nav-group 的裸 `uppercase`/`0.5px` 字距改为 `var(--wf-heading-case)`/`var(--wf-heading-tracking)`——中文页面表头层级正常，英文可覆盖回 uppercase
- **数字防抖**：`.wf-nums` 工具类 + `StatCard` 数值默认 `font-variant-numeric: tabular-nums`
- **display 级标题**：`.wf-text-display` 工具类 + `PageHeader` `display` prop（30px + 负字距）
- **style-audit +1 条规则**（15 条）：th/nav-group 必须引用 heading-case token（防裸 uppercase 回归）+ wf-nums/wf-text-display 存在性
- 全量测试通过，README 计数同步（137 → 141）

### P4 — 组件语义分化与交互安全 ✅

- **Confirm 危险操作防误触**：Modal 新增 `maskClosable`（默认 true）；Confirm 默认 `false`（`ConfirmOptions` 可显式开启）——遮罩点击不再取消删除类确认；Escape 仍可关闭（走 Modal，P1 已去重）；命令式路径透传
- **Toast action 按钮**：`ToastItem.action`（如"撤销"）+ `ctx.toast(msg, type, duration, action)` 第四参；点击回调不自动关闭；`wf-toast-action` 语义色 + focus 环
- **elevate 去重**：`_surface.css` 提炼 `.wf-elevate`（hover 抬升 + 焦点环，引用动效 Token），Card（clickable/hover）与 StatCard（clickable）共用；Card/StatCard CSS 的复制粘贴 hover 块删除
- **StatCard 顺带补齐**：趋势箭头换 Icon（`arrow-up/down`）+ Enter/Space 键盘（P1 漏网）+ 数值套 `wf-nums`
- **DatePicker 触达**：`@media (pointer: coarse)` 44px 命中区（`min-width: 44px` 防横向溢出）；today 加 inset 边框高亮（不撑开布局）
- **测试**：Confirm 遮罩默认不取消/显式开启两条、Toast action、StatCard 键盘/elevate
- **修复测试挂起（重要）**：旧命令式测试"遮罩点击 resolve(false)"残留（期望遮罩点击取消，maskClosable=false 后永不 resolve → `await promise` 挂死进程）——删除重复测试；用 `--test-timeout=3000` 定位到具体挂起测试
- 全量 849 前端测试通过，typecheck + build 通过
- 诚实边界：range hover 预览格未实现（需组件内区间状态逻辑，文档注明）；Badge/Tag 二分以文档为主（docs/style-guide.md 场景速查），样式已各自稳定

### P6 — 过渡态集成 ✅

- **Table `loading`**：保留 thead，tbody 渲染 `wf-skeleton` 骨架行（`loadingRows` 默认 3）——加载中不再空白或整页换骨架
- **StatCard `animate`**：数字 rAF 400ms ease-out 递增；`prefers-reduced-motion` 下直落终值；非数值原样渲染；卸载后 rAF 自终止（≤400ms）
- **Button loading**：spinner（`currentColor` 随文字色，primary 白字自动白色）+ 文案，替代纯文字
- **+4 测试**（Table 骨架、StatCard 动画/reduced-motion/字符串/键盘、Button spinner）
- 全量 853 前端 + 154 DB = 1007 测试通过，typecheck + build 通过
- 诚实边界：Button loading 未做 `min-width` 预占（文案宽度仍会轻微跳动，避免硬编码宽度）；StatCard 卸载中动画由 rAF 自终止兜底

### P1 — 键盘可达性补齐 ✅

- **消灭全部"可聚焦不可操作"**：Table 可排序 th 与 Card clickable 补 Enter/Space（`preventDefault` 防 Space 滚页）；Tabs 补 roving tabindex + 左右/Home/End 方向键环形切换并焦点跟随；Modal 根节点补 Escape → onClose（焦点被 trap 在框内，事件冒泡可达）；Dropdown 菜单内 Escape → `onOpenChange(false)` + 包装层 `aria-haspopup`/`aria-expanded`；Popover/Tooltip 包装层 Escape 关闭/隐藏；DatePicker 日历方向键导航 + 原 Escape 保留
- **Confirm 重构**：移除自有 document 级 Escape 监听（防与 Modal 双触发），统一走 Modal；`maskClosable` 预留待 P4
- **+9 测试**（87 项 P1 批次全绿）：VNode 级断言 handler 存在与行为（Table/Card/Modal/Dropdown/Popover/Tooltip）+ DOM 事件级（Tabs 方向键焦点跟随、DatePicker 方向键 + Escape，均用 patchValue 管线模拟真实 `ctx.ui.render`）
- **修复测试基建两个坑**：jsdom 未连接文档的元素 `.focus()` 无效（container 须 appendChild 到 body）；`patchValue` 签名是 `(parent, oldNode, oldInput, newInput, ctx)`
- **修复命令式 confirm 测试挂起**：原 ESC 测试用 `document.dispatchEvent`（依赖已删除的 document 级监听）→ `await promise` 永不 resolve 导致进程不退出——改为从对话框内按钮冒泡触发
- 全量 838 前端测试通过，typecheck + build 通过
- 诚实边界：Dropdown/Popover/Tooltip 的 trigger 为不透明 VNode，ARIA 挂在包装层而非触发元素本身（文档注明，应用层可在 trigger 上加 `aria-haspopup` 补齐语义）；焦点归还触发钮仅 Modal 系实现（trapFocus），Dropdown/Popover 未做（trigger 不可寻址）——已登记

---

## P9 后续优化方向执行记录

### 方向 A — 文档债（✅）

- `docs/style-guide.md`：动效 Token 表（dur/ease/motion）、Icon 用法、Badge/Tag 二分（状态徽章 vs 可关闭标签）、浮层退场=延迟卸载语义、CJK/数字 Token、组件数 44→48、场景速查 +5 行
- `README.md` 语义层清单补 26 个新 Token（-text 文字色、on-brand、overlay、动效、heading-case、nums、display）
- `docs/style-system.md` 计数同步（115→141）

### 方向 B — dogfooding + 浏览器走查（✅，暴露 3 个框架级 bug）

agent-platform 接入 P8 特性（confirm/toast 中间件 5 处删除流、StatCard animate）+ agent-browser 走查暴露并修复：

1. **客户端模块状态重复（最严重）**：`dist/components` 内联一份 client 源码（`external` 只挡 JSX 运行时包名导入）→ 命令式中间件挂载的组件注册在 components 的 `idRegistry`，但 `$` 的 dirty 走 app 的 `renderByIds`（查 app 的 registry）→ toast 永不渲染且单测全绿（node --test 单模块图掩盖）。修复双防线：① build.mjs 组件构建外部化 `src/client/*` → `weifuwu/client`（dist 消费端共享）；② apps tsconfig `paths` 补 `weifuwu/components` → src（dev 全 src 单图）。补 client 导出 `mountVNode/callRefCleanup/patchValue/animateOut`
2. **trapFocus 初始聚焦失效**：weifuwu ref 在元素 appendChild 前触发（未连接文档 `focus()` 无效，浏览器实测 `firstIsConn=false`）→ `queueMicrotask` 延迟聚焦
3. **AppLayout 缺 Loading import**（agent-platform 既有）

浏览器验证：Confirm 遮罩不关/退场帧/焦点进出、Toast 显示+自动消失、删除流全链路。AGENTS.md 记录"客户端模块状态共享双防线"与"ref 触发时机"两课。

### 方向 C — 面板级微动画统一（✅）

- **layout 统一面板入场**：`.wf-panel-in`（scale 0.97 + translateY(-4px) + fade，`--wf-dur-fast` + `--wf-ease-out`，origin top center）——面板族（dropdown/select/datepicker 从触发点下方弹出）统一引用
- **Select/DatePicker 面板补入场**（原瞬开）：`.wf-select-search-menu`、`.wf-datepicker-dropdown`/`.wf-datepicker-range-wrap`/`.wf-time-picker`
- **浮层族保持 fade**（popover/tooltip 位置多变，scale origin 复杂——诚实裁剪）
- **全部动画 Token 化**：Dropdown 移除自建 keyframes、Modal/Drawer/Toast 的 `0.2s ease-out` 硬编码 → `var(--wf-dur-*)` + `var(--wf-ease-*)`
- **style-audit +1 条规则**（17 条）：一次性动画必须引用动效 Token（循环动画 spinner/shimmer 豁免——转速是独立参数）
- 全量 854 前端测试通过，typecheck + build 通过，浏览器验证 Modal 入场/焦点/toast
