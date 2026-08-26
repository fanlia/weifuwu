# weifuwu/layout + components 样式专业度优化方案（2027-XX）

> 状态：✅ **全部完成（M1-M6——P0-P5）**
> （M1：暗色零破损 + S1-S7 审计红线；M2：CJK 字体栈 + 字号 token 化；M3：动效单轨 0.12s + 交互状态链 + 矩阵；
> M4：卡片边框化 + Modal 12px + 表面矩阵；M5：舞台编排 + wf-surface--flat；
> M6：wf-main 行宽变量 --wf-main-max（默认 none 零破坏）+ 折叠态 title 约定文档化。
> 终验：契约 129 / 场景 112 / showcase 198 / typecheck 全绿）
> （M1：契约 128 绿 / 暗色截图归零；M2：+S6 / 字号 token 化；M3：+S7 / 动效单轨 0.12s 实测；
> M4：案 A 卡片边框化 + Modal 12 + 表面矩阵文档；
> M5：舞台编排——组件详情页标题 3xl+desc、demo 舞台标题栏（● 圆点+分隔线+min-height）、
> 全站 `wf-surface wf-border` 双重阴影 → `--flat` 平面表面（新增工具变体——测试选择器兼容），
> showcase 全量 198 测试绿）
> 目标：让布局层 + 组件库的呈现达到"专业 SaaS 框架"水准——暗色零破损、
> 设计语言（微流明三支柱 + 五品格）100% 落地、交互反馈一致、舞台（showcase）专业。
> 审计基线：129 组件 CSS / 10,226 行 / 66 原语 + 157 工具类 + 182 Token（实测）。

---

## 1. 现状盘点（证据先行）

样式系统"底子"已经很好（双层 Token、暗色双段映射、状态层/Material 状态、
动效 Token 阶梯、CJK Token 均已存在且多数组件合规）。但逐文件审计 + 浏览器实证
发现 6 类真实缺口——**多数是"已有规范未贯彻"而非"缺规范"**。

### 缺口 A：旧 Token 体系残留 → 暗色模式破损（P0——正确性）

3 个组件仍引用**已废除的旧 Token 名**（带硬编码 hex 回退），当前 Token 层
**不存在**这些变量 → 声明永远落到 hex 回退 → **暗色模式硬编码亮色值**：

| 组件 | 旧名（全部未定义） | 回退值 | 暗色后果（浏览器实证） |
|---|---|---|---|
| FileTree | `--wf-border` / `--wf-surface-2` / `--wf-text` / `--wf-text-secondary` / `--wf-text-tertiary` / `--wf-bg-hover` / `--wf-primary` / `--wf-bg`（19 处） | `#e5e7eb` `#fafafa` `#111827` `#6b7280` `#9ca3af` `#f0f0f0` `#4f6ef7` `#fff` | 工具栏刺眼白条、文件名 `#111827` 深字在暗底**不可读**（截图实证：/components/editor/filetree 暗色） |
| RelationGraph | `--wf-border` / `--wf-text` / `--wf-text-tertiary` / `--wf-text-secondary`（7 处） | 同上 | 节点文字/图例暗底亮灰白块、网格线固定浅灰 |
| AppShell | `--wf-text-tertiary`（2 处）/ `--wf-bg-hover`（1 处） | `#9ca3af` `#ececec` | 品牌副标/用户邮箱固定灰（侥幸接近暗色意图）；**用户区 hover 出现浅灰块**（`#ececec`，暗侧栏上刺眼） |

软性残留（有回退、语义错位）：ChatInput `--wf-color-primary-muted`、FilePreview
`--wf-color-bg-muted`（均回退到近似 token——建议改名或删回退，登记白名单）。

### 缺口 B：CJK 原生规范未贯彻（P1——设计语言 5 条理念之五）

`--wf-heading-case: none` / `--wf-heading-tracking: 0`（CJK 默认 none/0，英文可覆盖）
已落地于 base `th`、layout `wf-nav-group`、Select/SessionList/Typography——但 3 处
**组件硬编码**绕过（中文表头被加 0.5px 字距 → 视觉松散、"不专业"的直接来源之一）：

