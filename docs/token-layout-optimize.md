# token + layout 优化计划（P7）

> 目标：让"零自定义 CSS"从**够用**到**可定制**——定制组件（一个变量）与定制主题（一层值）都零 CSS 文件。
> 前置事实：P0-P6 已达成"三 app 零 style.css + 794 测试"；本阶段不做功能扩张，只强化 token/layout 层的**可定制性**与**认知一致性**。

## 阶段总览

| 阶段 | 内容 | 工作量 | 风险 | 依赖 | 状态 |
|---|---|---|---|---|---|
| P0 | 命名收尾（brand→primary 别名、leading/pointer 补域） | S | 低 | — | ✅ |
| P1 | 组件 CSS 变量化（shadcn 式定制钩子） | M | 低 | — | ✅ |
| P2 | Token 双层化（Primitive/Semantic）+ 暗色去重 | L | 中 | P0 | ✅ |
| P3 | @layer 层叠化 | S | 低 | P2 | ✅ |
| P4 | `wf-prose` 内容排版原语 | M | 低 | — | ✅ |
| P5 | 命名规范 + 三档学习路径文档 | M | 低 | P0-P4 | ✅ |

## 验收记录

- P0：`wf-text-primary`/`wf-bg-primary` 别名 + `wf-leading-*`/`wf-pointer`，审计无回归
- P1：13 组件 16 个钩子变量（`--wf-btn-radius`/`--wf-modal-width`/`--wf-field-*`…），浏览器实测设变量即生效（无 !important）
- P2：115 token 双层（原始层 ~40 + 语义层 ~75），亮色改 `--wf-brand-500` 全站跟随；暗色映射 `--wf-dark-*` 零硬编码（审计强制）
- P3：dist 首行 `@layer tokens, base, layout, utilities, components;`，用户 @layer 覆盖 + 未分层天然最高优先级均实测生效
- P4：`wf-prose` 正文排版（14px/21px h2/品牌引用边框），浏览器实测
- P5：`docs/style-guide.md`（统一语法 + 三档 + 场景速查 + 变量定制）+ README 三档化

全量 796 测试 + style-audit 8 项全绿。

---

## P0 — 命名收尾（先行，避免后续重复改）

- `brand` → `primary`：新增 `wf-text-primary` / `wf-bg-primary`，旧名保留同值别名（非 breaking）
- 补两个高频域：`wf-leading-{tight,base,relaxed}`（消费闲置的 `--wf-line-height-*`）、`wf-pointer` / `wf-not-allowed`（cursor）
- 组件 CSS 内 `var(--wf-color-primary)` 引用不变，无组件改动

**验证**：`style-audit` 增加"工具类无硬编码色值"检查；全量测试。

## P1 — 组件 CSS 变量化（shadcn 模式）

每个组件的"定制钩子"用 `var(--wf-xxx, 默认值)` 形式，默认值引用现有 token：

```css
/* 现状：定制 Modal 宽度要写覆盖 CSS */
.wf-modal-content { min-width: 400px }
/* 优化后：设一个变量即可 */
.wf-modal-content { min-width: var(--wf-modal-width, 400px) }
```

**组件钩子清单（默认值 = 现有值，全部不破坏存量）**：

| 组件 | 钩子变量 |
|---|---|
| Button | `--wf-btn-radius` `--wf-btn-pad-y` `--wf-btn-pad-x` |
| Card | `--wf-card-radius` `--wf-card-pad` `--wf-card-shadow` |
| Input/Textarea/Select | `--wf-field-radius` `--wf-field-height`（统一控件钩子，现有 `--wf-control-*` 对齐） |
| Modal | `--wf-modal-width` `--wf-modal-radius` `--wf-modal-shadow` |
| Drawer | `--wf-drawer-width` `--wf-drawer-radius` |
| Toast | `--wf-toast-radius` `--wf-toast-width` |
| Alert / Badge / Tag | `--wf-alert-radius` `--wf-badge-radius` `--wf-tag-radius` |
| Popover / Tooltip | `--wf-popover-radius` `--wf-tooltip-radius` |
| Skeleton | `--wf-skeleton-radius` |

原则：能引用现有 token 的**不新建**（如 Button 半径 → `var(--wf-btn-radius, var(--wf-radius))`）；组件专用视觉（modal width）才建钩子。

**验证**：`style-audit` 新增规则——组件 CSS 的 padding/radius/width 等关键视觉必须 `var()` 化（保留图标/展示尺寸白名单）；抽查 3 个组件设变量定制，浏览器实测生效且无 `!important`。

## P2 — Token 双层化（Primitive / Semantic）+ 暗色去重

**现状**：92 个 token 单层，值直接写在语义名上；暗色两段 400 行重复值靠人工同步。

