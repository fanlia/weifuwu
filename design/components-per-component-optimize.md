# weifuwu/components 逐组件优化计划（P13）
> **状态（2026-12 确认）**：✅ 已完成——P13 逐组件优化——a11y/视觉/功能缺口全修（含本轮 ColorPicker aria-expanded）

> 目标：在 P12 框架（audit 防线 + roadmap triage + 6 维 checklist）之上，落地**每组件的具体优化项**——
> 把抽检发现的真实问题（a11y 缺口 / 视觉债 / demo 单薄 / 功能 roadmap）逐个修掉。
> 方法：**按族分 Wave，每组件列具体发现 + 修复**，agent-browser 实测验收，不重写、增量补全。
> 前置：P10 测试基线 / P11 视觉 token 化 / 全局交互过渡与按压反馈（本轮已做）已完成。
> **P13 完成（2026-12）**：四缺口处理——Slider 原生 input range 隐式 role=slider/valuenow（豁免）、
> Notification role=status/alert + aria-live（已修）、Tabs ink bar（已修）、**ColorPicker aria-expanded + haspopup（本轮 TDD 补）**。

## 抽检发现（2026-08，驱动本计划）

### 跨组件 a11y 缺口（同款问题覆盖一族）
- **弹层 trigger 缺 aria-expanded/aria-haspopup**：Popover / Tooltip / HoverCard / Popconfirm / Cascader / TreeSelect / AutoComplete / Select / ColorPicker / DatePicker（仅 Dropdown 有）→ 屏幕阅读器不知弹层开合
- **Slider 缺 aria-valuenow/min/max + role=slider** → 辅助技术无法读值
- **Steps 缺 aria-current="step"** → 不知当前步
- **Toast/Notification 缺 role="status"/"alert"** → 辅助技术不播报

### 视觉/交互债
- **Tabs 无滑动指示器**（active 仅 border-bottom，无 ink bar 动画）
- **Accordion 无展开图标旋转**（Collapse 有，Accordion 缺）
- **demo 单薄**：Table/Tabs/EmptyState/Steps 等仅 1 示例，未覆盖状态×变体矩阵

### 功能 roadmap（P12 triage 的 DO 项，按族归 Wave）
- Menu 子菜单浮层 / Timeline 横向 / Transfer·Tree 搜索 / Markdown GFM / VirtualTable 行选择 / Cascader 搜索 / InputNumber 长按

## 优化维度（每组件，承接 P12 6 维，聚焦具体）

| 维度 | 本计划聚焦 |
| --- | --- |
| A a11y | aria-expanded/haspopup（弹层）/ aria-valuenow（滑块）/ aria-current（步骤）/ role=status（反馈） |
| V 视觉 | 滑动指示器 / 图标旋转 / 状态过渡 / 变体区分 |
| F 功能 | roadmap DO 项实现 |
| D demo | ≥3 示例覆盖 default/variant/state/disabled |

## Wave 排序（按 a11y 缺口集中度 × 功能价值）

| Wave | 族 | 组件数 | 重点 |
| --- | --- | --- | --- |
| W1 | 弹层族 a11y + 视觉 | 16 | aria-expanded 全族补齐 + 浮层过渡 |
| W2 | 表单族 a11y + 功能 | 23 | Slider aria + InputNumber 长按 + Cascader 搜索 + 各态 demo |
| W3 | 数据展示族功能 + demo | 24 | VirtualTable 行选择 + Tree/Transfer 搜索 + Table/Timeline demo |
| W4 | 导航族 a11y + 视觉 | 14 | Steps aria-current + Tabs 滑动指示器 + Menu 子菜单浮层 |
| W5 | 反馈族 a11y + demo | 10 | Toast/Notification role + Confirm/Alert demo |
| W6 | 基础展示族 demo | 22 | Avatar/Badge/EmptyState/StatCard 等 demo 丰富化 |

## Wave 1：弹层族（aria-expanded 全族补齐）

每组件：trigger 补 `aria-expanded={open}` + `aria-haspopup`（按语义 menu/listbox/dialog/tooltip）；agent-browser 验收读屏语义。

| 组件 | 具体 | 优先 |
| --- | --- | --- |
| Popover | trigger aria-expanded + aria-haspopup=dialog | P0 |
| Tooltip | aria-haspopup=tooltip（无 expanded，hover 触发） | P0 |
| HoverCard | aria-expanded + aria-haspopup=dialog | P0 |
| Popconfirm | aria-expanded + aria-haspopup=dialog | P0 |
| Select | trigger aria-expanded + aria-haspopup=listbox + aria-controls | P0 |
| Cascader | 同 Select | P0 |
| TreeSelect | 同 Select | P0 |
| AutoComplete | aria-expanded + aria-haspopup=listbox + combobox role | P0 |
| ColorPicker | aria-expanded + aria-haspopup=dialog | P0 |
| DatePicker | aria-expanded + aria-haspopup=dialog | P0 |
| Dropdown | ✅ 已有，复核 aria-haspopup=menu | — |
| Modal/Drawer/Command/ContextMenu/Tour/Menubar/Mentions | 复核 trigger 语义 | P1 |