| 文件 | 硬编码 | 应改为 |
|---|---|---|
| Table.css `wf-table-th` | `text-transform: uppercase; letter-spacing: 0.5px` | `var(--wf-heading-case)` / `var(--wf-heading-tracking)` |
| Menu.css `wf-menu-group` | `letter-spacing: 0.02em` | `var(--wf-heading-tracking)` |
| AppShell.css `wf-app-shell-brand-sub` | `letter-spacing: 0.04em; text-transform: uppercase` | 同上（英文产品可覆盖 token） |

另：**字体栈缺 CJK 字体**——`--wf-font-sans` 只有西文栈（`-apple-system…sans-serif`），
中文落到系统默认（Linux/Windows 渲染不一致、无思源/苹方优先级）。"中文原生"理念
的最后一公里。

### 缺口 C：交互状态链不一致（P2——微交互清单 §4 的抽查项）

| 项 | 现状 | 基准（应一致） |
|---|---|---|
| Select 原生 `wf-select` | **无 hover** 边框加深 | Input 有 `:hover → border-dark` |
| Select searchable trigger | **无 hover** | 同上 |
| Tag `wf-tag-close` | 有 hover，**无 focus-visible** | Select tag close 有 focus-ring（同为可关闭钮） |
| SearchInput clear / Pagination | 多数有 | 逐一过"四态链"检查表（见 §3 工具） |

### 缺口 D：动效 Token 双轨（P2——收敛一致）

- 59 个组件已用 `--wf-dur-*` + `--wf-ease-*`；**17 个仍用旧 `--wf-transition`**
  （150ms ease）——同一 hover 两种节奏并存。
- 硬编码时长残留：RelationGraph `0.15s`（2 处）、Editor `0.15s/0.1s`（2 处）、
  Loading/Button spinner `0.6s`（旋转动画——白名单可留，建议 token `--wf-dur-spin`）。
- 零成本收敛方案：**`--wf-transition` 改为派生别名**
  `var(--wf-dur-fast) var(--wf-ease-out)`（= 120ms 微流明标准 hover 节奏）——
  17 个文件自动统一，无需逐文件迁移。

### 缺口 E：表面语言与微流明支柱一不符（P3——"面孔"一致性）

design-language.md §4.1："阴影仅用于抬升语义——不用于静态卡片装饰"、
"层级 = 表面 + 边界线组合"。现状：

- `wf-card--default`、`wf-stat` 默认用 `--wf-surface-shadow`（静态阴影卡）
  ——与 antd/shadcn 主流（默认 1px 边框、无阴影）相反，页面显得"软、糊"。
- 浮层圆角家族无显式矩阵：Modal/Drawer 默认 `--wf-radius-md`(8px)、Tooltip `sm`(4px)、
  面板族 8px——专业系统通常 Modal/Drawer 12–16px（有抬升语义）。

### 缺口 F：showcase 舞台编排（P4——应用层修复，门面即品牌）

- 组件详情页：`← 活体 demo（可交互）` 箭头方向错误（标签在卡片**顶部**应为 `↑` 或去箭头）；
  demo 面板无统一 min-height（组件间跳变）；"原始 .md（LLM）"按钮在标题右侧远悬
  （无动作区时留白突兀）。
- 组件页标题 21px（`wf-text-2xl`）——设计语言顶级页标题应为 display 档 30px。
- 布局原语页卡片稀疏（大空白，信息密度不足）。

---

## 2. 分层方案（每层独立可交付、可回滚）

```
P0 正确性（暗色零破损）  → P1 排版/中文原生 → P2 交互一致/动效收敛
→ P3 表面语言对齐 → P4 舞台编排 → P5 布局精修（可选）
```

### P0：暗色模式零破损（3 文件全量迁移）

**FileTree.css**（19 处）——旧名 → 语义 Token 映射表：

| 旧名 | 新名 | 备注 |
|---|---|---|
| `--wf-border` | `--wf-color-border` | 外框/横向分割 |
| `--wf-surface-2` | `--wf-color-bg-secondary` | 工具栏底/预览底（暗色自动抬升一级） |
| `--wf-text` | `--wf-color-text` | 文件名/编辑器文字 |
| `--wf-text-secondary` | `--wf-color-text-secondary` | 面包屑次级 |
| `--wf-text-tertiary` | `--wf-color-text-tertiary` | 分隔符/meta |
| `--wf-bg-hover` | `--wf-state-hover` | 列表项 hover（Material 状态层——与 Select opt 一致） |
| `--wf-primary` | `--wf-color-primary-text` | 目录名（浅底语义文字色） |
| `--wf-bg` | `--wf-color-bg` | 编辑器底 |

