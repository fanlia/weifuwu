# weifuwu 组件驱动开发路线图（CDD）

> 战略：实现 **antd + Element Plus + shadcn-ui 三库并集 ≈ 92 个组件**（全量，含此前"裁剪"项），
> 组件命名按 weifuwu 独立体系重新规划。三重目标：
> ① **生态建设**——组件库成为完整 SaaS 地基，覆盖主流库全部能力面；
> ② **client 验证**——每个组件定向测试 `weifuwu/client` 一项能力，难度阶梯 = 能力验证清单；
> ③ **CDD 闭环**——写组件暴露 client 缺陷 → 修复（WFUI-OPTIMIZE 登记）→ client 增强 → 解锁更难组件。
> 这是组件驱动开发：**组件不是终点，是 client 的试金石与演进引擎**。

## 命名规划（weifuwu 独立体系）

原则：语义优先、不逐一对齐任何库；拆分/合并按 weifuwu 语义。

| 三库同名 | weifuwu 命名 | 原则 |
|---------|-------------|------|
| Upload / Upload | **FileUpload** | 语义明确（文件上传） |
| Statistic / Statistic | **StatCard** | 语义明确（统计卡片） |
| Spin / Loading | **Loading** | 短名优先 |
| Dialog / Modal | **Modal** | 短名优先 |
| InputOTP | **PinInput** | 能力命名（验证码输入） |
| InputNumber / InputNumber | **InputNumber** | 同名保留 |
| Typography 命名空间 | **Title / Text / Paragraph** | 拆开（无命名空间） |
| Sheet / Drawer | **Drawer**（四向） | 合并（sheet=bottom drawer） |
| NavigationMenu / Menu | **Menu** | 合并 |
| Collapse / Collapsible | **Collapse** | 合并（行内展开） |
| Combobox / AutoComplete | **Select**（searchable 增强） | 增强而非新组件 |

API 规范统一：弹层 `open/onClose`、数据 `value/onChange`、集合 `items/options`、通用 `size/variant/disabled/loading`。

## 全清单 × 难度阶梯（L1 → L6）

> 每级 = 一组 client 能力验证。✅ 已有 · 🆕 新实现 · ⬆️ 增强。

### L1 静态原语 — client：渲染 / props / children / 样式
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Title / Text / Paragraph | 🆕 | children、class 合并、copyable 剪贴板 |
| Label | 🆕 | htmlFor 关联、required 星号 |
| AspectRatio | 🆕 | CSS 变量、容器响应 |
| Divider / Space / Grid / Flex / ScrollArea / Sidebar | ✅ / wf | —（原语已覆盖） |

### L2 受控表单 — client：受控模式 / 事件 / 键盘
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Input / Textarea / Select / Checkbox / Radio / Switch / Slider / InputNumber / Segmented / TagsInput / Form / Field | ✅ | 受控 value/onChange、focus-visible |
| Select ⬆️ | ⬆️ | 键盘 ↑↓ + Enter（现仅 mousedown）、multiple 标签回显 |
| CheckboxGroup | 🆕 | 数组受控、toggle 状态 |
| Rate | 🆕 | 键盘方向键、受控整数 |
| PinInput | 🆕 | 焦点链（自动聚焦下一格）、粘贴分派、Backspace 回退 |
| ColorPicker | 🆕 | 弹层 + 预设色板 + 键盘 |
| Toggle / ToggleGroup | 🆕 | 单选/多选双模式、aria-pressed |

### L3 弹层浮层 — client：Portal / 定位 / 焦点管理 / Escape
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Modal / Drawer / Popover / Tooltip / Dropdown / Confirm / Toast | ✅ | createPortal、usePopupPosition、焦点 trap、Escape |
| HoverCard | 🆕 | hover 富内容（Tooltip 仅 string 的补全）、延迟显隐 |
| ContextMenu | 🆕 | 右键定位、右键键盘菜单 |
| Notification | 🆕 | 队列式多条、自动关闭计时 |
| BackTop / Affix | 🆕 | 滚动监听、sticky 定位、节流 |
| Mentions | 🆕 | 输入框内嵌弹层、composition 事件 |