**优化**：`_tokens.css` 拆两层，`_dark.css` 经间接层去重：

```css
/* ── 原始层（primitive，品牌/中性色值，只定义一次） ── */
:root {
  --wf-brand-500: #4f6ef7;  --wf-brand-600: #3b5ae0;  --wf-brand-50: #eef1ff;
  --wf-green-500: #22c55e;  --wf-green-50: #f0fdf4;
  --wf-amber-500: #f59e0b;  --wf-amber-50: #fffbeb;
  --wf-red-500: #ef4444;    --wf-red-50: #fef2f2;
  --wf-sky-500: #1677ff;    --wf-sky-50: #e6f4ff;
  --wf-slate-900: #0f172a;  --wf-slate-500: #64748b;  --wf-slate-400: #94a3b8;
  --wf-slate-300: #cbd5e1;  --wf-slate-200: #e2e8f0;  --wf-slate-100: #f1f5f9;
  --wf-slate-50: #f8fafc;   --wf-white: #ffffff;
  --wf-dark-primary: #6b8aff;  …（暗色值也只定义一次）
}

/* ── 语义层（主题只改这层） ── */
:root {
  --wf-color-primary: var(--wf-brand-500);
  --wf-color-primary-hover: var(--wf-brand-600);
  --wf-color-primary-bg: var(--wf-brand-50);
  …
}

/* ── 暗色：两段只做映射，值已定义在原始层 ── */
:root[data-theme="dark"] { --wf-color-primary: var(--wf-dark-primary); … }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }
```

**收益**：
- 品牌换色 = 覆盖一个原始层值（`--wf-brand-500`），全站跟随
- 暗色值**只定义一次**（`--wf-dark-*`），两段映射消除 400 行重复与不一致隐患
- 与 shadcn/tailwind v4 的 primitive/semantic 心智对齐

**注意**：token 计数变化（+~25 原始层），README「92 个主题 Token」同步更新；`style-audit` 的计数规则适配双层。

**验证**：`style-audit` 新增——暗色两段不得出现硬编码色值（必须引用 `--wf-dark-*` 间接层）；浏览器实测改一个原始层值全站跟随 + 暗色正常。

## P3 — @layer 层叠化

```css
@layer tokens, base, layout, utilities, components;
```

- 源文件规则包进对应层（`_tokens/_dark`→tokens、`_base`→base、布局原语→layout、工具类→utilities、组件 CSS→components）
- 收益：用户项目若用 `@layer` 组织，可精确控制覆盖顺序（自己 utilities 盖 weifuwu utilities）；未分层用户代码天然最高优先级（不变）
- 实现：`scripts/build.mjs` 合并时按文件映射包层，源文件零侵入

**验证**：构建后 CSS 首行有 @layer 声明；浏览器实测用户 `@layer` 覆盖生效。

## P4 — wf-prose 内容排版原语

补唯一"常见页面类型"缺口：文章/博客/文档正文。

```css
.wf-prose { … }  /* 容器级排版：h2-h4/p/ul/ol/blockquote/pre/code/table/hr/img */
```

- 行高节奏、标题字距、列表缩进、引用边框、代码块样式，全部消费现有 token
- 服务 `apps/demo` 的 blog 页（当前需手写正文排版）

**验证**：components-demo 加 prose 演示块；blog 页可零 CSS 渲染正文。

## P5 — 命名规范 + 三档学习路径

- `docs/style-guide.md`：统一语法（`wf-<域>-<名>` + 值类裸词）、域总表、命名规范表
- 三档学习路径（组件 → 10 核心原语 → 完整速查）+ 场景化速查（"我要两端分布→wf-split"）
- README「布局系统」章节按三档重构

**验证**：文档与 `src/layout/` 实际类名自动一致性（脚本比对，防文档漂移）。

---

## 诚实裁剪（不做）

- 完整色阶（50-900 全套）：P2 原始层已埋品牌/中性色阶，完整扩展等有需求再补
- OKLCH / color-mix / light-dark()：浏览器基线未定，等 P2 落地后评估
- 容器查询 / 断点间距变体 / 逻辑属性（RTL）：当前场景无需求
- 按需生成 / 体积 tree-shake：与"零构建纯 link"冲突
- `weifuwu/layout` 包名改名：另行决策，不并入本计划

## 执行顺序

```
P0 命名收尾 → P1 组件变量化 → P2 token 双层化 + 暗色去重 → P3 @layer → P4 prose → P5 文档
```

每阶段独立可发布；P1/P2 是核心（可定制性），P3/P4/P5 是增强。全量 794+ 测试 + style-audit 扩展 + build 验证为每阶段门禁。
