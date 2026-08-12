# weifuwu/components 组件速查（对应 antd / Element Plus / shadcn-ui）

> **开发者迁移速查**：从 antd / Element Plus / shadcn-ui 迁到 weifuwu，按功能找到对应组件。
> 左侧是 **weifuwu 组件**（已提供），右侧是对应的三库组件 + 差异备注。
> 真实未实现清单（仅 4 项）：见文末「weifuwu 尚未实现」。

## 通用基础

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 按钮 | `<Button variant size loading block>` | Button | Button | Button | 命名基本一致；weifuwu `variant`=primary/secondary/ghost/danger |
| 图标 | `<Icon name>`（自研 30+ stroke SVG） | Icon | Icon | lucide-react | weifuwu 零依赖、currentColor、1em 随字号；组件内部统一走 Icon |
| 文本排版 | `<Title/Text/Paragraph>` | Typography | Typography | — | 语义标签 + 语义色 `-text` 变体 + mark/code/删除线 |
| 分割线 | `<Divider>`（horizontal/vertical/带文字） | Divider | Divider | Separator | 等价 |
| 头像 | `<Avatar name src color size>` | Avatar | Avatar | Avatar | weifuwu 支持名字哈希色 + 指定色 |
| 头像组 | `<AvatarGroup items max size>` | Avatar.Group | 手动组合 | 手动组合 | weifuwu 独立组件，`max` 溢出显示 +N |
| 标签/标签组 | `<Label>`（required 星号）/ `<TagsInput>`（回车/逗号/去重） | Form.Item 标签 / Select tags | — | Label | Label 独立组件 |

## 导航

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 菜单/侧栏 | `<Menu items group activeKey onSelect>`（方向键导航） | Menu | Menu | NavigationMenu / Sidebar | 分组 group 已支持；**子菜单/折叠未实现** |
| 面包屑 | `<Breadcrumb items>` | Breadcrumb | Breadcrumb | Breadcrumb | 等价 |
| 标签页 | `<Tabs items active onChange>`（方向键 + 移动端横向滚动） | Tabs | Tabs | Tabs | 等价 |
| 分页 | `<Pagination total page onChange>`（页码折叠 + 移动端 44px） | Pagination | Pagination | Pagination | 等价 |
| 步骤条 | `<Steps items current>` | Steps | Steps | — | 等价 |
| 下拉菜单 | `<Dropdown items>`（danger variant） | Dropdown | Dropdown | DropdownMenu | 等价（usePopup：外部点击/Escape 关闭） |
| 水平菜单栏 | `<Menubar menus>`（←→↓ 键盘 + 触屏） | Menu 水平 | Menu | Menubar | 等价 |
| 页面标题 | `<PageHeader title sub>` | PageHeader（v5 移除） | PageHeader | — | weifuwu 保留独立组件 |
| 回到顶部 | `<BackTop threshold>` | FloatButton / BackTop | Backtop | — | 滚动超阈值显示 |
| 固定定位 | `<Affix offsetTop>` | Affix | Affix | — | useScrollPosition 实现 |
| 锚点 | 未实现 | Anchor | Anchor | — | 待补 |

