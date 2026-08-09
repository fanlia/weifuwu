# weifuwu/components 呈现与功能完善计划（P12）

> 目标：从「组件集齐全 + 视觉 token 化」迈向「**每组件功能完备 + 呈现态齐全 + 无障碍达标 + demo 覆盖全态**」。
> 前置：P10（测试基线 109 组件全达标）/ P11（视觉全 token 化，R34-37 硬门）/ 组件集 100% 覆盖三库 208 项。
> 方法论同 P10/P11：**机审规则先行 + 每组件 checklist + Wave 逐批 + agent-browser 验收**，不重写、增量补全。

## 前置事实（2026-08 摸底）

| 维度 | 现状 | 缺口 |
| --- | --- | --- |
| 组件集 | 109 组件，三库 208 项 100% 对应 | ✅ 齐全 |
| 测试 | 1883 pass，P10 基线全达标 | ✅ |
| 视觉 | P11 全 token 化（R34-37 硬门） | ✅ |
| **roadmap 未决** | ~15 项「见 roadmap」悬而未决（Menu 子菜单/Timeline 横向/Transfer 搜索/Markdown GFM/VirtualTable 行选择/Cascader 搜索/InputNumber 长按/AvatarGroup tooltip 等） | 需 triage：DO 或永久裁剪 |
| **demo 丰富度** | Select 2 例 / Table 1 例 / DatePicker 4 例——多数未覆盖状态×变体矩阵 | 需补状态/变体/交互示例 |
| **状态完备** | 多数组件有 default/hover/focus/disabled，但 loading/empty/error 态覆盖不一致 | 需按组件类型定基线 |
| **a11y** | audit 仅 4 条（role/tabindex/focus/coarse），缺 ARIA 状态标签 + 键盘完整性扫描 | 需扩 audit |
| **永久裁剪** | 各组件 TS 已声明（CS-05 诚实裁剪） | ✅ 需集中登记防漂移 |

**结论**：架构与基线已稳，缺口是「单组件完整度最后一里」——功能 roadmap triage、状态矩阵补齐、a11y 扫描、demo 丰富化。

## 决策

1. **roadmap triage（零悬而未决）**：每个「见 roadmap」项必须判定为 **DO**（本计划实现）或 **CUT**（永久裁剪，登记理由）。不留中间态。
2. **状态矩阵基线**（按组件类型，机器可查 demo 文本特征）：
   - 输入类（Input/Select/DatePicker…）：default / focus / disabled / error
   - 触发类（Button/Menu/Tab…）：default / hover / active / disabled（+ loading 若支持）
   - 容器类（Table/List/Tree…）：default / empty / loading（+ error 若有数据源）
   - 弹层类：open / close / disabled-trigger
3. **demo 丰富度门**：每组件 demo ≥3 示例且覆盖其状态矩阵（audit 扫 demo 源码特征词）。
4. **a11y 扩 audit**：交互表面必须有 ARIA（role/aria-label/aria-expanded/aria-selected/aria-disabled 等，按语义）；键盘路径完整（方向键导航组件必须有 onKeyDown）。
5. **机审优先**：能 grep/AST 化的先入 audit；无法机器化的（如「键盘路径是否完整」）走 agent-browser 抽检。
6. **不重写**：增量补 props/状态/示例，不改 API 兼容；新增能力 TDD（红→绿）。
7. **裁剪集中登记**：所有永久裁剪项进 `design/components-cuts.md` 单一事实源，组件 TS 注释引用。

## 阶段总览

| Wave | 内容 | 工作量 | 风险 | 依赖 | 状态 |
| --- | --- | --- | --- | --- | --- |
| W0 | audit 防线扩容（38→44 条）+ 裁剪登记 + roadmap triage | M | 低 | — | ⬜ |
| W1 | 高频表单族（23 组件） | L | 中 | W0 | ⬜ |
| W2 | 数据展示族（24 组件） | L | 中 | W0 | ⬜ |
| W3 | 弹层反馈族（17 组件） | L | 中 | W0 | ⬜ |
| W4 | 导航布局基础族（30 组件） | M | 低 | W0 | ⬜ |
| W5 | AI 工具链族（9 组件） | M | 中 | W0 | ⬜ |

## Wave 0：audit 防线 + 裁剪登记 + roadmap triage

### 0.1 audit 扩容（38 → 44 条）

| # | 规则 | 检测 | 豁免 |
| --- | --- | --- | --- |
| 39 | **demo 状态矩阵覆盖** | 每组件 demo 源码须含其类型的状态特征词（输入类: `disabled`/`error`；容器类: `empty`/`loading`） | 登记豁免（无该态语义的组件） |
| 40 | **demo 丰富度 ≥3 示例** | 每组件 demo 内 `<Comp` 出现 ≥3 次（或同组件多 DemoCard） | 纯展示单态组件（Divider/Icon） |
| 41 | **交互表面 ARIA 标签** | `[role=button/tab/option/...]` 或 `wf-*--clickable` 必须有 `aria-label`/`aria-labelledby` 或可访问名 | 文本子节点即名称的（button 有 children） |
| 42 | **弹层 aria-expanded** | usePopup 组件的 trigger 必须有 `aria-expanded`/`aria-haspopup` | — |
| 43 | **键盘导航组件有 onKeyDown** | .ts 含 `role="tablist"/"menu"/"tree"/"listbox"` 的必须有 `onKeyDown` | — |
| 44 | **裁剪声明单一事实源** | 组件 TS 中「裁剪」声明必须引用 `design/components-cuts.md`（或集中登记） | — |

### 0.2 裁剪集中登记

新建 `design/components-cuts.md`：汇总所有永久裁剪项（组件 / 能力 / 理由 / 替代方案），组件 TS 注释改为引用。防止「见 roadmap」与「裁剪」措辞漂移。

