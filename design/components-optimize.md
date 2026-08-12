# weifuwu/components 逐组件优化计划（P10）
> **状态（2026-12 确认）**：✅ 已完成——P10 逐组件体检表——全体通过

> 目标：109 个组件**逐个过统一体检表**，推到同一质量基线——不是重写，是
> 系统性硬化。每个组件：读实现 → 体检表 → 红→绿修 → demo 实测 → 勾表。
>
> 前置：CDD 扩张已收官（109 组件）；P9 demo 走查已修 8 bug + 3 防线
> （apps tsc 门禁 / role-tabIndex / 计数同步）；style-audit 30 条。
>
> **原则：能机器化的不人肉**——体检表每个维度先问"能否写成 audit/脚本"，
> 防退化靠防线，不靠记忆。

## 现状数据（2026-08 实测）

- 109 组件 / 812 测试，均值 7.4——**方差极大**：Confirm 0 测试；Divider/
  PageHeader/Result/AlertGroup/Scrollbar 仅 3 个
- 高复杂 × 低覆盖重灾区：DatePicker（348 行/8 测试）、JSONViewer（252/6）、
  Chart（217/10）、AiChat（213/10）、NavMenu（210/10）、Tour（187/10）
- P9 走查证明：**jsdom 单测全绿 ≠ 浏览器可用**（NavMenu tabIndex 死代码、
  ToolCallCard 文本泄漏都是单测盲区）

## 体检表（每组件 6 维度）

| # | 维度 | 检查点 | 机器化 |
|---|------|--------|--------|
| T1 | **API 一致性** | 受控 props 命名对称（value/onChange、open/onOpenChange、activeKey/onSelect…）；受控/弹层/输入走 `useControlled`/`useOpen`/`usePopup`/`useControlledInput` 原语，不自造 | 半（命名对称可扫） |
| T2 | **可访问性** | 交互元素可聚焦（role+tabIndex——audit 第 30 条已兜底）+ 键盘路径（Enter/Space/方向键/Escape）+ 触屏 44px | 半 |
| T3 | **状态纪律** | `$`/let 选择正确；ref 稳定（§5.1）；定时器/监听卸载清理；共享状态 `__watch`（§4.6） | 否（人工） |
| T4 | **环境纪律** | 零 DOM 全局（audit 已兜底）+ SSR 安全 | 是（已有） |
| T5 | **测试基线** | 交互组件 ≥8 测试 / 展示组件 ≥3；必须含受控路径 + 键盘路径 + 一个边界用例 | 是（计数防线） |
| T6 | **demo/docs** | demo 可交互（非只读摆设）+ docs/components.md 有条目 | 半 |

## Wave 0 — 自动化防线先行（S）

把体检表能机器化的部分先变成防线，后续 Wave 的收益不退化：

1. **测试基线防线**：每组件 `.test.ts` 必须存在且达基线（交互 ≥8 / 展示 ≥3，
   注册表分类——Confirm 0 测试从此不可能）
2. **受控命名对称扫描**：组件 props 出现 `value/checked/open/active*/selected*/expanded*/checked*`
   受控名 → 必须存在对称回调（onChange/onOpenChange/onSelect…）或文档化豁免
3. **docs 条目防线**：docs/components.md 条目 ↔ 组件目录同步（漂移即红）

**验证**：style-audit 新增 3 条绿；故意删一个测试文件 → 红。

## 进度记录

- **Wave 5 ✅**（2026-08）：Affix/Alert/Anchor/ApprovalCard/BackTop/CodeBlock/CopyButton/
  InfiniteScroll/Link/Pagination/Tabs/Tag 12 组件补达基线（受控回调/键盘可达/变体/边界）。
  **TEST_GAP 注册表归零——109 组件全部 ≥ 基线（交互 8 / 展示 3）**，注册表机制保留防空
  （新组件低于基线必须登记）。计数 904。P10 收官：全量 1878 测试绿
- **Wave 4 ✅**（2026-08）：Img/Timeline/VirtualTable 补达基线（fallback 边界/reverse+alternate/受控排序/窗口行数）；TEST_GAP W4 清零；计数 875
- **Wave 3 ✅**（2026-08）：Checkbox/RadioGroup/Switch/Slider/SearchInput/PasswordInput/
  SegmentedControl/Calendar/TreeSelect 9 组件补到达基线；**Calendar 日期格子可点不可聚焦
  修复**（role=button + tabIndex + Enter/Space，P1）；Switch/Checkbox/Slider 原生非受控
  语义验证合法（无需 useControlled）；TEST_GAP W3 清零；计数 871
- **Wave 2 ✅**（2026-08）：Tooltip/Menubar 6→8、Popconfirm 5→8、AlertGroup 3→8、
  FloatButton 6→8 测试（受控对称/键盘可达/边界）；弹层族 14 个 demo 实测全过；
  TEST_GAP W2 条目清零；计数 845