同时 px 值 token 化：`8px`→`--wf-radius-md`、`6px`→`--wf-radius`、`4px`→`--wf-radius-sm`、
`13px/12px`→`--wf-font-size-base/sm`、`8px 10px`→`--wf-space-sm` 系。

**RelationGraph.css**（7 处）：同上；`transition: opacity 0.15s` →
`var(--wf-dur-fast) var(--wf-ease-out)`（2 处）。

**AppShell.css**：`--wf-text-tertiary`→`--wf-color-text-tertiary`（2 处，
品牌副标 `#9ca3af` 的"侥幸正确"结束）、`--wf-bg-hover #ececec`→`--wf-state-hover`；
字号/间距硬编码（14/13/11px、8/4px）→ 对应 Token。

**配套防线（写进 style-audit 的新规则——一次修复不再回潮）**：
1. 组件 CSS **零 hex/rgba 字面量**（`#fff` 也不行，含 `var(--x, #… )` 回退——回退必须是已定义 Token）。
2. 组件 CSS 引用的 `var(--wf-*)` **必须存在于 layout 层定义集**（脚本化：解析 tokens+layout 全部 `--wf-*` 定义 → 比对组件引用→ 未知即报错。当前 49 个"未定义"中真违例即 A 类清单）。
3. 文档计数同步（style-audit L0 单一事实源纪律）。

### P1：中文原生与排版

1. `--wf-font-sans` 增补 CJK 栈（唯一改动点，全库受益）：
   `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif`
   （西文优先、中文随系统最优字形；`--wf-font-mono` 同步补 CJK 回退）
2. Table/Menu/AppShell 三处硬编码 → `--wf-heading-case/--wf-heading-tracking`
   （与 base `th`/layout 完全同源）。
3. PageHeader display 档 `letter-spacing: -0.5px` → 新 Token
   `--wf-heading-display-tracking: -0.5px`（显示档字距可覆盖）。
4. `--wf-font-size-xs` 文本扫描：10px 白名单复核（审计已收 4 个——复查无新增）。

### P2：交互一致 + 动效收敛

1. **Select 补齐 hover**：`.wf-select:hover:not(:disabled)`、
   `.wf-select-search-trigger:hover` → `border-color: var(--wf-color-border-dark)`
   （与 Input 同款）；disabled 分支不 hover。
2. **Tag close / SearchInput clear 补 focus-visible**（focus-ring + radius-sm，
   对齐 Select tag close）。
3. **交互状态显式矩阵**（写进 style-guide 或 micro-interactions §4 表格补充）：
   | 元素族 | hover | pressed | 选中 |
   |---|---|---|---|
   | 按钮族（solid） | 色深一档 | scale 0.98 / brightness | — |
   | 列表族（menu/nav/opt） | state-hover | state-pressed | primary-bg + primary-text |
   | 分页页码 | border 品牌 | — | **solid primary**（页码是"按钮态"——与列表族差异登记为合法） |
   | Tab | 文字加深 | — | ink bar + primary-text |
   ——差异允许，但**必须登记**（消除"看起来不一致其实是语义差异"的直觉噪声）。
4. **动效单轨**：`--wf-transition` = `var(--wf-dur-fast) var(--wf-ease-out)`（派生别名，
   tokens 一处改动，17 文件自动收敛）；Editor 两处 0.15s/0.1s → `--wf-dur-fast`；
   spinner 0.6s → `--wf-dur-spin: 0.6s` 新 Token（具名旋转节拍）。

### P3：表面语言对齐（决策点——两案择一执行）

