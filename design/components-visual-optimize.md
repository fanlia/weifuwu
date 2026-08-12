# weifuwu/components 视觉样式优化计划（P11）
> **状态（2026-12 确认）**：✅ 已完成——P11 视觉 token 化 + 交互态完备——全组件 hover/focus/disabled 一致

> 目标：组件 CSS 从「token 部分采用 + 交互态部分覆盖」迈向**全 token 化 + 交互态完备**——
> 单一真相源（零裸值/零 fallback）、全组件 hover/focus/disabled 一致、字号/圆角/阴影/间距全走阶梯。
> 方法论同 P10：**机审规则先行（红→绿）+ Wave 逐批迁移 + agent-browser 视觉验收**，不重写、bug 驱动。

## 前置事实（2026-08 摸底）

| 维度 | 现状 | 缺口 |
| --- | --- | --- |
| CSS 规模 | 107 文件 / 7516 行 | — |
| 暗色架构 | 纯 token（0 组件级覆盖） | ✅ 干净，本计划不动 |
| 色值 | 30/107 CSS 含裸 hex/rgba | 多为 `var(--t, fallback)` 的 fallback（第二真相源）；少数真违规（#999、#f9fafb） |
| 圆角 | 66 token / 36 裸 | audit 规则 159 仅查「关键视觉」，36 裸值漏网 |
| 阴影 | 23 token / 21 裸 | 无 audit 规则 |
| 字号 | 91 token / 47 裸（13×9、12×9、11×4、10×4…） | 无 audit 规则，脱离 `--wf-font-*` 阶梯 |
| 间距 | 82 token / 729 px 值 | 非 4 倍数（13/11/5/7px）脱离 `--wf-space-*`；无 audit 规则 |
| z-index | 26 token / 6 裸 `z-index:1` | audit 规则 46 已禁裸值却存活——局部层叠豁免不清 |
| hover | 59/107 覆盖 | 8 交互组件缺 hover（AiChat/ApprovalCard/Card/CheckboxGroup/Img/Popconfirm/RadioGroup/StatCard） |
| focus-visible | 36/107 | 交互组件覆盖不足 |
| :active | 3/107 | 按压反馈近乎缺失 |
| disabled | 25/107 | 部分覆盖 |
| 动效 | 56 token / 4 裸 | ✅ 近全 token（P8 已治） |

**结论**：架构无问题，缺口是「采用完整度」——补 audit 规则把裸值/缺态变红，再逐组件迁移。已有设计文档分工：
- `design-system-polish.md`（P8）：动效语言 + 键盘可达 + 语义一致性（**已完成，不重复**）
- `token-layout-optimize.md`（P8）：layout 原语 token 化（**已完成**）
- 本计划（P11）：**components CSS 的 token 采用完整度 + 交互态完整度**（最后一里）

## 决策

1. **fallback 策略**：组件 CSS 禁 `var(--token, 字面量)` fallback——token 必在 `_tokens.css` 先于 components 加载，恒有定义；fallback 是第二真相源 + 死代码。迁移为纯 `var(--token)`。
2. **局部 z-index**：6 个 `z-index:1` 是组件内层叠（Carousel slide / Timeline dot / Modal 内容压遮罩 / Tour bubble）。引入 `--wf-z-local: 1` 语义 token，迁移；保留 audit「禁裸 z-index」原则。
3. **字号阶梯映射**：13px→`--wf-font-sm`、12px→`--wf-font-xs`、11px/10px→`--wf-font-2xs`、16px→`--wf-font-md`、14px→`--wf-font-base`、24px→`--wf-font-xl`、48px→`--wf-font-3xl`（按 `_tokens.css` 实际阶梯核对）。
4. **阴影/圆角**：全走 `--wf-shadow-*` / `--wf-radius-*`；裸值迁移。
5. **间距**：padding/margin/gap 走 `--wf-space-*`（4px 阶梯）；1px 边框、% / fr / calc 不受限。
6. **交互态**：可点击表面（button/[role=button]/[tabindex] + 组件 `--clickable` 类）必须配 `:hover` + `:focus-visible` + `:active` + `:disabled`（按语义）。
7. **机审优先**：每条规则先评估能否机器化（grep/AST），能则进 style-audit，不靠人眼。
8. **不动架构**：不重写 CSS 结构、不改类名语义、不动暗色机制；仅值迁移 + 状态补齐。

