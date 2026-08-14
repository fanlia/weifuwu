# weifuwu/components 全量质量审计计划（组件分组 · 无新功能）

> **状态**：📋 计划——待实施
> **目标**：**不增加任何新功能**，把 115 个组件全部检查过滤一遍。
> **质量模型**：每个组件从 **功能 / 交互 / 视觉** 三个维度检查——每维都有明确的
> 测试手段（可测）与防回归机制（可控），三者并重，缺一不可。

---

## 1. 三维质量模型（可测 · 可控）

```
┌────────────────────────────────────────────────────────────────────┐
│                        组件质量 = 三维全覆盖                          │
│                                                                      │
│  功能 Functional          交互 Interaction            视觉 Visual      │
│  行为是否正确              用户怎么操作、系统怎么响应    长什么样、怎么变   │
│  · props 契约/默认值        · 状态链 hover/focus/active  · 结构/层级      │
│  · 数据流 受控/回调         · 键盘/焦点/Tab 顺序        · token/暗色      │
│  · 边界 空/极值/非法        · 浮层 开合/夹紧/归还       · 动效 时长/缓动   │
│  · 状态流转                 · 拖拽/手势/残留            · 响应式/密度     │
│                                                                      │
│  可测：jsdom 单测          可测：jsdom 事件 +           可测：style-audit  │
│        (vnode/DOM 断言)          agent-browser 真实交互     静态规则 +      │
│  可控：功能点清单全覆盖           (CDP 点击/键盘/拖拽)      agent-browser    │
│        回归测试必带        可控：交互清单逐项勾选           computed style   │
│                             交互回归测试                可控：audit 规则沉淀 │
└────────────────────────────────────────────────────────────────────┘
```

**每维度的测试手段（可测）**：

| 维度 | 测试层 | 断言对象 | 工具 |
|------|--------|---------|------|
| **功能** | 单测（jsdom） | vnode 结构/props、DOM 值、回调参数、状态流转 | `renderVNode`/`mountComponent`（ui-dom/testing） |
| **交互** | 单测 + 浏览器 | 事件触发结果、焦点位置、浮层开合、拖拽值 | jsdom `dispatchEvent` + agent-browser 真实 CDP（click/keyboard/drag） |
| **视觉** | 静态审计 + 浏览器 | CSS 规则、computed style、rect、暗色映射、对比度 | style-audit（50 条规则）+ agent-browser `getComputedStyle`/`getBoundingClientRect`/outerHTML |

**每维度的防回归机制（可控）**：

| 维度 | 防回归机制 |
|------|-----------|
| 功能 | 功能点清单 → 每点 ≥1 单测；修复缺陷必带回归测试（红→绿）；测试数基线（交互 ≥8/全体 ≥3） |
| 交互 | 交互清单逐项勾选记录；关键交互（Escape/焦点归还/拖拽复位）有单测断言；agent-browser 实测记录可追溯 |
| 视觉 | style-audit 静态规则（token 化/暗色/状态链/浮层纪律——新发现的问题沉淀为规则）；浏览器 computed style 断言；对比度测试 |

## 2. 组件功能测试矩阵（每组件一张——三维列）

功能点从 **props API + 行为语义 + 边界** 推导；每点按三维检查：

```
组件：Modal
┌─────────┬──────────────────────┬──────────────────────────┬────────────────────────┐
│ 功能点   │ 功能（单测）          │ 交互（jsdom+浏览器）       │ 视觉（audit+浏览器样式）  │
├─────────┼──────────────────────┼──────────────────────────┼────────────────────────┤
│ F1 open │ 受控 open 渲染/卸载    │ 真实点击开；Escape 关      │ 遮罩 --wf-overlay        │
│ F2 mask │ maskClosable 默认关   │ 点遮罩不关/true 时关       │ mask 全屏 fixed          │
│ F3 焦点  │ trap 循环断言         │ Tab 循环；关闭后焦点回按钮  │ focus-ring 可见          │
│ F4 退场  │ exit 类挂载           │ animationend 后卸载       │ --enter/--exit 成对      │
│ ...     │                      │                          │                        │
└─────────┴──────────────────────┴──────────────────────────┴────────────────────────┘
```