## 表单

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 输入框 | `<Input label error hint variant>` | Input | Input | Input | weifuwu 自带 label/error/hint 包装（antd 需 Form.Item）；`variant="borderless"` 内联编辑 |
| 文本域 | `<Textarea rows showCount maxLength>` | Input.TextArea | Input textarea | Textarea | weifuwu 独立组件 + 字数统计 |
| 选择器 | `<Select options searchable multiple>` | Select | Select | Select / Combobox | **searchable + 键盘 ↑↓ + multiple + optgroup 分组已实现**（近 Combobox） |
| 复选框 | `<Checkbox checked label>` | Checkbox | Checkbox | Checkbox | 等价 |
| 复选组 | `<CheckboxGroup options value>` | Checkbox.Group | Checkbox 组 | — | 数组受控 + 栅格列数 |
| 单选 | `<RadioGroup options value>` | Radio.Group | Radio | RadioGroup | 等价 |
| 开关 | `<Switch checked>` | Switch | Switch | Switch | 等价 |
| 滑块 | `<Slider min max step>` | Slider | Slider | Slider | 等价 |
| 数字输入 | `<InputNumber min max step precision>`（增减按钮+clamp） | InputNumber | InputNumber | — | 等价 |
| 密码输入 | `<PasswordInput>`（眼睛切换） | Input.Password | Input show-password | — | weifuwu 独立组件 |
| 日期选择 | `<DatePicker mode="date\|datetime\|time\|range">`（四合一） | DatePicker / TimePicker / RangePicker | DatePicker / DateTimePicker / TimePicker | Calendar + DatePicker 组合 | **一个组件覆盖三库四个**；移动端 range 自动堆叠 |
| 评分 | `<Rate value>`（键盘方向键） | Rate | Rate | — | allowClear/readOnly |
| 验证码 | `<PinInput length>`（粘贴/回退/自动聚焦） | — | — | InputOTP | 等价 |
| 颜色选择 | `<ColorPicker value>`（预设色板 + hex） | ColorPicker | ColorPicker | — | Popover 弹层 |
| 标签输入 | `<TagsInput value onChange>`（回车/逗号/去重） | Select mode="tags" | 手动组合 | — | weifuwu 独立组件 |
| 搜索框 | `<SearchInput>` | Input.Search | Input search | — | weifuwu 独立组件 |
| 分段控件 | `<SegmentedControl options value>` | Segmented | — | ToggleGroup 近似 | weifuwu 独立组件 |
| 切换按钮 | `<Toggle>/<ToggleGroup>`（single/multiple） | — | — | ToggleGroup | shadcn 对齐 |
| 表单 | `<Form>` + `<Field label error>`（校验规则） | Form + Form.Item | Form + Form.Item | Form | weifuwu Field 轻量（无 Provider 样板） |
| 文件上传 | `<FileUpload drag multiple accept maxSize>` | Upload | Upload | — | 拖拽已支持；文件列表/预览/进度待增强 |

## 数据展示

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 表格 | `<Table columns data sortable onSort>` | Table | Table | Table | 列排序 + **行选择/筛选/列宽已实现**；虚拟表格待补 |
| 卡片 | `<Card clickable hover padding>` | Card | Card | Card | clickable/hover 抬升/active 选中态 |
| 标签 | `<Tag variant closable>` | Tag | Tag | Badge（variant） | closable 已支持 |
| 徽标 | `<Badge variant dot>`（8px 状态点） | Badge | Badge | Badge | `dot` = 状态点 |
| 列表 | `<List items renderItem empty>` | List | 手动 v-for | — | 通用列表 |
| 时间线 | `<Timeline items status>` | Timeline | Timeline | — | 节点状态色 + 图标 |
| 描述列表 | `<Descriptions items column bordered>`（dl/dt/dd 语义） | Descriptions | Descriptions | — | 等价 |
| 统计卡片 | `<StatCard label value trend animate>` | Statistic | Statistic | — | 卡片形态 + 点击 + 动画 |
| 图片 | `<Img src fallback lazy preview>` | Image | Image | — | **preview 点击放大已实现** |
| 图表 | `<Chart type data>`（自研零依赖） | — | — | Chart（recharts 包装） | 自研 line/bar/pie，无运行时依赖 |
| 骨架屏 | `<Skeleton variant count>` | Skeleton | Skeleton | Skeleton | 等价 |
| 空状态 | `<EmptyState icon text hint>` | Empty | Empty | — | icon 用 emoji/Icon + 操作区 |
| 结果页 | `<Result status title desc extra>` | Result | Result | — | 等价（success/error/warning/info） |
| 搜索高亮 | `<Highlight text query>`（`<mark>` 分词） | — | — | — | weifuwu 独有（配 SearchInput/Table） |
| 树 | `<Tree data checkable checkedKeys>` | Tree | Tree | — | 勾选父子联动 + indeterminate |
| 级联 | `<Cascader options value>` | Cascader | Cascader | — | 多列面板逐级推进 |
| 穿梭框 | `<Transfer data targetKeys>` | Transfer | Transfer | — | 双列表 + 移动；移动端自动堆叠 |
| 月历 | `<Calendar month year events>` | Calendar | Calendar | — | 事件点 + 月切换 |
| 虚拟列表 | `<VirtualList height itemHeight>` | — | — | — | spacer + 可见窗口，200 条只渲染 ~12 |