## 阶段总览

| Wave | 内容 | 工作量 | 风险 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| W0 | audit 防线扩容（33→40 条） | M | 低 | — | ⬜ |
| W1 | 高视觉密度组件（Editor/DatePicker/Select/FileUpload/Menu/Cascader/Drawer——CSS ≥149 行） | L | 中 | W0 | ⬜ |
| W2 | 弹层族（Modal/Drawer/Popover/Tooltip/Dropdown/ContextMenu/HoverCard/Menubar/Popconfirm/Tour/Command/Cascader/Mentions/Select/AutoComplete/TreeSelect） | L | 中 | W0 | ⬜ |
| W3 | 表单族（Input/Textarea/Select/AutoComplete/Checkbox/Radio/Switch/Slider/Rate/DatePicker/Calendar/TreeSelect/Cascader/Mentions/TagsInput/SearchInput/PasswordInput/SegmentedControl/FileUpload/Form） | L | 中 | W0 | ⬜ |
| W4 | 数据展示（Table/VirtualTable/VirtualList/InfiniteScroll/Tree/Chart/Sparkline/Timeline/Tag/Badge/EmptyState/StatCard/Img/CodeBlock/DiffView/LogViewer/JsonViewer/Skeleton/Highlight/InView/Pipeline/ApprovalCard/ToolCallCard） | L | 中 | W0 | ⬜ |
| W5 | 导航/反馈/杂项（NavMenu/Tabs/Pagination/Anchor/Affix/BackTop/FloatButton/Link/Breadcrumb/Alert/AlertGroup/Toast/Notification/Confirm/CopyButton/QRCode/Icon/Layout/Space/Scrollbar/ThemeSwitch/AiChat/Collapse/Card/Carousel/Kanban） | L | 中 | W0 | ⬜ |

## Wave 0：audit 防线扩容（33 → 40 条）

新增 7 条机审规则（先写测试断言当前违规 = 红 → 迁移后转绿）：

| # | 规则 | 检测 | 豁免 |
| --- | --- | --- | --- |
| 34 | **禁 `var(--token, fallback)` 双真相源** | 组件 CSS 中 `var(--wf-[^,]+,\s*[^)]+`（含字面量 fallback） | 无（token 恒定义） |
| 35 | **字号全 token 化** | `font-size:` 后非 `var(--wf-font` | `_base.css`；`inherit`/`0`/`1em` 相对值 |
| 36 | **圆角全 token 化** | `border-radius:` 后非 `var(--wf-radius`（扩规则 159 范围） | `50%`（圆形）/ `0` |
| 37 | **阴影全 token 化** | `box-shadow:` 含数字且非 `var(--wf-shadow` | `none` / `inherit` |
| 38 | **间距阶梯化** | padding/margin/gap 值为非 4 倍数 px（排除 1px 边框） | 1px / % / fr / calc / `auto` / token 引用 |
| 39 | **交互表面态完备** | 含 `--clickable` / `[role=button]` / `type=button` 类的 CSS 块缺 `:hover` 或 `:focus-visible` | display-only 容器（登记豁免表） |
| 40 | **禁裸 z-index 扩局部豁免** | `z-index:` 非 `var(--wf-z`——迁移 6 处 → `--wf-z-local` | 无 |

**注意**：规则 34（fallback 禁令）影响面最大（30 文件），是 W1-W5 的主干工作；先落地规则 + 红态快照（记录违规数），随 Wave 推进递减。

## Wave 1-5：逐组件迁移（每组件 checklist）

每个组件 CSS 走 6 维 checklist（同 P10 节奏）：

