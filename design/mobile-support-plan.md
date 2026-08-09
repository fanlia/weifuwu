# 移动端友好支持计划 — weifuwu/client + weifuwu/layout → components 自适应提升

> 目标：让框架提供移动端基础能力，组件获得"由构造保证"的自适应体验，
> 而非每个组件各自手写（现状：16 个组件重复 Escape、9 个重复定位、9 个重复 hover 触发）。

## 一、现状盘点（已审计）

### 已有能力（复用，不重复造）
| 能力 | 位置 |
|------|------|
| `useMedia` / `useBreakpoint`（matchMedia 断点） | `src/client/ui.ts` |
| `usePopupPosition` + `clampToViewport`（弹层**位置**视口夹紧） | `src/client/popup.ts` |
| 布局原语响应式变体（`wf-stack@sm`、`wf-hidden@sm`…640/768/1024） | `src/layout/` |
| `@media (pointer: coarse)` 44px 命中区（基础清单） | `src/layout/_base.css` |
| `prefers-reduced-motion` / 暗色模式 | `src/layout/_base.css` / `_dark.css` |

### 缺口（本计划补齐）
1. **hover/tap 自动降级原语缺失** — Tooltip/HoverCard/Popover(hover)/Menubar 手写 mouseenter/leave，触屏 tap 打不开
2. **弹层宽度 clamp 无统一方案** — `clampToViewport` 只夹位置不夹宽度；Modal `min-width:400px`、DatePicker/Cascader 各写各的
3. **44px 命中区覆盖不全** — base 清单漏 Carousel 箭头/圆点、Pagination 页码、Rate 星、Transfer 钮、Tree 勾选、Editor 工具钮、ColorPicker 色块、Tag 关闭、Mentions 选项、Slider 手柄
4. **长按手势无原语** — ContextMenu 移动端无触发
5. **safe-area 无工具** — 底部抽屉/AiChat 被 iPhone Home 条、键盘遮挡
6. **移动端开发指南缺失** — 约定散落，新组件"忘了做"无法防

## 二、分层设计

### A. weifuwu/client — JS 侧原语（核心）

#### A1. `usePopup` 组合器（P0，最高杠杆）
收敛 15 个弹层组件重复的同一套生命周期。与 `usePopupPosition`/`useChat` 同族。

```ts
interface UsePopupOptions {
  trigger: 'hover' | 'click' | 'longpress'
  placement?: Placement
  gap?: number
  el: () => HTMLElement | null           // 锚定元素（与 usePopupPosition 同款 getter）
  isOpen: () => boolean
  setOpen: (open: boolean) => void
  open?: boolean                         // 受控（可选）
  onOpenChange?: (open: boolean) => void // 受控回调（可选）
  width?: number | string                // 面板宽度 → 自动 clamp 视口
  closeOnOutside?: boolean               // 默认 true
  closeOnEscape?: boolean                // 默认 true
  enterClass?: string                    // 打开动画类
  exitClass?: string                     // 关闭动画类（配对，audit 强制）
  disabled?: () => boolean
}

interface UsePopup {
  wrapProps: Record<string, any>  // mouseenter/leave + focus/blur + tap + Escape + 外部点击，全在这
  portal: (content: VNode) => VNode | null  // createPortal + 坐标 + clampToViewport + 宽度 clamp + enter/exit
  open: boolean
  setOpen: (open: boolean) => void
}
```

**内置移动端行为（构造保证）**：
- `trigger='hover'`：内部 `matchMedia('(hover: hover)')` 检测——桌面 mouseenter/leave；触屏降级 **tap 切换** + 点外部关闭
- `trigger='longpress'`：`pointerdown` + 计时（默认 500ms）+ 移动取消 + `contextmenu` 兼容（ContextMenu 用）
- 宽度 clamp：`width` 自动 ≤ `100vw - 32px`
- Escape / 外部点击 / focus 进出 统一处理
- enter/exit 动画类配对（复用 `src/client/motion.ts`）

**边界（诚实裁剪 CS-05）**：Modal/Drawer/Command 是全屏对话框（focus-trap + scroll-lock + 退场状态机），**不进 usePopup**——生命周期不同，硬塞会让组合器变重。

#### A2. `useHoverCapable()`（P0，usePopup 内部依赖，单独导出）
`matchMedia('(hover: hover)')` 封装，组件可单独用：`const canHover = ctx.ui.useHoverCapable()`。

#### A3. `useLongPress(cb, { duration = 500 })`（P1）
```ts
const longPressProps = ctx.ui.useLongPress(() => openMenu(), { duration: 500 })
// 返回 spread 到触发器：pointerdown 计时 / pointerup/leave 取消 / touchmove 取消 / contextmenu 兼容
```

#### A4. `useVisualViewport()`（P2，可选）
`visualViewport` 监听键盘弹起/缩放，返回 `{ height, offsetTop }` 响应式——AiChat 输入区抬升、底部抽屉安全区。