### 0.3 roadmap triage（~15 项 → DO/CUT）

| 组件 | roadmap 项 | 判定 | 理由 |
| --- | --- | --- | --- |
| Menu | 折叠态子菜单浮层 | DO | 侧栏导航核心场景 |
| Menu | 子菜单自动互斥 | CUT | 单展开语义由父层 controlled 更可控 |
| Timeline | 横向时间线 | DO | 步骤展示常见 |
| Transfer | 搜索过滤 | DO | 大数据量必备 |
| Tree | 搜索过滤 | DO | 大树必备 |
| VirtualTable | 行选择 rowSelection | DO | 表格高频需求 |
| Cascader | 搜索 | DO | 大数据必备 |
| InputNumber | 长按连增 | DO | 数字输入标配 |
| AvatarGroup | hover tooltip | CUT | Tooltip 可组合，不内建 |
| Markdown | GFM 表格/任务列表/删除线 | DO | 文档场景核心 |
| Markdown | 语法高亮 | CUT | 零依赖红线（引入 highlighter 即破） |
| LogViewer | 正则高亮 | CUT | 性能与复杂度，组合 Filter 即可 |
| Carousel | 垂直模式 | CUT | 低频，fade 可 CSS 配 |
| JSONViewer | JSON 编辑 | CUT | 只读定位（编辑用 Editor） |
| Scrollbar | 拖动 thumb | CUT | webkit 样式已够，拖动 thumb 体验争议大 |

（DO 项进 W1-W5 对应 Wave；CUT 项登记 `components-cuts.md`。）

## Wave 1-5：逐组件 checklist（每组件 6 维）

| 维度 | 检查 |
| --- | --- |
| F1 功能完备 | 对照 antd/EP 等价能力；roadmap DO 项实现；CUT 项登记 |
| F2 状态完备 | 按类型矩阵（输入/触发/容器/弹层）补 loading/empty/error/disabled |
| F3 变体完备 | size/variant/alignment/placement 全覆盖 |
| F4 a11y | ARIA 角色/状态/标签 + 键盘路径完整（方向键/Enter/Escape/Tab） |
| F5 响应式 | 移动端：触控 44px、换行、横向滚动、全宽 |
| F6 demo | ≥3 示例覆盖状态×变体×交互；agent-browser 实测 |

**Wave 内步骤**（每组件）：
1. 读 impl + 对比 antd/EP → 列功能/状态/变体缺口
2. TDD 补能力（红→绿）+ 补状态 CSS/逻辑
3. 补 a11y（ARIA + 键盘）
4. 扩 demo（≥3 示例，全态覆盖）
5. agent-browser 实测交互 + 亮暗双主题截图
6. 跑组件测试 + audit 转绿
7. demo README 追加验收记录

**Wave 门禁**：全量 `npm test` + audit 44 条 + build + demo 验收记录 + 单次提交。

## Wave 分组

- **W1 高频表单**（23）：Input/Textarea/Select/AutoComplete/Cascader/TreeSelect/Checkbox/Radio/Switch/Slider/Rate/DatePicker/Calendar/Mentions/TagsInput/SearchInput/PasswordInput/SegmentedControl/PinInput/ColorPicker/InputNumber/FileUpload/Form/Field
- **W2 数据展示**（24）：Table/VirtualTable/VirtualList/InfiniteScroll/Tree/Chart/Sparkline/Timeline/Tag/Badge/EmptyState/StatCard/Img/CodeBlock/DiffView/LogViewer/JsonViewer/Skeleton/Highlight/Descriptions/List/Result/Avatar/AvatarGroup
- **W3 弹层反馈**（17）：Modal/Drawer/Popover/Tooltip/Dropdown/ContextMenu/HoverCard/Menubar/Popconfirm/Tour/Command/Toast/Notification/Confirm/Alert/AlertGroup/MessageBubble
- **W4 导航布局基础**（30）：NavMenu/Menu/Tabs/Pagination/Anchor/Affix/BackTop/FloatButton/Link/Breadcrumb/Steps/Loading/ProgressBar/Divider/PageHeader/Layout/Grid/Col/Space/Scrollbar/ThemeSwitch/Collapse/Accordion/Card/Watermark/QRCode/AspectRatio/Icon/Label/Title/Text/Paragraph
- **W5 AI 工具链**（9）：AiChat/ToolCallCard/ApprovalCard/Command/JSONViewer/LogViewer/DiffView/Pipeline/MessageBubble（部分与 W2 重叠，W5 聚焦 AI 语义增强）

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| roadmap DO 项实现引入 API 变更 | 仅 additive（新 props/方法），不改既有默认行为 |
| demo 扩写推高 components-demo 体积 | 懒加载分 section；不影响首屏 |
| a11y audit 误报（语义难机器化） | 豁免登记表 + agent-browser 抽检兜底 |
| roadmap DO 项工作量大 | 按 Wave 拆分；单 Wave 可跨多提交；高价值优先 |
| 测试时长超 15s | 新增能力 TDD 用 VNode 断言（无 DOM）；IO 测试不新增 |

## 验收标准（P12 完成）

- [ ] audit 44 条全绿（6 条新规则）
- [ ] roadmap triage 清零（DO 项全实现，CUT 项登记 components-cuts.md）
- [ ] 每组件 demo ≥3 示例且覆盖状态矩阵
- [ ] 交互表面 ARIA + 键盘完整（agent-browser 抽检通过）
- [ ] 全量测试绿，时长 ≤15s
- [ ] `docs/components-map.md` / `docs/components.md` 同步功能变更
- [ ] `design/components-cuts.md` 单一事实源建立

## 进度记录

（Wave 完成后追加）
