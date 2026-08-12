# weifuwu/components — 裁剪集中登记（单一事实源）

> **用途**：所有「诚实裁剪（CS-05）」项的集中登记——组件/能力/理由/替代方案。
> 组件 TS 注释中的「裁剪/不做」声明引用本文件（防措辞漂移）。
> 三库（antd 84 / EP 74 / shadcn 50）对照：weifuwu 业务组件 **100% 有对应**，
> 剩余全部为本表登记的裁剪项（能力级），另有少量组件级裁剪（组件不存在）。

## 一、组件级裁剪（weifuwu 不提供独立组件）

| 三库组件 | weifuwu 等价/替代 | 理由 |
|---------|-----------------|------|
| antd App / ConfigProvider、EP ElConfigProvider | `createApp` + `--wf-*` CSS token + ctx 注入（框架级） | 全局配置由框架中间件承载，非组件 |
| EP Teleport / Overlay | `createPortal` + `ctx.ui.ssr`（渲染器内置） | 框架机制，非组件 |
| antd Statistic.Countdown | StatCard `countdown` 模式（已并入） | 换名合并 |
| PageForm（表单页骨架） | PageHeader + Card + Field + Alert + wf-* 原语组合 | 骨架重复度低（~20 行/页 × 4 页）；字段差异大无收敛语义；PageHeader 已覆盖页头——能用原语+组件组合就不加包装（2026-12 评估，design/components-gap-plan.md W3） |

## 二、能力级裁剪（组件存在，能力不做）

### 表单族

| 组件 | 裁剪能力 | 理由/替代 |
|------|---------|----------|
| JsonSchemaForm | `$ref` / 组合 schema（allOf/oneOf/anyOf）/ format 语义 / 递归数组 / 数组对象 items / 自定义渲染插槽 | 复杂度边界（零依赖）；不支持项 console.warn + 降级文本输入 |
| JsonSchemaForm | `value` 严格受控回流 | 非受控语义（value 仅初始值）+ onChange 通知——规避受控回流焦点问题（§5.3） |
| Select | optgroup 分组搜索过滤、分组禁选 | 搜索时组内过滤已做；分组禁选低频 |
| Select | 虚拟化选项列表 | 零依赖成本高，候选量级小 |
| Cascader | 多选（multiple） | 低频；单选 + 搜索已够 |
| Cascader | hover 展开、任意层级配置、异步加载 | 点击展开 + 搜索已够；异步数据源可组合 |
| ColorPicker | 吸管/自由取色/透明度 | 预设色板 + hex 输入覆盖 90% 场景 |
| Mentions | 多 prefix/自定义高亮渲染/远程搜索 | options 静态传入；远程搜索可组合 |
| InputNumber | 千分位货币格式 | 业务自拼 |
| PinInput | 「发送验证码」倒计时、邮箱/短信发送 | 业务自配；框架 email 中间件可组合 |
| TimePicker（独立组件） | — | DatePicker `mode="time"` 四合一覆盖 |
| CheckboxGroup | 全选/反选、搜索过滤 | 低频 |
| Rate | 半星、任意值、hover 预览 | 无证据；ICon star 可组合 |
| TagsInput | 下拉建议 | Select searchable 可组合 |
| Mentions | 无（已实现） | — |

### 数据展示族

| 组件 | 裁剪能力 | 理由/替代 |
|------|---------|----------|
| Table | 树形数据（treeData）、可编辑单元格、单元格合并、列虚拟化 | Tree 可组合；行选择/筛选/列宽已实现 |
| VirtualTable | 横向虚拟滚动、行编辑、单元格合并、树形表格 | 列虚拟化成本高 |
| Markdown | GFM 表格/任务列表/删除线/脚注/raw HTML/语法高亮 | 表格+任务列表已实现；raw HTML 安全红线（VNode 天然转义）；语法高亮引入依赖破零依赖 |
| CodeBlock | 语法高亮 | 依赖；语言标签仅展示 |
| JSONViewer | JSON 编辑、超大对象流式渲染 | 只读定位（编辑用 Editor）；懒展开覆盖 100 键级 |
| LogViewer | 正则高亮、多日志源合并、搜索定位 | 性能与复杂度；Filter 可组合 |
| DiffView | 词级 diff、语法高亮、忽略空白、merge 编辑 | 行级 LCS 已够 AI 代码展示 |
| Sparkline | 多序列、tooltip、实时流式 | 迷你趋势线定位 |
| ImagePreview | 缩放/旋转/画廊切换、缩略图列表 | 点击放大已实现；画廊低频 |
| AvatarGroup | hover 展开、tooltip | Tooltip 可组合 |
| Chart | 交互式图表（缩放/联动） | 自研 line/bar/pie 展示定位 |

### 弹层/反馈族