### L4 复杂交互 — client：动画 / 拖拽 / 复杂状态机 / 树模型 / 键盘流
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Collapse | 🆕 | 行内展开状态机、异步 loading |
| Accordion ⬆️ | ⬆️ | 受控 active、方向键（现状：恒展开占位） |
| Tree | 🆕 | 递归树模型、展开/选中/勾选三态、异步加载 |
| Cascader | 🆕 | 级联数据模型 + 弹层 + 键盘流 |
| Transfer | 🆕 | 双列表状态、穿梭操作 |
| Carousel | 🆕 | 触摸滑动、自动播放计时、动画事件 |
| Calendar | 🆕 | 日期算法（复用 DatePicker 核心）+ 事件网格布局 |
| Command (Cmd+K) | 🆕 | 全屏 overlay、模糊搜索、键盘流 |
| Menubar | 🆕 | 水平菜单 + 键盘导航 |
| Resizable | 🆕 | 拖拽布局、edge case |
| Watermark | 🆕 | canvas 绘制、观察者检测 |

### L5 数据密集 — client：虚拟滚动 / 增量更新 / 大数据
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| Table ⬆️ | ⬆️ | 行选择、内置筛选、列宽拖拽、冻结列 |
| VirtualTable / VirtualList | 🆕 | **For 虚拟化 + item 级响应式（WFUI-OPTIMIZE Phase 5）** |
| InfiniteScroll（InView ⬆️） | ⬆️ | 交叉观察 + 追加渲染 |

### L6 算法挑战 — client：canvas / 编码 / 零依赖极限
| 组件 | 状态 | 验证的 client 能力 |
|------|:----:|------------------|
| QRCode | 🆕 | 自研 QR 编码 + Reed-Solomon 纠错（零依赖挑战） |
| ImagePreview（Img ⬆️） | ⬆️ | 图片缩放/旋转、canvas 导出 |
| Editor 深化 | ⬆️ | contentEditable 光标/IME/粘贴清洗（已有基础） |
| Chart 深化 | ⬆️ | canvas/SVG 渲染、动画 |

### AI / 特色（三库无，weifuwu 差异化，已完成）
AiChat · Markdown · CodeBlock · MessageBubble · ToolCallCard · ApprovalCard · Editor · ThemeSwitch · Highlight · CopyButton

## CDD 闭环机制（核心）

```
┌─────────────────────────────────────────────────────────┐
│ 实现组件（难度阶梯 L1→L6）                                │
│   ↓ 发现 client 缺陷                                      │
│ 登记 WFUI-OPTIMIZE.md（编号 + 组件来源 + 表象 + 根因）     │
│   ↓ TDD 修复 + 回归测试                                   │
│ client 能力增强 → 解锁下一级组件                           │
└─────────────────────────────────────────────────────────┘
```

- **登记纪律**：组件实现中发现 client 缺陷，必须记入 `WFUI-OPTIMIZE.md`（含来源组件）——防止"绕过问题"（在组件里 workaround）
- **回归纪律**：client 修复后，上一级全部组件测试必须重跑（阶梯回灌）
- **验证纪律**：每个新组件标注其验证的 client 能力点（上表右列），实现完核对

## client 预期优化点（按阶梯）

| 阶梯 | 预期 client 增强 | 关联 |
|------|----------------|------|
| L2 | 事件委托优化、受控组件模式规范化 | — |
| L3 | Portal 批量管理、定位边界（视口夹紧已有）、焦点归还链 | popup-clamp 已有基础 |
| L4 | 动画系统（animateOut 已有）、拖拽辅助、树模型辅助 | motion.ts 已有基础 |
| L5 | **For 虚拟滚动 + item 级响应式**（重头戏） | WFUI-OPTIMIZE Phase 5 |
| L6 | canvas 工具、二进制处理辅助 | — |

## 里程碑与验收