**功能点推导三来源**（每组件实施第一步）：
1. `组件.ts` 的 props 接口 + 默认值 → 每个 prop 一个功能点（作用/变体/缺省）
2. demo 描述 + 实现 → 行为功能点（交互流程、状态流转、回调、数据流）
3. 边界 → 功能点（空/极值/非法输入/禁用/重复触发/长内容）

## 3. 三维 × 横切维度映射

功能点逐点检查之上，通用横切清单（事故沉淀）归入三维——确保不遗漏系统性质量问题：

| 横切项 | 归属维度 | 事故来源 |
|--------|---------|---------|
| 受控值回流（更新 → DOM 同步） | 功能 | Slider range 夹紧 |
| 回调对称（受控必配回调 + warn） | 功能 | §5.2 六个同款 bug |
| 数据边界（空/极值/千行） | 功能 | 空态事故 |
| 状态链（hover/focus-visible/active/disabled/selected） | 交互 | Material 状态层 |
| 浮层纪律（portal/夹紧/Escape/归还/退场成对） | 交互 | §5.4 + Chart tooltip |
| 拖拽/手势残留（pointer 对称） | 交互 | Slider pointerup 残留 |
| 键盘可达（方向键/Home/End/Enter） | 交互 | P12-R43 |
| 暗色与 token（无裸色/可解析/对比度） | 视觉 | audit + 假 token |
| 动效 token（时长/缓动/位移无硬编码） | 视觉 | audit |
| 响应式与密度（断点/compact/触屏 44px） | 视觉 | compact 预设 |

## 4. 组件分组（9 组 · 115 组件）

| 组 | 组件 | 功能重点（从各自 props 推导） |
|----|------|------------------------------|
| 1 表单核心（5） | Button/Input/Textarea/Select/Select(searchable) | Button：variant×size×loading×block×disabled；Input：type×error×hint×required×受控；Select：options×disabled×受控 |
| 2 表单选择（5） | Checkbox/Switch/RadioGroup/SegmentedControl/Slider | 受控 checked/value、键盘、禁用 |
| 3 表单增强（11） | Form/Field/FileUpload/SearchInput/ProgressBar/InputNumber/PasswordInput/TagsInput 等 | Form 校验×onSubmit×onError；FileUpload 多选/拖拽；InputNumber min/max/step/精度 |
| 4 数据展示（47） | Table/VirtualTable/Card/Badge/Tag/Avatar/Img/InView/Timeline/Descriptions/Markdown/CodeBlock/LogViewer/JSONViewer/DiffView/Sparkline/Tour/Kanban/Pipeline/TreeSelect/Layout/Popconfirm/AutoComplete/Link/FloatButton/NavMenu/Space/Grid/Scrollbar/AlertGroup/StatCard/MessageBubble/Highlight/List/Result/Confirm/Chart/Editor/ThemeSwitch | 各自 props 全量：Table 排序/选择/空态；Img fallback/lazy/preview；CodeBlock 复制；Tour 步骤/定位 |
| 5 数据反馈（10） | DatePicker/Modal/Drawer/Popover/Tooltip/Toast/Alert/Loading/Skeleton/EmptyState | DatePicker value 受控×范围×禁选；Modal open×mask×trap×退场；Toast 命令式×类型×时长 |
| 6 导航组件（7） | Breadcrumb/Menu/Tabs/Dropdown/Pagination/Steps/Accordion | active/current 受控、键盘方向键、onChange 对称 |
| 7 AI 对话（9） | AiChat/ChatInput/AuthPage/ToolCallCard/ReasoningBlock/CitationCard/SessionList/ApprovalCard | 流式追加、工具状态机、审批、会话切换 |
| 8 其他+新增批次（36） | PageHeader/Icon/Divider/Rate/Typography/Label/AspectRatio/Toggle/ToggleGroup/CheckboxGroup/PinInput/CopyButton/ColorPicker/HoverCard/Notification/BackTop/Affix/Anchor/ContextMenu/Mentions/Collapse/Tree/Cascader/Transfer/Command/Menubar/Carousel/Resizable/Calendar/Watermark/VirtualList/InfiniteScroll/QRCode | 各自 props 全量：Tree 展开/勾选；Transfer 穿梭；Calendar 受控/事件；VirtualList 窗口滚动 |