| 组件 | 裁剪能力 | 理由/替代 |
|------|---------|----------|
| Popconfirm | 气泡内表单、自定义箭头 | Popover 基座 + 定位全套复用 |
| NavMenu | hover 延迟微调、子菜单动画曲线定制 | 折叠态交还 useBreakpoint 由用户驱动 |
| Tooltip/HoverCard | 富内容自动判定 | HoverCard 已补富内容 |
| Menu | 水平菜单栏、子菜单自动互斥 | Menubar 已有；互斥由父层 controlled |
| Menu | 折叠态 icon-only 标题不弹浮层（无 label 无展开交互） | 有 label 的折叠态子菜单浮层已实现（usePopup 基座）；icon-only 无展开语义 |
| Menubar | hover 展开、子菜单、可拖拽菜单 | 点击展开 + 水平菜单已实现；可拖拽低频 |
| Result | 内置路由跳转 | 页面自身处理路由（框架 ctx.app.navigate 可组合） |
| Calendar | 周/日视图、拖拽创建事件、事件详情弹层 | 月视图 + 选择/范围已够；事件展示可组合 |
| Tour | 步骤动画、多目标高亮、完整键盘流 | 基础 Escape/箭头已做 |
| Kanban | 列增删/编辑、泳道、跨看板、虚拟滚动 | 拖拽模型核心已做 |
| Pipeline | 手动拖拽布局、缩放平移、嵌套子图、循环图 | Kahn 拓扑分层已做；环检测报错 |
| Carousel | 垂直模式、多图联动、淡入淡出 | 水平 + 触摸滑动已够；fade 可 CSS 配 |
| Scrollbar | 拖动 thumb | webkit 样式已够 |
| Transfer | 拖拽排序、自定义渲染 | 双列表 + 搜索已实现；拖拽低频 |
| FileUpload | 真实上传进度（xhr/fetch）、分片、拖拽排序、目录上传 | 进度由父层驱动（组件不做 xhr） |
| Command | 无（已实现） | — |

### AI 族

| 组件 | 裁剪能力 | 理由/替代 |
|------|---------|----------|
| AiChat | reasoning 流式（逐字） | 协议 v1 既定：`wf:done` 一次性下发（`WfDone.reasoning`），不进 `wf:token` |
| ReasoningBlock | 流式逐字、token 耗时统计、复制按钮 | 折叠展示定位 |
| MessageBubble | 打字动画、markdown 内嵌 | Loading 已有；Markdown 组件组合 |
| ToolCallCard | 参数编辑 | JsonSchemaForm 是输入对偶（组合） |

### 导航/布局族

| 组件 | 裁剪能力 | 理由/替代 |
|------|---------|----------|
| Anchor | 嵌套滚动容器、滚动容器非视口、自动生成标题锚点 | 视口滚动已实现；标题锚点业务自配 |
| Affix | 无（已实现） | — |
| Layout | Sider 拖拽调整宽度、SSR 骨架布局 | Resizable 可组合；静态容器 SSR 天然支持 |
| Space/Grid/Scrollbar | 新布局引擎 | 原语封装级（24 栅格百分比 + gutter + flex 容器模式） |
| Accordion | 动画高度 | 卡片面板语义；CSS 过渡即可 |
| Collapse | 互斥模式、高度动画 | 行内展开定位 |
| Timeline | 折叠展开节点 | 横向已实现（mode="horizontal"）；折叠低频 |
| Scrollbar | 拖动 thumb | webkit 样式已够 |

## 三、登记纪律

- **新增裁剪项**：先在本文件登记（理由 + 替代），再改组件 TS 注释引用
- **撤销裁剪**：实现后从本表移除，并更新组件 TS 注释
- **组件 TS 注释格式**：`裁剪（CS-05，见 design/components-cuts.md）：<能力>`
- 排查口径漂移：`grep -rn "裁剪\|不做" src/components/*/*.ts` 与本文对照

## 四、暂缓复查记录（未决 → 已决）

| 项 | 判定 | 理由 |
|----|------|------|
| Transfer 穿梭框 | ✅ 已实现 | 双列表 + 搜索 + 移动端堆叠 |
| Cascader / TreeSelect | ✅ 已实现 | 级联面板 / 树形选择 |
| Mentions @提及 | ✅ 已实现 | composition 已处理 |
| ContextMenu / Menubar | ✅ 已实现 | 右键 + 触屏长按双通道 / 水平菜单 |
| Command (Cmd+K) | ✅ 已实现 | 全屏面板 + 键盘流 |
| Resizable 分割面板 | ✅ 已实现 | 指针 + 方向键 |
| Tree 树形 | ✅ 已实现 | 展开/选中/勾选三态 + 搜索 + expandOnClick |
| Carousel 轮播 | ✅ 已实现 | 触摸滑动 + 自动播放 |
| ColorPicker | ✅ 已实现 | 预设色板 + hex |
| Rate 评分 | ✅ 已实现 | 键盘方向键 |
| PinInput/OTP | ✅ 已实现 | 粘贴分派/回退/自动聚焦 |
| QRCode / Watermark | ✅ 已实现 | 自研 Reed-Solomon / canvas |
| Anchor / Affix | ✅ 已实现 | 滚动高亮 / sticky |
| TreeSelect 搜索过滤 | ❌ 永久裁剪 | 选项量小；搜索成本高 |