| 里程碑 | 内容 | 验收 |
|--------|------|------|
| M1 (L1-L2) | 4 🆕 + Select 增强 | 表单迁移面全绿；键盘/受控测试覆盖 |
| M2 (L3) | 7 🆕 + 弹层增强 | 弹层矩阵测试（定位/焦点/Escape）全绿 |
| M3 (L4) | 11 🆕（重难点） | 动画/拖拽/树模型测试全绿；client Phase 2/3 修复项关闭 |
| M4 (L5) | VirtualList + Table 增强 | **client Phase 5（For 虚拟化）落地** |
| M5 (L6) | QRCode/Watermark/ImagePreview | 零依赖算法验证 |
| 终验 | 三库并集 ~90 项全绿 | client 测试全绿 + 组件 61 → ~90 + README/demo 同步 |

每个里程碑：组件全绿 + client 测试全绿 + WFUI-OPTIMIZE 更新 + README 计数同步 + 浏览器实测。

## 与现有文档的关系

- `docs/components-migration.md`：三库覆盖矩阵 + 迁移指南（保留；"裁剪"列改为"实施中/已实现"状态）
- `docs/components-roadmap.md`：前四批证据驱动路线（保留；第五批并入本路线图阶梯）
- `WFUI-OPTIMIZE.md`：client 缺陷登记处（CDD 闭环的"问题单"）

## 诚实边界

- 全量实现 ≠ 全量完美：每个组件仍遵守零依赖、TDD、style-audit；L6 的 QRCode 是自研算法挑战，若 Reed-Solomon 成本失控，裁剪为"外部库接入示例"（在 CDD 闭环中登记决策）
- 命名独立：不承诺 antd/EP/shadcn 的 prop 逐一对齐，只保证"同场景有对应组件 + 迁移指南给映射"

## 第七批 client 启发（2026-08，6 组件暴露 5 个框架缺陷）

> 第七批（DiffView/Sparkline/Tour/Kanban/Pipeline/TreeSelect）是 CDD 闭环的
> 完整样本——组件编码暴露 client 缺陷 → 框架根治 → 全量验证。

| # | 组件暴露 | 缺陷根因 | client 修复 | 沉淀 |
|---|---------|---------|------------|------|
| 1 | DiffView | `$` 深度 Proxy 包装 Set → `Set.prototype.has` this 不兼容（TypeError） | **内置类型（Set/Map/Date）不可存 `$`**——闭包 let + render() 手动模式 | AGENTS.md「`$` Proxy 行为」 |
| 2 | Kanban | dragstart 里 render() → 渲染替换拖拽源元素 → HTML5 DnD 中断 | **拖拽进行中禁止重渲染**；高亮改 CSS :hover | AGENTS.md 拖拽纪律 |
| 3 | Kanban | `draggable: true` → `setAttribute('draggable','')` → enumerated 属性空串 = false → `el.draggable=false` → 拖动变文本选中 | **enumerated 属性显式 'true'/'false'**（render.ts/diff.ts 分支） | draggable.test.ts 防线 |
| 4 | Kanban | useDragDrop 只有 drop 侧（onDrop/onDragOver）——拖拽源侧手写 | **扩展 drag 侧**：`{ dropProps, dragProps }`（draggable + onDragStart/onDragEnd） | types/ui/ssr 三态 |
| 5 | TreeSelect | absolute 定位弹层在 overflow/transform 父容器裁剪/错位 | **弹层统一 portal**（createPortal + fixed + usePopupPosition） | AGENTS.md「弹窗 portal 纪律」 |
| 6 | TreeSelect | scroll 时序竞争：popup-tracker refresh 读到 0 rect → popup 覆盖为 0 → 弹层飞左上角 → 点击穿透关闭 | **0 rect 防护**：`r.width===0 && r.height===0` 跳过刷新（保留上一坐标） | popup-position.test.ts |
| 7 | TreeSelect | setProp 无 ref 分支 → `setAttribute('ref', String(fn))` DOM 污染 | **ref 特殊 prop 跳过**（renderValue 函数调用） | 调试方法论记录 |
| 8 | Tour | overlay onKeyDown 需焦点在内部 → Escape 不生效 | **全局 Escape 用 useGlobalKey**（不依赖焦点） | 浮层组件纪律 |
| 9 | Tree | 树形选择场景点行应展开而非选中 | **expandOnClick**（点击有子节点行 = 展开/折叠，叶子 = 选中） | Tree 能力扩展 |

### 对 client 的架构级启发（非单点修复）

