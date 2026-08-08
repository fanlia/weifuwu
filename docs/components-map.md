# weifuwu/components 组件速查（对应 antd / Element Plus / shadcn-ui）

> **开发者迁移速查**：从 antd / Element Plus / shadcn-ui 迁到 weifuwu，按功能找到对应组件。
> 使用方式：左侧是 **weifuwu 组件**（已提供），右侧是对应的三库组件 + 差异备注。
> 战略路线图（weifuwu 尚未实现的组件）：见 `docs/components-cdd.md`；三库 → weifuwu 覆盖矩阵：见 `docs/components-migration.md`。

## 通用基础

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 按钮 | `<Button variant size loading block>` | Button | Button | Button | 命名基本一致；weifuwu `variant`=primary/secondary/ghost/danger |
| 图标 | `<Icon name>`（自研 30+ stroke SVG） | Icon | Icon | lucide-react | weifuwu 零依赖、currentColor、1em 随字号；组件内部统一走 Icon |
| 文本排版 | 计划中：Title/Text/Paragraph | Typography | Typography | — | 目前用 `wf-text-*` 原语 |
| 分割线 | `<Divider>`（horizontal/vertical/带文字） | Divider | Divider | Separator | 等价 |
| 头像 | `<Avatar name src color size>` | Avatar | Avatar | Avatar | weifuwu 支持名字哈希色 + 指定色 |
| 头像组 | `<AvatarGroup items max size>` | Avatar.Group | 手动组合 | 手动组合 | weifuwu 独立组件，`max` 溢出显示 +N |

## 导航

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 菜单/侧栏 | `<Menu items group activeKey onSelect>`（方向键导航） | Menu | Menu | NavigationMenu / Sidebar | antd 子菜单/折叠 → weifuwu 计划中（CDD L4）；分组 group 已支持 |
| 面包屑 | `<Breadcrumb items>` | Breadcrumb | Breadcrumb | Breadcrumb | 等价 |
| 标签页 | `<Tabs items active onChange>`（方向键） | Tabs | Tabs | Tabs | 等价 |
| 分页 | `<Pagination total page onChange>` | Pagination | Pagination | Pagination | 等价 |
| 步骤条 | `<Steps items current>` | Steps | Steps | — | 等价 |
| 下拉菜单 | `<Dropdown items>`（danger variant） | Dropdown | Dropdown | DropdownMenu | 等价 |
| 页面标题 | `<PageHeader title sub>` | PageHeader（v5 移除，用 Typography+Space） | PageHeader | — | weifuwu 保留独立组件 |
| 回到顶部 | 计划中：BackTop | FloatButton / BackTop | Backtop | — | CDD L3 |
| 固定定位 | 计划中：Affix | Affix | Affix | — | CDD L3 |
| 锚点 | 计划中：Anchor | Anchor | Anchor | — | CDD L2 |

## 表单

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 输入框 | `<Input label error hint variant>` | Input | Input | Input | weifuwu 自带 label/error/hint 包装（antd 需 Form.Item）；`variant="borderless"` 内联编辑 |
| 文本域 | `<Textarea rows showCount maxLength>` | Input.TextArea | Input type=textarea | Textarea | weifuwu 独立组件 + 字数统计 |
| 选择器 | `<Select options searchable>` | Select | Select | Select / Combobox | weifuwu searchable = 弹层+过滤+异步搜索（近 Combobox）；键盘 ↑↓ 计划中（L2） |
| 复选框 | `<Checkbox checked label>` | Checkbox | Checkbox | Checkbox | 等价 |
| 复选组 | 计划中：CheckboxGroup | Checkbox.Group | Checkbox 组 | — | CDD L2 |
| 单选 | `<RadioGroup options value>` | Radio.Group | Radio | RadioGroup | 等价 |
| 开关 | `<Switch checked>` | Switch | Switch | Switch | 等价 |
| 滑块 | `<Slider min max step>` | Slider | Slider | Slider | 等价 |
| 数字输入 | `<InputNumber min max step precision>`（增减按钮+clamp） | InputNumber | InputNumber | — | 等价 |
| 密码输入 | `<PasswordInput>`（眼睛切换） | Input.Password | Input show-password | — | weifuwu 独立组件 |
| 日期选择 | `<DatePicker mode="date\|datetime\|time\|range">`（四合一） | DatePicker / TimePicker / RangePicker | DatePicker / DateTimePicker / TimePicker | Calendar + DatePicker 组合 | **weifuwu 一个组件覆盖三库四个**；TimePicker/RangePicker 薄封装计划中 |
| 评分 | 计划中：Rate | Rate | Rate | — | CDD L2 |
| 验证码 | 计划中：PinInput | — | — | InputOTP | CDD L2 |
| 颜色选择 | 计划中：ColorPicker | ColorPicker | ColorPicker | — | CDD L2 |
| 标签输入 | `<TagsInput value onChange>`（回车/逗号/去重） | Select mode="tags" | 手动组合 | — | weifuwu 独立组件 |
| 搜索框 | `<SearchInput>` | Input.Search | Input search | — | weifuwu 独立组件 |
| 分段控件 | `<SegmentedControl options value>` | Segmented | — | ToggleGroup 近似 | weifuwu 独立组件 |
| 表单 | `<Form>` + `<Field label error>`（校验规则） | Form + Form.Item | Form + Form.Item | Form | weifuwu Field 轻量（无 Provider 样板） |
| 文件上传 | `<FileUpload drag multiple accept maxSize>` | Upload | Upload | — | weifuwu 已支持拖拽；文件列表/预览/进度计划中（L2） |