### B. weifuwu/layout — CSS 侧底座

#### B1. `_popup.css` 新增 — `.wf-popup` 浮层基类（P0）
```css
.wf-popup {
  position: fixed;
  z-index: var(--wf-z-popover);
  /* 宽度 clamp：变量优先，视口兜底（解决 Modal/DatePicker/Cascader 溢出） */
  width: var(--wf-popup-width, auto);
  max-width: min(var(--wf-popup-max, 480px), calc(100vw - 32px));
  min-width: min(var(--wf-popup-min, auto), calc(100vw - 32px));
}
```
新文件注册：`weifuwu-layout.css` 加 `@import './_popup.css'` + `build.mjs` `LAYER_OF` 加 `_popup: 'layout'`。

#### B2. `_safe-area.css` 新增（P1）
```css
.wf-safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
.wf-safe-top    { padding-top: env(safe-area-inset-top); }
```

#### B3. `_base.css` coarse 44px 清单扩展（P1）
补：`.wf-carousel-btn/.wf-carousel-dot`、`.wf-pagination-item`、`.wf-rate-star`、`.wf-transfer-btn`、`.wf-tree-checkbox`、`.wf-editor-toolbar button`、`.wf-colorpicker-swatch`、`.wf-tag-close`(已列)、`.wf-mentions-item`、`.wf-slider-handle`

#### B4. 断点约定（沿用，文档化）
640/768/1024（sm/md/lg），移动优先——与现有 `wf-stack@sm` 体系一致，不新增断点。

### C. weifuwu/components — 迁移 + 自适应提升

#### C1. 锚定弹层迁移 usePopup（P0，9 个）
| 组件 | trigger | 迁移后行为 |
|------|---------|-----------|
| Tooltip | hover | 触屏 tap 显示（解决 audit P1） |
| HoverCard | hover | 触屏 tap 显示（openDelay 保留） |
| Popover | click/hover | hover 模式触屏自动降级 tap |
| Dropdown | click | 样板收敛，行为不变 |
| Menubar | click | hover 高亮保留，展开统一 |
| Cascader | click | 面板宽度 clamp |
| Mentions | click | 列表宽度 clamp |
| DatePicker 面板 | click | 面板宽度 clamp + range 窄屏单列 |
| Select 面板 | click | 面板宽度 clamp |

#### C2. ContextMenu 接入 longpress（P1）
`onContextMenu`（桌面）+ `useLongPress`（触屏）双通道。

#### C3. 宽度/形态修复（P1-P2）
- Modal：`min-width: min(var(--wf-modal-width, 400px), calc(100vw - 32px))`（修 375px 溢出）
- Drawer：`@media (max-width: 639px)` 全宽 + `.wf-safe-bottom`
- Transfer：`@media (max-width: 767px)` 纵向堆叠
- Pagination：窄屏页码折叠（`…` + 首/尾/当前）
- Tabs / SegmentedControl / ToggleGroup / Editor 工具栏：`overflow-x: auto` + 隐藏滚动条
- Cascader 多列：窄屏横向滚动（`overflow-x: auto`）
- AiChat：`useVisualViewport` 键盘抬升（P2）

### D. 防回归护栏（P1）

#### D1. style-audit +2 规则（`src/test/style-audit.test.ts`）
1. **交互命中区规则**：组件 CSS 中所有 onClick/role=button 对应 class 必须出现在 coarse 44px 清单（解析组件 .ts 交互选择器 → 断言 base/layout 覆盖）
2. **浮层宽度 clamp 规则**：含 `position: fixed` 的组件 CSS 必须有 `calc(100vw` 或 `min(` 宽度约束

#### D2. 现有回归网
组件测试 ~466 个 + 框架 1459 个 + app 80 个，迁移后全绿。

### E. 文档

#### E1. `docs/mobile.md` — 移动端开发指南（P3）
- 断点表（sm/md/lg + useBreakpoint）
- 命中区纪律（44px 清单如何维护）
- hover 门控（useHoverCapable / usePopup trigger）
- 弹层宽度 clamp 约定
- safe-area 用法
- 手势原语（useLongPress / Carousel 触摸）
- 验证清单（375px 无横向溢出、tap 可达、键盘弹起）

## 三、实施顺序（依赖排序）

| 阶段 | 内容 | 依赖 |
|------|------|------|
| **P0** | A1 `usePopup` TDD → B1 `_popup.css` → C1 迁移 9 个弹层 | 无 |
| **P1** | A3 `useLongPress` + C2 ContextMenu → B3 44px 补全 → C3 宽度修复 → D1 audit 规则 | P0 |
| **P2** | B2 safe-area + C3 响应式形态（Drawer/Transfer/Pagination/Tabs/Editor）→ A4 useVisualViewport + AiChat | P1 |
| **P3** | E1 `docs/mobile.md` + demo 移动端完善 + 全量验证 | P2 |