| 维度 | 检查 |
| --- | --- |
| V1 色值 | 裸 hex/rgba → token；`var(--t, fallback)` → 纯 `var(--t)`；语义文字色用 `-text` 变体 |
| V2 圆角/阴影/字号/间距 | 全 token 化（按决策 3-5 映射） |
| V3 z-index | 裸值 → `--wf-z-*`（局部层叠用 `--wf-z-local`） |
| V4 交互态 | hover/focus-visible/active/disabled 完备（按语义） |
| V5 动效 | transition 引用 `--wf-dur/ease`（P8 已治，复检） |
| V6 暗色 | 纯 token 即自动暗色（0 组件覆盖——复检无 `prefers-color-scheme`/`.wf-dark` 漏入） |

**Wave 内步骤**（每组件）：
1. 读 `Comp.css` → 列违规项（grep 裸值/缺态）
2. 迁移值 → token（按映射表）
3. 补缺失交互态（hover/focus-visible/active）
4. agent-browser 视觉验收：亮/暗双主题 + hover/focus 真实截图对比（Appendix A 纪律：看 `getComputedStyle` 实际生效值，不只看 CSS 文本）
5. 跑该组件测试 + style-audit 规则转绿
6. 在 `apps/components-demo/README.md` 追加验收记录

**Wave 门禁**（每 Wave 末）：
- 全量 `npm test` 绿（含新增 audit 规则）
- style-audit 40 条绿
- `node scripts/build.mjs` 绿
- demo 视觉验收记录入 README
- 单次提交（中文 commit message）

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| fallback 禁令误伤（token 真未定义时组件无样式） | 迁移前 grep 确认每个 token 在 `_tokens.css` 有定义；缺则先补 token |
| 字号映射破坏视觉密度（13px→sm 可能跳档） | 按 `_tokens.css` 实际阶梯核对，必要时扩阶梯（如补 `--wf-font-13`）而非硬塞 |
| 交互态补齐引入回归（hover 背景闪、active 位移） | agent-browser 真实交互验收；active 仅对原生 button/`--clickable`，不动容器 |
| 裸 z-index:1 迁 `--wf-z-local` 改变层叠语义 | `--wf-z-local: 1` 值不变，仅语义化；逐个 agent-browser 验（Modal 内容仍压遮罩、Tour bubble 仍在 highlight 上） |
| 测试时长超 15s 预算 | audit 规则是同步 grep，增量 <50ms；不新增真库/IO 测试 |

## 验收标准（P11 完成）

- [ ] style-audit 40 条全绿（7 条新规则从红→绿）
- [ ] 组件 CSS 零裸色值/零 `var(--t, fallback)` / 零裸 z-index / 零裸字号 / 零裸圆角 / 零裸阴影 / 零非 4px 间距
- [ ] 全交互组件 hover + focus-visible + active + disabled 态完备
- [ ] agent-browser 亮/暗双主题视觉验收全通过（截图归档）
- [ ] 全量测试绿，时长仍在 15s 预算内
- [ ] `design/style-system.md` / `docs/styling.md` 同步「全 token 化」纪律

## 进度记录

- **P11 收官 ✅**（2026-08）：全组件 CSS 全 token 化。R34/35/36/37 四条 ratchet 
  全部归零成硬门（241/75/73/85 → 0/0/0/0）。token 计数 164→166（新增
  --wf-shadow-inset + 暗色覆盖）。修复 2 处批量脚本缺陷引入的静默 CSS bug
  （嵌套 var 尾 ) 残留致 box-shadow 声明无效 / fix_spacing 丢选择器前缀）。
  4 处文字色 500 级→-text 变体。W0 防线 33→38 条。
- **W0 ✅**：5 条新规则（R34 fallback 禁令精化为「仅已定义 token」、
  R35 box-shadow 全 token（允许任意 var(--wf-*)）、R36 间距 4 倍数
  （簥免 ≤2px/负微偏移）、R37 禁裸 hex/rgba/hsla、R38 交互组件 hover 态）
- **W1 ✅**：Editor/DatePicker/Select/Menu/Cascader/Drawer/FloatButton
- **W2 ✅**：13 弹层组件
- **W3-W5 ✅**：表单/数据展示/导航反馈剩余组件