| 案 | 内容 | 风险 |
|---|---|---|
| 案 A（推荐，贴 design-language） | `wf-card--default` / `wf-stat` 默认 → **border 优先**（`--wf-color-border` + 保持半径/bg，去默认阴影）；shadow 仅 `--elevate` / hover / 浮层。原始阴影用户可用 `--wf-card-shadow` 钩子恢复 | 视觉风格变化（showcase 全站截图基线更新） |
| 案 B（保守） | 保持现状，登记"卡片默认 shadow"为已批准的例外（P11-R35 语义内） | 支柱一落地不完整 |

浮层圆角矩阵（新 Token 默认值调整，均已有钩子）：
Modal/Drawer `--wf-modal-radius` 默认 `--wf-radius-md`(8) → `--wf-radius-lg`(12)；
面板族（dropdown/select/datepicker）保持 8；Tooltip 4；**矩阵入文档**。

### P4：showcase 舞台编排（应用层——按归类纪律不动框架）

1. 组件详情页 demo 面板：顶部"活体 demo"条形标题（按钮式小标题 + 右对齐
   "查看源码"入口——对齐 patterns 页已有模式）；箭头修正（`↑`）；demo 区
   min-height（`min-height: 320px` 级别，按组件族分档）防跳变。
2. 组件页标题：`wf-text-2xl` → `wf-text-3xl`（24px）或 PageHeader display 档——
   与"顶级页面标题"设计语言对齐；面包屑与标题间距收紧。
3. 布局原语页卡片：信息密度提升（示例缩略图/属性摘要行）——P5 可选。

### P5：布局层精修（可选，评估后执行）

- `wf-main` 内容区行宽：AppShell 内长文本全宽（含文档站场景）——提供
  `wf-main > .wf-container` 约定 or `wf-main` 加 `--wf-max` 变量（默认 none 不破现网）。
- `wf-nav-item` 折叠态 tooltip 语义、`--wf-layout-header-height` 落地检查。
- `wf-app-shell` 移动端降级后 header 高度/base 对齐（56px token 已有）。

---

## 3. 工具落地（审计脚本——防回潮的唯一可靠手段）

`scripts/style-audit.mjs`（新增，参考 layout-inventory.mjs 模式）：
```
规则 S1  组件 CSS 无 hex/rgba/透明度字面量（含 var 回退——回退值必须为已定义 Token）
规则 S2  组件 CSS var(--wf-*) 全部存在于 layout 定义集（未定义 = 报错，白名单登记制）
规则 S3  表头/分组标题不硬编码 text-transform/letter-spacing（必须引用 --wf-heading-*）
规则 S4  交互元素四态链扫描（有 :hover 的无 :active → warn；button 无 focus → warn）
规则 S5  动效时长无裸秒/毫秒（spin 白名单 --wf-dur-spin）
            + 计数断言（原语 66 / 工具 156 / Token 177——沿用 L0 纪律）
```

接入测试：`src/client/layout/style-audit.test.ts` 扩展（node 直跑——契约层纪律，
零浏览器、≤10s timeout）。

---

## 4. 验收

| 层 | 验收项 | 方法 |
|---|---|---|
| P0 | FileTree/RelationGraph/AppShell 暗色截图文案可读、无白条 | agent-browser 暗色截图对比（前后各一组） |
| P0 | S1/S2 规则走查全库归零；旧名 `wf-text`/`wf-border`/`wf-surface-2`/`wf-bg-hover`/`wf-primary` 在 src/client 归零 | 审计脚本 |
| P0 | 契约层 126 + 场景层 + showcase 组件测试全绿（迁移不改结构——纯 CSS） | npm run test:client / test:scenario / test:showcase |
| P1 | 中文表头字距归零（可视对比）；字体栈含 CJK 栈 | 浏览器走查 + grep |
| P2 | Select hover 与 Input 一致；Tag close 键盘可达；`--wf-transition` 一处改动后 17 组件节奏统一 | 目视 + 审计（S4/S5） |
| P3 | Card/StatCard 默认边框化（案 A）；Modal 默认 12px | 截图 + CSS 断言 |
| P4 | 演示页舞台:面包屑→标题→demo 栏节奏统一；无跳变 | showcase 走查五页（button/table/form/ai-chat/filetree × 明暗） |
| 总 | **style-audit 45 + 新 S1-S5 全绿**（防回潮红线） | npm run test:client |

---

## 5. 实施顺序与预估

