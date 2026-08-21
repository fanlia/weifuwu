# 移动端开发指南

> 从 docs/mobile.md 迁移（content/ 文档库——随 npm 包发布，与框架版本同步）。
> 本页为叙述性指南——组件/能力逐项参考见 content/ 各域目录。

# 移动端开发指南（weifuwu）

> 移动端友好由框架构造保证：**用对原语 + 守 audit 规则**，不靠每个组件"记得"。
> 落地依据：移动端支持计划（P0-P3 全落地——openPopup 全系 + safe-area + 44px 命中区 + docs/mobile 指南）。

## 一、断点体系（布局原语）

移动优先，640/768/1024 三个断点（与 `useBreakpoint` 的 mobile/tablet/desktop 对齐）：

| 断点 | 类前缀 | 语义 |
|------|--------|------|
| ≥640px | `@sm` | 小屏以上 |
| ≥768px | `@md` | 平板以上 |
| ≥1024px | `@lg` | 桌面 |

```html
<div class="wf-stack wf-stack@md">…</div>   <!-- 移动纵向堆叠，md 起横向 -->
<div class="wf-hidden@sm">…</div>           <!-- 移动端隐藏 -->
```

- 组件级移动适配用 `@media (max-width: 639px)`（bottom-sheet/全宽抽屉）或 `(max-width: 767px)`（双栏堆叠）
- 触屏判定用 `@media (pointer: coarse)`（44px 命中区），**不要**用 width 猜触屏

## 二、命中区纪律（44px，Apple HIG / WCAG 2.5.8）

- **button/input/select 由全局 coarse 规则自动覆盖**（`_base.css`）
- **非 button 交互元素**（div/label/span 带 onClick）必须进 coarse 44px 清单——style-audit 规则强制，新组件漏了测试红
- **小组件**（圆点/星/勾选框）视觉尺寸不变，用 `::after` 扩展命中区（参考 Carousel dot）：

```css
@media (pointer: coarse) {
  .wf-carousel-dot {
    position: relative;
  }
  .wf-carousel-dot::after {
    content: '';
    position: absolute;
    inset: -14px;
  }
}
```

- 小按钮（显式 `min-height` 覆盖了全局）需在组件 CSS 补 coarse 44px（参考 Pagination/Transfer/Calendar nav）

## 三、弹层（openPopup 命令式弹窗）

**弹层组件必须用 `ctx.ui.openPopup`**——移动端友好由构造保证：

```tsx
let handle: PopupHandle | null = null
if (open && !handle)
  handle = ctx.ui.openPopup({
    anchor: () => anchorEl,   // **anchor 必传**（触发区是锚点——否则被当外部点击关闭）
    content: () => h('div', { class: 'wf-popover' }, props.content),
    onClose: () => { handle = null; open = false; ctx.ui.render() },
  })
else if (!open && handle) { handle.close(); handle = null }
else if (handle) handle.update(h('div', { class: 'wf-popover' }, props.content))
```

## 四、手势原语

| 原语 | 用法 | 场景 |
|------|------|------|
| `ctx.ui.useLongPress({ onLongPress, duration })` | spread 到目标 | ContextMenu 触屏长按（已内置双通道） |
| `ctx.ui.useVisualViewport()` | 返回 `{ height, offsetTop, keyboardOpen }` 响应式 | fixed 底部栏被键盘遮挡（AiChat `raiseOnKeyboard`） |
| `ctx.ui.useBreakpoint()` / `useMedia()` | 断点回调 | JS 侧响应式 |
| `ctx.ui.useHoverCapable()` | boolean | 自定义 hover/tap 双模式 |

## 五、safe-area（刘海屏/Home 条）

```html
<div class="wf-safe-bottom">…</div>   <!-- padding-bottom: env(safe-area-inset-bottom) -->
<div class="wf-safe-top">…</div>
```

底部抽屉/Modal bottom-sheet 已内置（P2）。

## 六、防横向溢出（375px 验收基线）

- 弹层宽度：openPopup 自动视口夹紧（`calc(100vw - 32px)`）；手动浮层加 `.wf-popup` 基类
- 宽内容（表格/双栏）：容器 `overflow-x: auto`（Table/Resizable 已内置）
- 网格：`minmax(min(100%, 420px), 1fr)`（防 minmax 固定值撑破窄屏）
- 验收：375×667 视口 `document.documentElement.scrollWidth <= innerWidth`

## 七、验证清单

1. 375px 视口无横向溢出
2. 交互元素 tap 可达（44px 命中区）
3. hover 组件 tap 可开、点外部可关、Escape 可关
4. ContextMenu 长按触发
5. 键盘弹起不遮挡输入（fixed 底部栏）
6. 桌面视口行为不变（hover 仍 hover）
7. style-audit 18 规则全绿 + `npm test` ≤15s

## 八、已知裁剪/例外（诚实声明）

- Rate 星 / Tree 勾选 / Slider 手柄：视觉小标记，命中区依赖行级容器（不做元素级 44px，避免破坏视觉）
- ⌘K 类快捷键在移动端无键盘语义（Command 需显式触发按钮）
- `raiseOnKeyboard` 默认 false：内联 chat 靠原生聚焦滚动；全屏 chat 布局才抬升