## 反馈

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 提示条 | `<Alert variant closable>` | Alert | Alert | Alert | 等价 |
| 模态框 | `<Modal open title onClose width>` | Modal | Dialog | Dialog | `open/onClose`（antd v5 同）；焦点 trap + 归还；移动端 bottom-sheet |
| 确认框 | `<Confirm>` + `await confirm()` 命令式 | Popconfirm / Modal.confirm | Popconfirm / MessageBox | AlertDialog | 声明式 + 命令式双模式 |
| 抽屉 | `<Drawer position="left\|right\|top\|bottom">` | Drawer | Drawer | Sheet / Drawer | **四方向覆盖 shadcn Sheet + Drawer**；移动端全宽 |
| 气泡 | `<Popover position>`（视口夹紧） | Popover | Popover | Popover | 等价（usePopup：外部点击/Escape/tap 降级） |
| 悬浮提示 | `<Tooltip content position>`（string） | Tooltip | Tooltip | Tooltip | usePopup：桌面 hover / 触屏 tap |
| 悬停卡 | `<HoverCard content>`（富内容 + 延迟） | — | — | HoverCard | shadcn 对齐；触屏 tap |
| 右键菜单 | `<ContextMenu items>` | Dropdown context | — | ContextMenu | 桌面右键 + **触屏长按**双通道 |
| 消息 | `<Toast>` + `toast()` 命令式 | message | Message | Sonner | 命令式 `toast('已保存','success')` |
| 通知 | `<Notification>` + `notification.success()` | notification | Notification | — | 队列式通知 |
| 加载 | `<Loading>` | Spin | Loading | — | 等价 |
| 进度条 | `<ProgressBar value>` | Progress | Progress | Progress | 等价（线性） |
| 折叠 | `<Collapse items active>`（异步 loading + extra） | Collapse | Collapse | Collapse | 行内折叠（区别于 Accordion） |
| 手风琴 | `<Accordion items>` | Collapse accordion | Collapse accordion | Accordion | 单开折叠 |
| 复制按钮 | `<CopyButton value>`（clipboard + 降级 + 成功态） | — | — | — | Chat/CodeBlock 证据驱动 |
| 水印 | `<Watermark text>`（canvas 平铺 + overlay） | Watermark | — | — | 自研 |
| 二维码 | `<QRCode value>`（Reed-Solomon + 8 掩码） | QRCode | QRCode | — | **自研编码零依赖** |
| 轮播 | `<Carousel autoplay>`（箭头/圆点/循环 + 触摸） | Carousel | Carousel | — | 触摸滑动 + 触屏命中区 |
| 分割面板 | `<Resizable defaultSize>`（拖拽 + 键盘 + clamp） | Splitter | — | Resizable | 指针 + 方向键 |
| 回到顶部按钮 | `<BackTop>` | FloatButton.BackTop | Backtop | — | 滚动监听 |

## AI / 特色（三库无，weifuwu 独有）

