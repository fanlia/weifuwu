# weifuwu/layout 参考

> **机器生成**（`scripts/layout-reference.mjs`）——勿手改：改布局源码后跑 `node scripts/layout-reference.mjs`。
> 单源校对：类清单 = `layout-inventory.mjs inventory()` · 层序 = `bundle.ts LAYER_ORDER` ·
> 钩子 = `_props.css @property` · 标尺/断点 = `_tokens.css`。计数口径与 README/`docs/client.md` 全等（L6 哨兵）。

## 1. 层叠与覆盖规则（L9 机制锁定）

- **层序**：@layer `tokens, base, layout, components, utilities`——工具类在 components 之后 = 消费侧显式覆盖恒胜组件样式（旧序相反——W2 修正）
- **display 族基类**（wf-block/wf-flex/wf-hidden）`:where()` 零优先级——断点变体（@sm/@lg）正常优先级 → 变体恒胜基类（跨文件亦然）
- **`!important` 白名单**：仅 `prefers-reduced-motion`（无障碍强制）——其余位置禁（变体靠 specificity 胜出）
- **变量钩子**：`@property inherits:false`（W2）——外层内联赋值不污染子孙原语；syntax `*` 且不写 initial-value（保各原语不同回退值）

## 2. 断点（`--wf-bp-*` = 媒体查询白名单单源——L10）

| 档 | 值 | 合法媒体查询字面量 |
| --- | --- | --- |
| `--wf-bp-sm` | `640px` | `min-width:640px` / `max-width:639.98px` |
| `--wf-bp-md` | `768px` | `min-width:768px` / `max-width:767.98px` |
| `--wf-bp-lg` | `1024px` | `min-width:1024px` / `max-width:1023.98px` |
| `--wf-bp-xl` | `1280px` | `min-width:1280px` / `max-width:1279.98px` |

## 3. 变量钩子（内联覆盖面——`@property` 注册 9 条）

| 钩子 | 回退值（layout 内首个消费） | 说明 |
| --- | --- | --- |
| `--wf-gap` | `（无回退——必填钩子）` | 容器间距默认（stack/row/cluster/grid 原语共用） |
| `--wf-align` | `（无回退——必填钩子）` | 对齐默认（cross-axis） |
| `--wf-justify` | `（无回退——必填钩子）` | 主轴对齐默认 |
| `--wf-cols` | `（无回退——必填钩子）` | grid 列模板（grid 原语） |
| `--wf-max` | `（无回退——必填钩子）` | 容器最大宽（container 原语） |
| `--wf-w-sm` | `（无回退——必填钩子）` | width-sm 工具类默认 |
| `--wf-z` | `（无回退——必填钩子）` | z 档位默认 |
| `--wf-offset` | `（无回退——必填钩子）` | sticky 偏移 |
| `--wf-popup-max` | `（无回退——必填钩子）` | 弹层最大宽（popup 原语） |

## 4. 类清单（inventory 全量——含状态修饰与断点变体）

### 原语（50）