## 四、验证矩阵

| 层 | 方式 | 通过标准 |
|----|------|---------|
| client | `usePopup` 单测（jsdom + setupJsdom，matchMedia mock） | hover 环境 vs 触屏环境双断言；Escape/外部点击/clamp/长按 各用例绿 |
| layout | style-audit | 16+2 规则全绿；`dist` 重建后 demo 加载无错 |
| components | 组件测试全绿 | ~466 全绿；迁移组件行为不变（既有断言回归） |
| 真实设备 | agent-browser 375×667 视口 | ① `scrollWidth <= innerWidth` ② 9 个弹层 tap 可达 ③ ContextMenu 长按 ④ Tooltip/HoverCard tap 显示 ⑤ 桌面视口行为不变 |
| 全量 | `npm test` + app 测试 | 框架 1459 + app 80 全绿 |

## 五、CS-05 测试先行（红→绿清单）

`usePopup` 首个测试用例（`src/components/__tests__` 或 `src/client/` 侧）：
1. `trigger='hover'` 且 matchMedia `(hover: hover)` false → tap（pointerdown/click）打开，mouseenter 不打开
2. `trigger='hover'` 且 hover true → mouseenter 打开，tap 不重复触发
3. `trigger='longpress'` → pointerdown 500ms 后触发；提前松开取消；move 取消
4. Escape → closeOnEscape 关闭
5. 外部点击 → closeOnOutside 关闭
6. `width` clamp：375px 视口下 `min(320px, 100vw-32px)` 生效
7. 受控 `open` + `onOpenChange`：组件内不直接改状态
8. 动画类配对：enterClass 存在则 exitClass 必传（或 audit 兜底）

## 六、风险与裁剪声明

- **usePopup 不过度设计**：不内置 focus-trap / scroll-lock / 流式定位 flip——超出锚定弹层范畴，留 Modal/Drawer 各自
- **行为变化**：Tooltip/HoverCard 触屏从"不可用"变"tap 可用"——新能力，非破坏性
- **迁移顺序**：一个组件一个 PR 粒度迁移，每步全量测试，避免大爆炸
- **兼容**：usePopup 纯新增 API，旧组件不迁移也 work（不强制）

## 七、成果指标

- 弹层组件样板代码删除 ~500 行（15 个组件 × ~30-40 行重复生命周期）
- 移动端问题归零：P0 溢出、P1 不可达、P1 命中区 全部由框架层解决
- 新组件移动端友好 = 用 usePopup + 遵循 audit 规则，无额外心智负担

---

## 实施进度（2025-08 首轮 P0/P1 完成）

| 项 | 状态 | 说明 |
|----|------|------|
| A1 `usePopup` | ✅ TDD 红→绿 7/7 | hover/tap 降级、longpress、Escape（document 级，portal 内也可关）、外部点击、宽度/视口 clamp、受控 getter、disabled/delay/placement 支持 getter |
| A2 `useHoverCapable` | ✅ | matchMedia '(hover: hover)' |
| A3 `useLongPress` | ✅ | 500ms + 位移取消 + 事件透传（坐标）+ contextmenu 兼容 |
| B1 `_popup.css` | ✅ | `.wf-popup` 浮层基类（宽度 clamp）+ LAYER_OF 注册 |
| B2 `_safe-area.css` | ✅ | `.wf-safe-bottom/top` |
| C1 弹层迁移 | ✅ 8 个 | Tooltip/HoverCard/Popover/Dropdown/Menubar/Mentions/Cascader + ContextMenu(longpress)。Select（内联 absolute 自适应，无需迁移）、DatePicker（CSS clamp：range 窄屏堆叠 + 面板 max-width） |
| B3 coarse 44px | ✅ 部分 | Pagination/Carousel 箭头/Transfer/Editor 工具栏/Calendar 导航/Select 选项 + Carousel 圆点 ::after 命中扩展；Rate 星/Tree 勾选/Slider 手柄为已知例外（行级命中区） |
| D1 audit 规则 | ✅ +2 | 触屏命中区覆盖 + 浮层宽度 clamp 兜底（18 规则全绿） |
| 测试基建 | ✅ | `npm test` 加 `--test-concurrency=8`（16 核全并发 GC 抖动 >60s → 8 并发稳定 ~11.5s）；postgres idle reaper 测试改轮询（真库并发下固定 sleep 不可靠） |
| A4 `useVisualViewport` + AiChat 键盘抬升 | ✅ TDD 2/2 | `raiseOnKeyboard` prop（全屏 chat 布局 opt-in）；375px 实测 Modal/Transfer/Tooltip 全部通过 |
| E1 `docs/mobile.md` | ✅ | 移动端开发指南（断点/命中区/usePopup/手势/safe-area/验收清单） |