## 数据展示

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 表格 | `<Table columns data sortable onSort>` | Table | Table | Table | weifuwu 支持列排序；行选择/筛选/列宽计划中（L5） |
| 卡片 | `<Card clickable hover padding>` | Card | Card | Card | weifuwu 支持 clickable/hover 抬升/active 选中态 |
| 标签 | `<Tag variant closable>` | Tag | Tag | Badge（variant） | weifuwu closable 已支持 |
| 徽标 | `<Badge variant dot>`（8px 状态点） | Badge | Badge | Badge | weifuwu `dot` = 状态点 |
| 列表 | `<List items renderItem empty>` | List | 手动 v-for | — | 通用列表（Table 大材小用时） |
| 时间线 | `<Timeline items status>` | Timeline | Timeline | — | 节点状态色 + 图标 |
| 描述列表 | `<Descriptions items column bordered>`（dl/dt/dd 语义） | Descriptions | Descriptions | — | 等价 |
| 统计卡片 | `<StatCard label value trend animate>` | Statistic | Statistic | — | weifuwu 卡片形态 + 点击 + 动画 |
| 图片 | `<Img src fallback lazy>` | Image | Image | — | weifuwu 支持 fallback/lazy；preview 计划中（L2） |
| 图表 | `<Chart type data>`（自研零依赖） | — | — | Chart（recharts 包装） | weifuwu 自研，无运行时依赖 |
| 骨架屏 | `<Skeleton variant count>` | Skeleton | Skeleton | Skeleton | 等价 |
| 空状态 | `<EmptyState icon text hint>` | Empty | Empty | — | weifuwu icon 用 emoji/Icon + 操作区 |
| 结果页 | `<Result status title desc extra>` | Result | Result | — | 等价（success/error/warning/info） |
| 搜索高亮 | `<Highlight text query>`（`<mark>` 分词） | — | — | — | weifuwu 独有（配 SearchInput/Table） |

## 反馈

| 功能 | weifuwu | antd | Element Plus | shadcn-ui | 差异说明 |
|------|---------|------|-------------|-----------|---------|
| 提示条 | `<Alert variant closable>` | Alert | Alert | Alert | 等价 |
| 模态框 | `<Modal open title onClose width>` | Modal | Dialog | Dialog | weifuwu `open/onClose`（antd v5 同为 open）；焦点 trap + 归还 |
| 确认框 | `<Confirm>` + `await confirm()` 命令式 | Popconfirm / Modal.confirm | Popconfirm / MessageBox | AlertDialog | weifuwu 声明式 + 命令式双模式 |
| 抽屉 | `<Drawer position="left\|right\|top\|bottom">` | Drawer | Drawer | Sheet / Drawer | **weifuwu 四方向覆盖 shadcn Sheet + Drawer** |
| 气泡 | `<Popover position>`（视口夹紧） | Popover | Popover | Popover | 等价（usePopupPosition 滚动跟随） |
| 悬浮提示 | `<Tooltip content position>`（string） | Tooltip | Tooltip | Tooltip | weifuwu content 仅 string；富内容 hover → HoverCard 计划中（L3） |
| 消息 | `<Toast>` + `toast()` 命令式 | message | Message | Sonner | weifuwu 命令式 `toast('已保存','success')` |
| 加载 | `<Loading>` | Spin | Loading | — | 等价 |
| 进度条 | `<ProgressBar value>` | Progress | Progress | Progress | 等价（线性） |
| 复制按钮 | 计划中：CopyButton | — | — | — | CDD L2（Chat/CodeBlock 证据） |

## AI / 特色（三库无，weifuwu 独有）

| 组件 | 说明 |
|------|------|
| `<AiChat>` | 完整 AI 对话界面（流式 token/工具卡/审批卡/自动滚动），配 `ctx.ui.useChat()` |
| `<Markdown content>` | 零依赖安全子集 parser（无 raw HTML 注入，VNode 渲染天然转义） |
| `<CodeBlock code lang>` | 代码块 + 语言标签 + 复制按钮 |
| `<MessageBubble role status>` | 聊天气泡（独立复用，AiChat 抽取） |
| `<ToolCallCard>` | AI 工具调用状态机（running/ok/error） |
| `<ApprovalCard>` | HITL 人工审批卡片（pending/approved/rejected/timeout） |
| `<Editor>` | 富文本编辑器（contentEditable + 工具栏/表格/图片，零依赖） |
| `<ThemeSwitch>` | 明暗主题切换（CSS 变量驱动，配 `data-theme`） |
| `<InView>` | 交叉观察（进入视口触发，可做无限滚动） |

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

## weifuwu 尚未实现（三库有）→ CDD 路线图

Title/Text/Paragraph · Label · AspectRatio · CheckboxGroup · Rate · PinInput · ColorPicker · Toggle/ToggleGroup ·
CopyButton · ImagePreview(Img preview) · HoverCard · ContextMenu · Notification · BackTop · Affix · Anchor · Mentions ·
Collapse · Tree · Cascader · Transfer · Carousel · Calendar · Command · Menubar · Resizable · Watermark · QRCode ·
VirtualTable/VirtualList · Select 增强(键盘/multiple) · Table 增强(行选择/筛选/列宽) · FileUpload 增强(列表/预览/进度)

> 每项对应难度阶梯（L1-L6）与验证的 client 能力点：`docs/components-cdd.md`