- **Wave 0 ✅**（2026-08）：三条新防线（测试基线含 TEST_GAP 注册递减 / 受控命名对称
  + 豁免登记 / demo 覆盖）；Confirm 0→4 测试；计数 816
- **Wave 1 ✅**（2026-08）：JSONViewer 6→8 测试；Confirm 4→9 测试 + **命令式 portal
  泄漏修复**（静态 open=true + 手动 --exit 类 → resolve 后宿主重渲染把 modal 重挂回
  portal 永久残留；改为 $ 驱动 open + Modal 退场状态机自动卸载 + 包装 div 保 _refNode——
  ToastHost 同款）；W1 其余组件 T3/T4 扫描干净（定时器清理/零 DOM 全局/无内联 ref）
  demo 实测：Menu 选中/Table/Chart/Confirm 命令路径/DatePicker 打开 全过

## Wave 1 — 高复杂 × 低覆盖（13 个，风险最高）

Editor(406行) · DatePicker(348) · JSONViewer(252) · Select(250) · Tree(238) ·
Chart(217) · AiChat(213) · NavMenu(210) · Menu(205) · Table(197) ·
AutoComplete(196) · Tour(187) · Confirm(0 测试)

每组件：补测试到基线 + 体检表全 6 维 + demo 交互实测（agent-browser）。
Confirm 是命令式中间件——0 测试不可接受（Modal 系焦点/异步语义）。

## Wave 2 — 弹层/浮层族（14 个）

Modal · Drawer · Popover · Tooltip · HoverCard · Dropdown · ContextMenu ·
Menubar · Popconfirm · Command · Notification · Toast · AlertGroup · FloatButton

重点：usePopup 复用度（§5.4——不自造 overlay/定位/Escape）、portal 纪律、
退场动画状态机、焦点 trap/归还。

## Wave 3 — 表单族（22 个）

Input · Textarea · Checkbox · CheckboxGroup · RadioGroup · Switch · Slider ·
Form · Field · SearchInput · InputNumber · PasswordInput · TagsInput · PinInput ·
ColorPicker · FileUpload · Calendar · Rate · ToggleGroup · Mentions · Cascader · TreeSelect

重点：受控纪律（§5.2/5.3）、IME composition、useControlledInput 复用、
label 关联（aria）、校验错误展示。

## Wave 4 — 数据展示族（24 个）

Table · List · VirtualList · VirtualTable · Descriptions · StatCard · Card ·
Badge · Tag · Avatar · AvatarGroup · Timeline · Img · DiffView · LogViewer ·
Sparkline · QRCode · CodeBlock · Highlight · Markdown · Kanban · Pipeline ·
EmptyState · Result

重点：keyed 列表 diff（§6.3）、内置类型 $ 降级（§6.4）、滚动容器原语复用。

## Wave 5 — 导航/反馈/杂项（36 个）

Tabs · Breadcrumb · Pagination · Steps · Anchor · BackTop · Affix · Accordion ·
Collapse · Alert · Loading · Skeleton · ProgressBar · PageHeader · Space · Grid ·
Layout · Link · Divider · Label · AspectRatio · Icon · Typography · SegmentedControl ·
Scrollbar · InView · Resizable · Carousel · ThemeSwitch · CopyButton ·
ApprovalCard · MessageBubble · ToolCallCard · InfiniteScroll · Transfer · Button · Badge 收尾

重点：键盘导航焦点跟随、滚动驱动组件的 rAF 节流复用、静态组件确认无交互遗漏。

## 每组件执行卡（流程）

```
1. 读实现 + 跑体检表 6 维（T1-T6）            → 发现清单
2. 补测试到达基线（受控/键盘/边界，红→绿）     → 测试绿
3. 修复发现（组件 bug → 修组件；client 缺口 → 修 client + client 测试）
4. demo 交互实测（agent-browser：打开/键盘/关闭一条路径）
5. 勾 Wave 表状态 + commit（每 Wave 一提交）
```

## 诚实裁剪（不做）

- **不重写组件实现**——体检达标即过；重构只在发现具体 bug 时最小进行
- **视觉重设计**——design-system 系列已收官
- **新组件 / 新能力**——发现缺口登记 design/components-roadmap.md，不在本计划扩张
- **100% 测试覆盖**——基线制（交互 8/展示 3），不追求覆盖率数字

## 门禁（每 Wave）

全量 `npm test`（含 apps tsc）+ style-audit（Wave 0 后 33 条）+ build +
该 Wave 组件 demo 实测记录（追加 apps/components-demo/README.md 走查表）。

## 执行顺序

```
Wave 0 自动化防线 → Wave 1 高危 13 → Wave 2 弹层 → Wave 3 表单 → Wave 4 展示 → Wave 5 导航/杂项
```