| 类 | 文件 | 声明摘要 | 断点变体 | 状态修饰 |
| --- | --- | --- | --- | --- |
| `wf-absolute` | _position.css | position · position:absolute | — | — |
| `wf-app-shell` | _app-shell.css | display · grid-template-columns · height · overflow · display:grid · overflow:visible | — | — |
| `wf-block` | _block.css | display · display:block | — | — |
| `wf-center` | _center.css | align-items · display · flex-direction · justify-content · display:flex · flex-direction:column · align-items:… | — | — |
| `wf-cluster` | _cluster.css | align-items · display · flex-wrap · gap · justify-content · display:flex · flex-wrap:wrap · justify-content:va… | — | — |
| `wf-container` | _container.css | margin · max-width · padding · width | — | — |
| `wf-cover` | _cover.css | align-items · display · inset · justify-content · position · z-index · position:fixed · display:flex · align-i… | — | — |
| `wf-dim` | _hidden.css | opacity | — | — |
| `wf-fill` | _fill.css | flex · min-height · min-width · flex:1 | — | — |
| `wf-fill-hover` | _fill.css | background · border-radius · margin · padding · transition | — | — |
| `wf-flex` | _flex.css | display · display:flex | @@lg @@sm | — |
| `wf-grid` | _grid.css | display · gap · grid-template-columns · display:grid | — | — |
| `wf-hidden` | _hidden.css | display · display:none | @@lg | — |
| `wf-items-center` | _row.css |  | — | — |
| `wf-items-end` | _row.css |  | — | — |
| `wf-items-start` | _row.css |  | — | — |
| `wf-items-stretch` | _row.css |  | — | — |
| `wf-justify-between` | _justify.css | align-items · display · gap · justify-content · display:flex · justify-content:space-between · align-items:var… | — | — |
| `wf-justify-center` | _justify.css | align-items · display · gap · justify-content · display:flex · justify-content:center · align-items:var(--wf-a… | — | — |
| `wf-justify-end` | _justify.css | align-items · display · gap · justify-content · display:flex · justify-content:flex-end · align-items:var(--wf… | — | — |
| `wf-layer` | _layer.css | position · z-index · position:relative | — | — |
| `wf-main` | _app-shell.css | background · margin-inline · max-width · min-height · min-width · overflow · overflow-y · padding · overflow:v… | — | — |
| `wf-min-width-0` | _shrink.css | min-width | — | — |
| `wf-nav` | _app-shell.css | display · flex-direction · gap · display:flex · flex-direction:column | — | `wf-nav--collapsed` |
| `wf-nav--collapsed` | _app-shell.css | （基类 `wf-nav` 的状态修饰） | | |
| `wf-nav-group` | _app-shell.css | color · font-size · font-weight · letter-spacing · padding · text-transform | — | — |
| `wf-nav-item` | _app-shell.css | align-items · background · border · border-radius · box-shadow · color · cursor · display · font-family · font… | — | `wf-nav-item--active` |
| `wf-nav-item--active` | _app-shell.css | （基类 `wf-nav-item` 的状态修饰） | | |
| `wf-nowrap` | _nowrap.css | display · flex-wrap · gap · display:flex · flex-wrap:nowrap | — | — |
| `wf-overflow-auto` | _overflow.css | overflow · overflow:auto | — | — |
| `wf-overflow-hidden` | _overflow.css | overflow · overflow:hidden | — | — |
| `wf-overflow-x` | _overflow.css | overflow-x | — | — |
| `wf-pointer` | _hidden.css | cursor | — | — |
| `wf-relative` | _position.css | position · position:relative | — | — |
| `wf-row` | _row.css | align-items · display · flex-wrap · gap · display:flex · flex-wrap:wrap · align-items:var(--wf-align, center) | — | — |
| `wf-row-reverse` | _row.css | align-items · display · flex-direction · flex-wrap · gap · display:flex · flex-direction:row-reverse · flex-wr… | — | — |
| `wf-safe-bottom` | _safe-area.css | padding-bottom | — | — |
| `wf-safe-top` | _safe-area.css | padding-top | — | — |
| `wf-self-center` | _align-self.css | align-self | — | — |
| `wf-self-end` | _align-self.css | align-self | — | — |
| `wf-self-start` | _align-self.css | align-self | — | — |
| `wf-self-stretch` | _align-self.css | align-self | — | — |
| `wf-shrink` | _shrink.css | min-height · min-width | — | — |
| `wf-sidebar` | _app-shell.css | background · border-bottom · border-right · display · flex-direction · height · overflow-y · position · top · … | — | — |
| `wf-sidebar-body` | _app-shell.css | flex · overflow-y · padding · flex:1 | — | — |
| `wf-sidebar-footer` | _app-shell.css | border-top · flex-shrink · padding | — | — |
| `wf-sidebar-header` | _app-shell.css | align-items · border-bottom · display · flex-shrink · gap · padding · display:flex · align-items:center | — | — |
| `wf-split` | _split.css | align-items · display · flex-shrink · gap · justify-content · display:flex · justify-content:space-between · a… | — | — |
| `wf-stack` | _stack.css | align-items · display · flex-direction · gap · display:flex · flex-direction:column · align-items:var(--wf-ali… | — | — |
| `wf-sticky` | _sticky.css | position · top · position:sticky | — | — |

### 工具（98）

| 类 | 文件 | 声明摘要 | 断点变体 | 状态修饰 |
| --- | --- | --- | --- | --- |
| `wf-bg-error` | _surface.css | background | — | — |
| `wf-bg-none` | _surface.css | background | — | — |
| `wf-bg-primary` | _surface.css | background | — | — |
| `wf-bg-secondary` | _surface.css | background | — | — |
| `wf-bg-tertiary` | _surface.css | background | — | — |
| `wf-bg-warning` | _surface.css | background | — | — |
| `wf-bold` | _text.css | font-weight | — | — |
| `wf-border` | _border.css | border | — | — |
| `wf-border-bottom` | _border.css | border-bottom | — | — |
| `wf-border-left` | _border.css | border-left | — | — |
| `wf-border-none` | _border.css | border | — | — |
| `wf-border-right` | _border.css | border-right | — | — |
| `wf-border-top` | _border.css | border-top | — | — |
| `wf-break-word` | _text.css | overflow-wrap · word-break | — | — |
| `wf-bubble` | _surface.css | background · border-radius · color · display · font-size · line-height · max-width · padding · white-space · w… | — | `wf-bubble--ai` `wf-bubble--own` |
| `wf-bubble--ai` | _surface.css | （基类 `wf-bubble` 的状态修饰） | | |
| `wf-bubble--own` | _surface.css | （基类 `wf-bubble` 的状态修饰） | | |
| `wf-card-outline` | _surface.css | border | — | — |
| `wf-elevate` | _surface.css | box-shadow · outline · transform · transition | — | — |
| `wf-font-2xl` | _text.css | font-size | — | — |
| `wf-font-3xl` | _text.css | font-size | — | — |
| `wf-font-4xl` | _text.css | font-size | — | — |
| `wf-font-base` | _text.css | font-size | — | — |
| `wf-font-lg` | _text.css | font-size | — | — |
| `wf-font-mono` | _text.css | font-family | — | — |
| `wf-font-sm` | _text.css | font-size | — | — |
| `wf-font-xs` | _text.css | font-size | — | — |
| `wf-gap-lg` | _spacing.css | gap | — | — |
| `wf-gap-md` | _spacing.css | gap | — | — |
| `wf-gap-none` | _spacing.css | gap | — | — |
| `wf-gap-sm` | _spacing.css | gap | — | — |
| `wf-gap-xl` | _spacing.css | gap | — | — |
| `wf-gap-xs` | _spacing.css | gap | — | — |
| `wf-height-full` | _spacing.css | height | — | — |
| `wf-margin-bottom-lg` | _spacing.css | margin-bottom | — | — |
| `wf-margin-bottom-md` | _spacing.css | margin-bottom | — | — |
| `wf-margin-bottom-sm` | _spacing.css | margin-bottom | — | — |
| `wf-margin-bottom-xs` | _spacing.css | margin-bottom | — | — |
| `wf-margin-left-sm` | _spacing.css | margin-left | — | — |
| `wf-margin-left-xs` | _spacing.css | margin-left | — | — |
| `wf-margin-none` | _spacing.css | margin | — | — |
| `wf-margin-top-md` | _spacing.css | margin-top | — | — |
| `wf-margin-top-none` | _spacing.css | margin-top | — | — |
| `wf-margin-top-sm` | _spacing.css | margin-top | — | — |
| `wf-margin-top-xs` | _spacing.css | margin-top | — | — |
| `wf-margin-x-auto` | _spacing.css | margin-left · margin-right | — | — |
| `wf-margin-y-xs` | _spacing.css | margin-bottom · margin-top | — | — |
| `wf-medium` | _text.css | font-weight | — | — |
| `wf-nums` | _text.css | font-variant-numeric | — | — |
| `wf-padding-bottom-md` | _spacing.css | padding-bottom | — | — |
| `wf-padding-bottom-sm` | _spacing.css | padding-bottom | — | — |
| `wf-padding-bottom-xs` | _spacing.css | padding-bottom | — | — |
| `wf-padding-left-sm` | _spacing.css | padding-left | — | — |
| `wf-padding-lg` | _spacing.css | padding | — | — |
| `wf-padding-md` | _spacing.css | padding | — | — |
| `wf-padding-none` | _spacing.css | padding | — | — |
| `wf-padding-sm` | _spacing.css | padding | — | — |
| `wf-padding-top-sm` | _spacing.css | padding-top | — | — |
| `wf-padding-x-md` | _spacing.css | padding-left · padding-right | — | — |
| `wf-padding-x-sm` | _spacing.css | padding-left · padding-right | — | — |
| `wf-padding-x-xs` | _spacing.css | padding-left · padding-right | — | — |
| `wf-padding-xl` | _spacing.css | padding | — | — |
| `wf-padding-xs` | _spacing.css | padding | — | — |
| `wf-padding-y-lg` | _spacing.css | padding-bottom · padding-top | — | — |
| `wf-padding-y-md` | _spacing.css | padding-bottom · padding-top | — | — |
| `wf-padding-y-sm` | _spacing.css | padding-bottom · padding-top | — | — |
| `wf-padding-y-xs` | _spacing.css | padding-bottom · padding-top | — | — |
| `wf-panel-in` | _surface.css | animation · transform-origin | — | — |
| `wf-pill` | _surface.css | border-radius | — | — |
| `wf-pre-wrap` | _text.css | white-space · word-break | — | — |
| `wf-radius` | _surface.css | border-radius | — | — |
| `wf-radius-lg` | _surface.css | border-radius | — | — |
| `wf-radius-md` | _surface.css | border-radius | — | — |
| `wf-radius-sm` | _surface.css | border-radius | — | — |
| `wf-rounded-md` | _surface.css | border-radius | — | — |
| `wf-rounded-sm` | _surface.css | border-radius | — | — |
| `wf-semibold` | _text.css | font-weight | — | — |
| `wf-shadow` | _surface.css | box-shadow | — | — |
| `wf-surface` | _surface.css | background · border-radius · box-shadow | — | `wf-surface--flat` |
| `wf-surface--flat` | _surface.css | （基类 `wf-surface` 的状态修饰） | | |
| `wf-text-center` | _text.css | text-align | — | — |
| `wf-text-danger` | _text.css | color | — | — |
| `wf-text-error` | _text.css | color | — | — |
| `wf-text-left` | _text.css | text-align | — | — |
| `wf-text-nowrap` | _text.css | white-space | — | — |
| `wf-text-on-brand` | _text.css | color | — | — |
| `wf-text-on-warning` | _text.css | color | — | — |
| `wf-text-primary` | _text.css | color | — | — |
| `wf-text-right` | _text.css | text-align | — | — |
| `wf-text-secondary` | _text.css | color | — | — |
| `wf-text-success` | _text.css | color | — | — |
| `wf-text-tertiary` | _text.css | color | — | — |
| `wf-text-warning` | _text.css | color | — | — |
| `wf-tracking-wide` | _text.css | letter-spacing | — | — |
| `wf-truncate` | _text.css | overflow · text-overflow · white-space · overflow:hidden | — | — |
| `wf-uppercase` | _text.css | text-transform | — | — |
| `wf-width-full` | _spacing.css | width | — | — |
| `wf-width-sm` | _spacing.css | width | — | — |

### 内部（2）

| 类 | 文件 | 声明摘要 | 断点变体 | 状态修饰 |
| --- | --- | --- | --- | --- |
| `wf-popup` | _popup.css | box-sizing · max-width | — | — |
| `wf-popup-mask` | _popup.css | background · inset · position · z-index · position:fixed | — | — |

## 5. 间距标尺（双标尺定案——L13：gap 派生自 space 紧一档）

| 档 | space（内/外边距） | gap（容器内间距——派生） | 关系 |
| --- | --- | --- | --- |
| — | `--wf-space` = `12px` | `--wf-gap-md = var(--wf-space)` | 裸档即 md 档源 |
| xs | `4px` | `var(--wf-space-xs)` | gap 比 space 紧一档 |
| sm | `8px` | `var(--wf-space-sm)` | gap 比 space 紧一档 |
| md | `16px` | `var(--wf-space(裸))` | gap 比 space 紧一档 |
| lg | `24px` | `var(--wf-space-md)` | gap 比 space 紧一档 |
| xl | `32px` | `var(--wf-space-lg)` | gap 比 space 紧一档 |
| 2xl | `40px` | `var(--wf-space-xl)` | gap 比 space 紧一档 |

> 关系入代码：预设（compact）只覆写 space 标尺——gap 自动跟随；值冻结由 L13 守卫。

## 6. 零消费公共面（文档化定案——「示例 = 可发现」，不做裁剪）

以下类在代码语料（apps + src/client/components）零引用——属 weifuwu/layout npm 公共清单，
退出消费或库侧裁剪时才移除（登记单源：`layout-inventory.mjs` QUARTET_KEEP / LIB_SURFACE_KEEP）；
现文档化（示例 = 可发现）：

- `wf-absolute`：定位：`<div class="wf-absolute wf-inset-0">`（绝对定位铺满——需 position 上下文）
- `wf-cover`：媒体覆盖：`<div class="wf-cover"><img /></div>`（绝对定位全铺容器）
- `wf-layer`：层叠原语：`<div class="wf-layer wf-z-pop">`（相对定位层，按 z 叠放）
- `wf-nav`：导航条：`<nav class="wf-nav"><a class="wf-nav-item">…`（横向导航——内部项自带命中区）
- `wf-nav-group`：导航分组：`<div class="wf-nav-group">`（导航项分组容器/标签）
- `wf-radius-lg`：圆角档：`class="wf-radius-lg"`（大圆角——不在半径标尺逐档之外的独立值）
- `wf-safe-bottom`：底部安全区：`class="wf-safe-bottom"`（env(safe-area-inset-bottom)——iOS 底部）
- `wf-safe-top`：顶部安全区：`class="wf-safe-top"`（env(safe-area-inset-top)——刘海屏）
- `wf-self-start`：cross-axis 单项定位：`class="wf-self-start"`（align-self: flex-start——与 wf-self-stretch 同族）

> showcase 演示页私有类（`wf-variant-toggle/chevron/name/desc`——页面上下文定义，非库面）不计入。

## 7. 计数速览（L1/L6 哨兵口径）

| 面 | 数量 |
| --- | --- |
| 布局原语 | 50 |
| 工具类 | 98 |
| 内部类 | 2 |
| 主题 token | 178 |