| 里程碑 | 内容 | 依赖 |
|---|---|---|
| M1 | **✅ 已完成**：P0 三文件迁移（FileTree/RelationGraph/AppShell——27 处旧 token 归零）+ 软性残留 2 处（ChatInput/FilePreview）+ CJK 硬编码 4 处前置清理（Table/Menu/PageHeader/AppShell——一并迁入 P1 规范）+ 循环动效族 Token（--wf-dur-spin/pulse/blink/progress）+ display 字距 Token（--wf-heading-display-tracking）+ `scripts/style-audit.mjs`（S1-S5）+ `src/test/contract/style-audit.test.ts`（S1-S5 零错误 + S4 基线登记制 79——M3 清单）+ 文档计数同步 177→182 | 无（先行——正确性） |
| M2 | **✅ 已完成**：CJK 字体栈（--wf-font-sans/mono 补 PingFang/Hiragino/雅黑/Noto Sans SC——浏览器实测 computed font-family 生效）；硬编码字号复核：12 处白名单（图标字形/头像/徽标——固定尺寸不参与预设缩放），20 处正文类 12/13/14px 同值 token 化（**compact 预设可缩放**——实测 13px→12px 跟随）；审计新增 S6 字号登记制（基线 12）；layout-guide 字体说明同步 | M1 |
| M3 | **✅ 已完成**：动效单轨（--wf-transition → dur-fast(120ms)+ease-out 派生别名——17 文件自动收敛，实测 0.12s 生效）；交互补齐（Select 原生+searchable hover / Tag-close·SearchInput-clear focus-visible+active / Tabs·Menu·Pagination·Card·StatCard·Breadcrumb·Accordion·SessionList·Rate 状态链）；交互状态矩阵登记入 micro-interactions.md §4.1（按钮族 solid vs 列表族 light-bg 合法差异显式化）+ 动效单轨 §4.2；审计新增 S7（注释提前闭合——**实证：--wf-transition-duration 被注释内 `*/` 吞声明**）；S4 基线 79→66 | M1 |
| M4 | **✅ 已完成（案 A）**：Card 默认边框化（1px --wf-color-border——阴影仅抬升，wf-elevate 承担 hover；--wf-card-shadow 钩子保留可恢复）；StatCard 同（border-light 细边框）；Modal 默认圆角 md(8)→lg(12)；Drawer 贴边 0（确认维持）；浮层表面矩阵入 docs/style-guide.md（Modal 12 / 面板族 6-8 / Tooltip 4 / Drawer 0）；首页+仪表盘+卡片 demo 亮暗截图实证 | M1 |
| M5 | **✅ 已完成**：组件详情页头部（标题 2xl→3xl + desc 副标题 + 动作按钮组——对齐 makeDomainPages 域模板）；demo 舞台（● 品牌圆点标题栏 + 分隔线 + 白底内容区 min-height 220px——箭头修复/防跳变）；**全站卡片双重阴影清理**：`wf-surface wf-border` 组合 24 处 → 新增 `wf-surface--flat` 工具变体（测试选择器 `main .wf-surface` 零破坏——comp-* 全量 198 绿）+ 工具计数 156→157 文档同步 | M4 |
| M6 | **✅ 已完成（可选——评估后落地 2 项）**：wf-main 行宽变量 `--wf-main-max`（默认 none 零破坏——文档站/长文本设 900px 限宽居中）+ layout-guide 折叠态 nav title 约定文档化；`--wf-layout-header-height` 核验：已被组件 Layout 消费（无需动作）；仪表盘/管理后台页面实测零回归 | M4 |

每步纪律（AGENTS.md）：core 修复必写契约测试/S 规则锁定；测试命令 ≤10s timeout；
组件层异常先查核心层根因——本方案 P0-P3 均为核心层（token/规范）修复，全库受益。

## 6. 不做清单（诚实裁剪）

- 不改组件 JS 行为/接口（纯 CSS + showcase 应用层）——样式方案零 breaking change。
- 不加新组件/新品牌色（现有 --wf-brand-seed 换肤链已够）。
- 不重排组件 CSS 内部结构（@layer 机制不动——避免层叠回归）。
- 不动 UI 框架的 vdom/命令流（本方案与渲染引擎零交集）。