## 5. 实施流程（组为单位滚动）

```
组内循环（9 组，优先级：5→1/2→4→6→3→7→8）：
  ① 功能契约梳理：读 组件.ts + demo → 功能点清单（三维矩阵表头）
  ② 功能列：逐功能点单测（红→绿；补缺不重写；ui-dom/testing 原语）
  ③ 交互列：jsdom 事件断言补强 → agent-browser 真实 CDP 逐点验证
     （点击/键盘/拖拽/焦点——reload 清状态起步，§A 纪律）
  ④ 视觉列：style-audit 静态对照 → agent-browser computed style/rect/
     暗色/对比度抽查 → 缺失沉淀为 audit 新规则
  ⑤ 缺陷修复：最小改动 + 三维对应回归测试（不新增功能）
  ⑥ 组回归：该组单测 + style-audit
组间：全量测试（≤15s）+ 构建
```

## 6. 验收标准（三维分别验收）

| 维度 | 可测验收 | 可控验收 |
|------|---------|---------|
| **功能** | 每组件功能点清单 100% 有单测覆盖 | 修复缺陷全部带回归测试；测试数基线（交互 ≥8/全体 ≥3） |
| **交互** | 每功能点交互列 agent-browser 实测勾选（真实 CDP） | 关键交互（Escape/焦点归还/拖拽复位/方向键）单测断言；实测记录可追溯 |
| **视觉** | 每组件视觉列抽查记录（computed style/rect/暗色） | style-audit 全绿 + 新发现沉淀规则；对比度测试覆盖 |

**总验收**：115/115 组件三维矩阵完成；只修正确性缺陷（无新功能）；全量测试 ≤15s；发布前全绿。

## 7. 实施记录（滚动勾选）

### 组 5 数据反馈（2026-12 首轮）

| 组件 | 功能列（单测） | 交互列（agent-browser 实测） | 视觉列 | 结果 |
|------|--------------|----------------------------|--------|------|
| Modal | 18 测试（+8：maskClosable=false/无 title/footer 缺省/内容防传播/关闭按钮/aria/Escape exit 门控） | 真实点击开、遮罩点击关、内容点击不关、Escape 关、Tab trap 循环、关闭后焦点归还触发按钮 | portal/bg-elevated 暗色抬升/居中/遮罩全屏/滚动锁 | ✅ 无缺陷 |
| Drawer | 13 测试（+5：遮罩关闭/面板防传播/关闭按钮+aria/aria 三件套/width 变量） | 真实点击开、右缘贴边、Escape 关 | portal/暗色抬升/360px | ✅ 无缺陷 |
| Tooltip | 8（既有） | 真实 hover 显示/移开隐藏、触发按钮上方居中 | portal | ✅ 无缺陷 |
| Popover | 11（既有） | hover 触发、click 触发、Escape 关 | portal/视口内 | ✅ 无缺陷 |
| Toast | 9（既有） | 命令式触发、top-right 位置、视口内 | portal | ✅ 无缺陷 |
| DatePicker | 9（既有） | 打开下拉、选今天→值回流（2026-08-14）→关闭 | portal/bg-elevated/网格 42 格 | ✅ 无缺陷 |
| Alert/Loading/Skeleton/EmptyState | 8/6/7/5（既有） | 渲染抽查（Alert×4/Skeleton×21/EmptyState） | — | ✅ 静态组件达标 |

### 标杆（组 2/组 4）

- Slider（组 2）：6 缺陷全修——受控值夹紧/渐变偏移/UA padding/拖拽残留/气泡定位/对齐（本会话早前提交）
- Chart（组 4）：tooltip portal+夹紧+命中区+色值 token（本会话早前提交）
- ThemeSwitch（组 4）：preset 扩展+持久化（本会话早前提交）

### 待滚动组

组 8 长尾（36）

### 组 7 AI 对话（2026-12）