1. **属性分类学**（render.ts setProp）：`boolean`（disabled）/`enumerated`（draggable/contenteditable）/`special`（ref/key/children）/`event`（on*）/`style`——每类语义不同，禁止统一 `setAttribute(key, '')` 兜底——**新属性加入前查 HTML 规范语义**
2. **响应式容器边界**：`$` 是"普通数据容器"——**内置类型实例（Set/Map/Date）不可入**（Proxy 破坏方法 this）——设计上应提供自动降级（存引用时跳过 Proxy 包装）或保持文档红线（现状）
3. **DnD 与渲染互斥**：HTML5 DnD 是浏览器原生手势——**拖拽生命周期内（dragstart→dragend）禁止任何 DOM 重渲染**——组件库需原语级保证（如 dragProps 内部标记 + render 保护）
4. **弹层=portal 单例**：所有浮层经 portal 收敛后，z-index 阶梯/Escape/夹紧/退场动画才能在 body 单一上下文统一管理（AGENTS.md 已立纪律）
5. **时序竞争防护模式**：全局监听（scroll/resize/popup-tracker）在元素替换瞬间读到 0/过期状态——**getter 读取前判 0 rect 是通用防线**（usePopupPosition 已修，其他全局监听同理）
6. **测试方法论闭环**：真实 HTML > textContent、debug 日志 hook、真实点击 vs eval click、0 rect 单测、审计自动化（style-audit 19 条）——AGENTS.md 已沉淀

### client 待办（启发未闭环项）

- `$` 内置类型自动降级（存 Set/Map/Date 时跳过 Proxy 包装——当前文档红线）
- usePopupPosition 0 rect 防护的 scroll 监听端（popup-tracker 侧同样防护）
- 拖拽中 render 保护（dragProps 标记 + _rendering 保护期扩展）
- enumerated 属性表（contenteditable/translate/spellcheck 等）——审计自动检查

## 第八批计划：三库并集缺口清零（2026-08，102 → 111）

> 三库（antd/EP/shadcn）评估结论：weifuwu 覆盖 antd ~88% / EP ~89% / shadcn 92%。
> batch-8 补齐全部真实缺口——目标：**三库并集 100% 覆盖**（含换名映射）。

### 缺口总表（三库并集视角）

| 缺口 | 来源 | 命名 | 优先级 | 验证的 client 能力 |
|------|------|------|:------:|------------------|
| Layout 外壳（Header/Sider/Content/Footer） | antd Layout / EP Container / shadcn Sidebar | **Layout**（LayoutHeader/LayoutSider/LayoutContent/LayoutFooter 子组件 + 声明式 props 双模式） | 🔴 | 布局状态机、Sider 折叠 + useBreakpoint 响应式、嵌套组合 |
| AutoComplete 输入联想 | antd / EP / shadcn Combobox | **AutoComplete** | 🔴 | 输入受控 + 弹层联想（复用 Select 键盘导航 + usePopupPosition）、键盘流、选中回填 |
| Popconfirm 气泡确认 | antd / EP | **Popconfirm**（Popover 基座 + 确认/取消 + 危险色） | 🔴 | 弹层复用 + 键盘 ESC/Enter、防误触纪律（默认危险操作） |
| FloatButton 悬浮按钮 | antd（特有） | **FloatButton**（group 模式 + badge + tooltip） | 🟡 | 固定定位 + 多按钮组展开状态机 |
| NavigationMenu 顶部导航 | shadcn（特有） | **NavMenu**（多级 hover 弹出 + 响应式折叠） | 🟡 | hover 定位弹层 + 键盘导航 + useBreakpoint |
| Link 文字链接 | EP（独立）/ antd（Typography.Link 内嵌） | **Link**（语义色/下划线/disabled/新窗口/图标） | 🟡 | 原语增强、disabled 语义 |
| Space 间距容器 | antd / EP | **Space**（size/direction/wrap/align/split 分隔） | 🟢 | 布局原语封装（gap 计算 + 分隔符） |
| Grid 栅格 + Flex | antd Row/Col/Flex / EP Row/Col | **Grid**（24 栅格 + gutter + **flex 容器模式**——单行弹性布局等价 antd Flex） | 🟢 | 布局计算（百分比宽度 + gutter 减法 + flex） |
| Scrollbar 自定义滚动条 | EP | **Scrollbar**（webkit 滚动条样式 + 视口组件） | 🟢 | 滚动容器封装（VirtualList 机制复用） |
| Statistic 倒计时 | antd Statistic.Countdown / EP | **StatCard ⬆️**（countdown 模式） | 🟢 | 定时器驱动 + 格式化（时分秒） |
| AlertGroup 通知合并 | EP 2.8（新增） | **AlertGroup**（同类通知合并折叠） | 🟢 | 分组状态机 |