| 组件 | 说明 |
|------|------|
| `<AiChat>` | 完整 AI 对话界面（流式 token/工具卡/审批卡/自动滚动），配 `ctx.ui.useChat()`；移动端 `raiseOnKeyboard` |
| `<ChatInput>` | 独立聊天输入条（AiChat 抽取）：单行/多行 + streaming 停止 + IME 安全——纯输入层（useChat 组合在消费方） |
| `<AuthPage>` | 认证页骨架：居中卡片 + logo + 表单插槽 + 错误条 + 提交 loading（登录/注册复用） |
| `<Markdown content>` | 零依赖安全子集 parser（无 raw HTML 注入，VNode 渲染天然转义） |
| `<CodeBlock code lang>` | 代码块 + 语言标签 + 复制按钮 |
| `<MessageBubble role status>` | 聊天气泡（独立复用，AiChat 抽取） |
| `<ToolCallCard>` | AI 工具调用状态机（running/ok/error） |
| `<JsonSchemaForm schema value onSubmit>` | JSON Schema → 参数输入表单：类型映射 + 必填/范围校验 + 嵌套/数组（工具参数输入面；不支持项告警降级） |
| `<ReasoningBlock content>` | CoT 推理折叠展示（thinking 模式 reasoning_content；流式脉冲） |
| `<CitationCard items>` | RAG 引用来源列表：折叠 + 序号/标题/来源/片段/链接 + 溢出 +N |
| `<SessionList sessions>` | 会话管理：分组（今天/昨天/更早）+ 搜索 + 重命名/删除/新建 + 键盘导航 |
| `<ApprovalCard>` | HITL 人工审批卡片（pending/approved/rejected/timeout） |
| `<Editor>` | 富文本编辑器（contentEditable + 工具栏/表格/图片，零依赖） |
| `<ThemeSwitch>` | 明暗主题切换（CSS 变量驱动，配 `data-theme`） |
| `<InView>` | 交叉观察（进入视口触发，可做无限滚动） |
| `<AspectRatio>` | 宽高比容器（内容填满） |
| `<CopyButton>` | 复制（clipboard + execCommand 降级 + 成功状态机） |

## 第九批：AI 差异化（109 → 111 组件，2026-08）

> 三库业务组件覆盖 ~100% 后的差异化期——补 AI **输入层 + 推理展示层**。
> 完整设计/裁剪见组件裁剪登记（内部文档，仓库内可查）。

| 组件 | 类型 | 三库等价 | 要点 |
|------|------|---------|------|
| **JsonSchemaForm** | 新增 | @rjsf（依赖重，weifuwu 零依赖子集） | JSON Schema（对象子集）→ 参数输入表单：string/number/integer/boolean/enum/object/array 类型映射 + required/范围校验 + 嵌套/数组增删；不支持项（$ref/组合 schema）告警降级 |
| **ReasoningBlock** | 新增 | 三库无 | CoT 推理折叠展示：aria-expanded + 键盘可达 + 流式脉冲 |
| **AiChat 集成** | 增强 | — | `WfDone.reasoning`（additive，收尾一次性下发）+ use-chat 聚合 + toChatMessages 回传 `reasoning_content`（thinking 模式闭环） |

> 协议变更：`wf:done` 新增可选 `reasoning` 字段（向后兼容），见 `docs/ai-contract.md` §3.4。

## 快速迁移路径（三库 → weifuwu）

```tsx
// antd / shadcn 开发者
<Modal open={show} onClose={f}>…</Modal>          // antd v5 同命名，直接迁移
<Select options={opts} value={v} onChange={f} />   // 同命名
<Button variant="primary">保存</Button>            // antd type="primary" → variant

// Element Plus 开发者（v-model 模板语法 → value/onChange）
<Input :value="v" @input="f" />                    // → <Input value={v} onInput={f} />
<ElDialog :visible="s" @close="f" />               // → <Modal open={s} onClose={f} />
<ElMessage>成功</ElMessage>                        // → toast('成功','success')

// shadcn 开发者（原子组合 → 成品）
<Dialog><DialogTrigger/>…</Dialog>                 // → <Modal open onClose> 一体组件
<Sheet><SheetTrigger/>…</Sheet>                    // → <Drawer position="bottom">
<Badge variant="secondary">x</Badge>               // → <Tag variant="secondary">x</Tag>
```

## weifuwu 已补齐（第六批，2026-08）→ 待补清单清零 ✅

第六批 6 组件全部落地（TDD 红→绿 + style-audit + demo + agent-browser 实测）：

| 组件 | 类型 | 要点 |
|------|------|------|
| **Menu 子菜单/折叠** | 增强 | `children` 子菜单 + `collapsible` 折叠侧栏 + 多级键盘流 |
| **FileUpload 增强** | 增强 | 图片缩略图（objectURL revoke）+ 进度条 + 受控纪律 |
| **VirtualTable** | 新增 | 固定表头 + 虚拟滚动（10k 行 ~17 DOM）+ 排序 |
| **Anchor** | 新增 | 滚动高亮跟随 + 点击平滑滚动 + useHash |
| **LogViewer** | 新增 | ANSI 着色 + 虚拟滚动 + follow 自动跟随 + maxLines |
| **JSONViewer** | 新增 | 递归折叠 + 类型色 + 路径复制 + 懒展开（ToolCallCard 已接入） |