| 组件 | 功能列（单测） | 交互列（agent-browser 实测） | 结果 |
|------|--------------|----------------------------|------|
| AuthPage | 7（+3：title/subtitle/logo/footer 自定义/children 插槽/无 onSubmit 边界） | — | ✅ |
| ToolCallCard | 9（+2：pending 初始态/工具名+参数渲染——call 对象契约） | — | ✅ |
| AiChat 14 / SessionList 10 / ApprovalCard 15 / ChatInput 9 / JsonSchemaForm 8 / ReasoningBlock 8 / CitationCard 8 | 既有覆盖 | AiChat 真实输入+发送→流式回复（wire-fake：你刚才说：你好） | ✅ |

### 组 3 表单增强（2026-12）

| 组件 | 功能列（单测） | 交互列（agent-browser 实测） | 结果 |
|------|--------------|----------------------------|------|
| Field | 10（+5：error 隐藏 hint/--err 类/无 label 精简/required 星号/label 元素） | — | ✅ |
| Form 19 / FileUpload 12 / SearchInput 10 / PasswordInput 10 / InputNumber 9 / TagsInput 9 / ProgressBar 7 | 既有覆盖 | Form 空提交 4 错误→逐字段精准→补全提交成功；InputNumber 步进 0.7→0.6；TagsInput 真实输入+Enter 添加标签 | ✅ |

### 组 6 导航组件（2026-12）

| 组件 | 功能列（单测） | 交互列（agent-browser 实测） | 结果 |
|------|--------------|----------------------------|------|
| Breadcrumb | 9（+5：aria-current/分隔符 aria-hidden/无 href 文本项/nav aria-label/单项） | — | ✅ |
| Steps | 8（+4：current 索引/aria-current=step/description/空 items） | — | ✅ |
| Menu 12 / Tabs 8 / Dropdown 11 / Pagination 8 / Accordion 10 | 既有达标 | Tabs 切换（详情→设置）/Pagination 跳页（3→4）/Accordion 展开 | ✅ |

### 组 4 数据展示首轮（2026-12）

**0 测试展示组件补全（8 个 +33 测试）**：Grid(4)/Space(4)/Link(4)/Sparkline(5)/DiffView(4)/Layout(4)/Scrollbar(4)/Pipeline(4)

**agent-browser 实测**：Table 排序（首行 2→1）、TreeSelect 展开→选叶子→值回流（RPC 服务）→关闭、Confirm 确认框→删除→关闭

**测试统计修正**：早期扫描误报（文件用 test() 跨行格式）——AutoComplete/Popconfirm/TreeSelect/FloatButton 实际各 8 测试，覆盖良好；Kanban 7/Tour 12/NavMenu 11/AlertGroup 9

### 组 2 表单选择（2026-12）

| 组件 | 功能列（单测） | 交互列（agent-browser 实测） | 结果 |
|------|--------------|----------------------------|------|
| Checkbox | 10（+2：非受控原生切换+onChange 值/受控缺回调不报错） | 真实点击勾选切换 | ✅ |
| Switch | 8（既有） | 真实点击切换（true→false） | ✅ |
| RadioGroup | 9（+1：name 透传） | 真实点击第二项选中 | ✅ |
| SegmentedControl | 9（+1：ariaLabel 透传） | 真实点击 aria-pressed=true | ✅ |
| Slider | 14（标杆——6 缺陷已修） | 拖拽/键盘/对齐/气泡全链路（早前实测） | ✅ |

### 组 1 表单核心（2026-12）

| 组件 | 功能列（单测） | 交互列（agent-browser 实测） | 视觉列 | 结果 |
|------|--------------|----------------------------|--------|------|
| Button | 15（+4：onClick/loading 禁用+aria-busy/disabled/danger-ghost） | 既有 | — | ✅ |
| Input | 13（+4：受控 value 含空串/onInput/disabled+readonly+placeholder/error 样式类） | 真实键盘输入→受控回流（11 字符） | — | ✅ |
| Textarea | 11（+3：受控 value+onInput/disabled+placeholder+required/无 showCount 不渲染） | 真实输入→受控回流 | — | ✅ |
| Select | 13（+2：multiple 多选标签回显/disabled 透传） | searchable 打开→选张三→菜单关→值回流（已选: 张三） | — | ✅ |