### 覆盖闭环声明（batch-8 完成后）

**三库全部业务组件 100% 有对应**——仅两类不属组件缺口：

| 类 | 三库组件 | weifuwu 等价（框架内置，无需组件） |
|----|---------|----------------------------------|
| 全局配置 | antd App / ConfigProvider、EP ElConfigProvider | `createApp` + `--wf-*` CSS token + ctx 注入 |
| 框架机制 | EP Teleport / Overlay | `createPortal` + `ctx.ui.ssr`（渲染器内置） |

> 严格核对表：三库 208 项（antd 84 / EP 74 / shadcn 50）→ batch-8 后
> 业务组件全覆盖；Flex 由 Grid 的 flex 容器模式覆盖（同一布局场景）。

### 批次节奏

| 阶段 | 内容 | 验收 |
|------|------|------|
| B8-1 | Layout + Popconfirm（🔴×2——布局与确认，产品级刚需） | 结构渲染 + Sider 折叠 + 确认流测试；SSR smoke |
| B8-2 | AutoComplete + Link（输入联想 + 基础） | 联想过滤 + 键盘流 + 选中回填测试 |
| B8-3 | FloatButton + NavMenu（悬浮 + 导航） | 展开状态机 + hover/键盘测试 |
| B8-4 | Space + Grid + Scrollbar + StatCard ⬆️ + AlertGroup（原语组，低成本） | 布局计算测试 + 定时器测试 |
| B8-5 | 发布 v0.68.0 + 三库对照表更新（README/components-map） | 111 组件 + 三库并集 100% 覆盖声明 |

### 命名决策（独立体系延续）

| 候选 | weifuwu 命名 | 原则 |
|------|-------------|------|
| Layout.Header / EP Container / shadcn Sidebar | **Layout**（复合子组件 LayoutHeader/LayoutSider/… + 简式 props 双模式） | 一个组件统吃三库心智 |
| NavigationMenu | **NavMenu**（短名，区别于 Menu 侧栏） | 短名优先 + 语义区分 |
| antd FloatButton | **FloatButton** | 同名保留（语义精确） |
| Row/Col | **Grid**（单一容器 + cols/rows 声明） | 独立体系：声明式而非嵌套 |

### 诚实裁剪（CS-05 登记）

- **Layout**：不做 Sider 拖拽调整宽度（Resizable 可组合）；不做 SSR 骨架布局（静态容器——SSR 天然支持）
- **AutoComplete**：不做分组/虚拟化候选（Select 已有 searchable 分组；候选列表量级小）；自定义渲染用 `renderOption` 透传
- **Popconfirm**：不做气泡内表单/自定义箭头；定位复用 Popover 全套（portal + usePopupPosition + Escape）
- **NavMenu**：不做 hover 延迟微调/子菜单动画曲线定制；折叠态交还 useBreakpoint 由用户驱动
- **Space/Grid/Scrollbar**：均为"原语封装"级——不引入新布局引擎；Grid 只做 24 栅格百分比 + gutter
- **AlertGroup**：合并阈值 3 条起（少于此退化为普通 Alert 列表）

### client 预期联动（每组件验证点）

- Layout → `useBreakpoint`（Sider 响应式折叠——已有）验证断点驱动
- AutoComplete → 受控 Input + Select 弹层复用（下拉状态机提炼为共享 hook 候选）
- Popconfirm → Popover 基座复用（验证弹层体系可组合性——**弹层组件的组合才是真复用**）
- StatCard countdown → 定时器驱动渲染（`$.` 自动 + clear 纪律）