> 三库共识覆盖度 ~100%（剩余均为已声明裁剪项，见组件裁剪登记）。

## 第七批：AI 开发者工具深化（96 → 102 组件）

> 追平期结束（三库共识 ~100%），差异化期——本批全部组件三库没有的直接等价物。

| 组件 | 类型 | 要点 |
|------|------|------|
| **DiffView** | 新增 | LCS 行级 diff（自研算法）：三态行 + 未变块折叠 + maxLines 防超大 |
| **Sparkline** | 新增 | 迷你趋势线：SVG 自绘 + 归一化 + 平滑曲线 + 面积填充 + 等值防抖 |
| **Tour** | 新增 | 新手引导：目标高亮（rect 精确跟随）+ 遮罩 + 步骤气泡 + 全局 Escape |
| **Kanban** | 新增 | 拖拽看板：原生 DnD + 跨列/重排 + 悬停高亮 + 受控纪律 |
| **Pipeline** | 新增 | Agent 工作流 DAG：Kahn 拓扑分层 + 贝塞尔连线 + 状态语义色 + 环检测 |
| **TreeSelect** | 新增 | 树形选择：单选/多选（父子联动）+ label 回显 + 受控纪律 |

> AI 开发者工具链成型：AiChat / Command / JSONViewer / LogViewer / DiffView /
> Pipeline——三库差异化最深的完整工具线。
> 裁剪声明见组件裁剪登记（内部文档）。

## 第八批：三库并集缺口清零（102 → 113，2026-08）

> 三库评估：antd 88% / EP 89% / shadcn 92%——本批补齐全部真实缺口，三库 208 项 100% 有对应。
> 完整逆向映射表见 `docs/compat-three-library.md`。

| 组件 | 类型 | 三库等价 | 要点 |
|------|------|---------|------|
| **Layout**（+LayoutHeader/Sider/Content/Footer） | 新增 | antd Layout / EP Container / shadcn Sidebar | 复合子组件双模式；含 Sider → row 布局；Sider 折叠受控/非受控 + trigger |
| **Popconfirm** | 新增 | antd / EP Popconfirm | 复用 usePopup 基座（弹层组合性）；danger 危险色；确认后自动关闭 |
| **AutoComplete** | 新增 | antd+EP Autocomplete / shadcn Combobox | 自由输入联想；包含过滤（纯函数）；键盘 ↓↑/Enter/Escape；选中回填；error 错误态 |
| **Link** | 新增 | EP Link / antd Typography.Link | 语义色/下划线/disabled/new window/icon |
| **FloatButton** | 新增 | antd FloatButton（特有） | fixed 定位 + badge + 组展开状态机 |
| **NavMenu** | 新增 | shadcn NavigationMenu（特有） | 顶部多级 hover 弹出 + 键盘 →/Escape |
| **Space** | 新增 | antd / EP Space | flex gap 布局 + split 分隔符 |
| **Grid**（+Col） | 新增 | antd Row/Col/Flex / EP Row/Col | 24 栅格 + gutter + flex 容器模式 |
| **Scrollbar** | 新增 | EP Scrollbar / shadcn ScrollArea | webkit 滚动条样式容器 |
| **AlertGroup** | 新增 | EP AlertGroup（2.8） | ≥3 条合并折叠 +N，点击展开 |
| **StatCard ⬆️** | 增强 | antd Statistic.Countdown | countdown 模式：剩余 HH:MM:SS + 结束回调（1s tick + 清理纪律） |

> 三库 208 项（antd 84 / EP 74 / shadcn 50）→ 100% 覆盖（业务组件全对应；
> 框架级 App/ConfigProvider/Teleport/Overlay 由 UIRouter+uiServe/createPortal/--wf-* token 内置）。