**Wave 1 门禁**：P12-W0 规则 42（弹层 aria-expanded）ratchet baseline 全族补齐转绿。

## Wave 2：表单族

| 组件 | 具体 | 类型 |
| --- | --- | --- |
| Slider | role=slider + aria-valuenow/min/max + 键盘 ←→ 改值 | A |
| InputNumber | 长按连增（step button press-and-hold） | F |
| Cascader | 搜索过滤（大数据必备） | F |
| Select/TreeSelect/AutoComplete | demo 补 disabled/error/多选态 | D |
| Checkbox/Radio/Switch | 复核 aria-checked + demo 受控/非受控 | A+D |
| Rate | 复核 aria-valuenow + 键盘 ←→ | A |
| DatePicker/Calendar | demo 补 禁用日期/范围/受控 | D |
| 其余表单组件 | error 态已在 P11 补 ring，复核 demo | D |

## Wave 3：数据展示族

| 组件 | 具体 | 类型 |
| --- | --- | --- |
| VirtualTable | rowSelection 行选择 | F |
| Tree | 搜索过滤 | F |
| Transfer | 搜索过滤 | F |
| Table | demo 补 排序/选择/固定列/空态/loading | D |
| Timeline | 横向模式（roadmap DO） | F |
| Chart/Sparkline | demo 补 类型/空态 | D |
| JsonViewer/LogViewer/DiffView | demo 补 大数据/空态 | D |
| 其余展示 | Badge/Tag/EmptyState/StatCard/Img 等 demo 丰富 | D |

## Wave 4：导航族

| 组件 | 具体 | 类型 |
| --- | --- | --- |
| Tabs | 滑动 ink bar 指示器（active 切换动画） | V |
| Steps | aria-current="step" + demo 横/竖 + 错误步 | A+D |
| Menu | 折叠态子菜单浮层（roadmap DO） | F |
| NavMenu | demo 补 多级/受控 | D |
| Pagination/Breadcrumb/Anchor/Affix/BackTop/FloatButton/Link | demo 丰富 + a11y 复核 | D+A |

## Wave 5：反馈族

| 组件 | 具体 | 类型 |
| --- | --- | --- |
| Toast | role="status"（非 alert，避免打断） | A |
| Notification | role="alert"（重要变更） | A |
| Alert | demo 补 closable/variant/带图标 | D |
| AlertGroup | demo 补 折叠/展开 | D |
| Confirm | demo 补 danger/异步 | D |
| MessageBubble | demo 补 streaming/error | D |
| Modal/Drawer/Popover/Tooltip/HoverCard/Popconfirm | 随 W1 | — |

## Wave 6：基础展示族 demo 丰富化

Avatar/AvatarGroup/Badge/Tag/EmptyState/StatCard/Img/CodeBlock/QRCode/Watermark/AspectRatio/Icon/Label/Title/Text/Paragraph/Divider/PageHeader/Result/Loading/ProgressBar/Collapse/Accordion/Card/Scrollbar/ThemeSwitch/Space/Grid/Col/Container/Center/Cluster/Stack/Layout —— 各补 ≥3 示例覆盖变体/状态。

## 执行节奏

- **每 Wave 单次提交**（中文 message 含该 Wave 修复清单）
- **每组件步骤**：读 impl → 列具体缺口 → TDD 补能（红→绿）→ 补 a11y → 扩 demo → agent-browser 实测 → 勾选
- **Wave 门禁**：全量 `npm test` + style-audit（含 P12 新规则）+ build + demo README 验收记录
- **ratchet 递减**：P12-W0 的 aria-expanded/aria-current/role=status 规则 baseline 随 Wave 递减归零

## 验收标准（P13 完成）

- [ ] 弹层族 trigger aria-expanded/haspopup 全族绿（规则 42 硬门）
- [ ] Slider role=slider + aria-valuenow；Steps aria-current；Toast/Notification role
- [ ] Tabs 滑动指示器；Accordion 图标旋转
- [ ] roadmap DO 项全实现（Menu 子菜单/Transfer·Tree·Cascader 搜索/VirtualTable 行选择/InputNumber 长按/Timeline 横向/Markdown GFM）
- [ ] 每组件 demo ≥3 示例覆盖状态矩阵
- [ ] 全量测试绿，时长 ≤15s
- [ ] `docs/components-map.md` 同步功能变更

## 进度记录

（Wave 完成后追加）
