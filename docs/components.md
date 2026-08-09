# 组件库（weifuwu/components）

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

92 个 HTML 原语组件。每个是 `(_init, ctx) => (props) => VNode`（两阶段组件，与前端框架同一模型），引用 `--wf-*` CSS 变量做主题。另含 `confirm()` / `toast()` 命令式中间件。

> **组件速查（weifuwu 组件 ↔ antd / Element Plus / shadcn-ui 对应 + 迁移示例）**：见 [`design/components-map.md`](../design/components-map.md)——从其他组件库迁来的开发者按功能直接找对应组件。

```ts
import { Button, Input, Table, Modal, Toast } from 'weifuwu/components'
import 'weifuwu/components/style.css'   // 包含 Token + 67 布局原语 + 组件样式，一次性引入
```

### 使用示例

```tsx
// ├─ 按钮
<Button variant="primary" onClick={() => alert('提交')}>提交</Button>
<Button variant="ghost" loading>加载中</Button>
<Button variant="danger" size="lg" block>删除</Button>

// ├─ 输入框
<Input placeholder="请输入邮箱" />
<Input label="用户名" name="username" required error="必填" />
<Input type="password" hint="至少6位" />
<Input name="email" type="email" disabled placeholder="name@example.com" />

// ├─ 选择器
<Select options={[{ value: 'a', label: '选项A' }]} placeholder="请选择" />
<Select searchable options={options} onChange={v => setVal(v)} />

// ├─ 复选框 / 开关 / 单选
<Checkbox checked={agree} onChange={setAgree} label="同意协议" />
<Switch checked={enabled} onChange={setEnabled} />
<RadioGroup options={[{ value: '1', label: '男' }, { value: '2', label: '女' }]} value={gender} />

// ├─ 表格
<Table columns={[{ key: 'id', label: 'ID', sortable: true }, { key: 'name', label: '名称' }]}
       data={rows} sortKey="id" sortOrder="asc" onSort={(k, o) => setSort(k, o)} />

// ├─ 模态框 / 确认框 / 抽屉
<Modal open={show} title="提示" onClose={() => setShow(false)} width="500px" closable>
  <p>确认删除？</p>
</Modal>
<Confirm open={confirming} message="确定删除？" variant="danger" onConfirm={doDelete} onCancel={() => setConfirming(false)} />
// 命令式：await ctx.confirm?.('确定删除？') —— 组件里直接调用
<Drawer open={open} title="详情" onClose={() => setOpen(false)} position="right">内容</Drawer>

// ├─ 消息提示
<Toast toasts={items} position="top-right" max={5} onRemove={id => remove(id)} />
<Alert variant="warning" closable>注意：磁盘空间不足</Alert>

// ├─ 标签 / 徽标 / 头像
<Badge variant="primary">消息</Badge>
<Badge variant="success" dot>通过</Badge>
<Tag variant="primary" closable onClose={() => {}}>标签</Tag>
<Avatar name="张三" size="lg" />

// ├─ 卡片 / 统计卡片
<Card variant="outlined" padding="md">卡片内容</Card>
<StatCard label="总用户" value="1,234" trend="up" trendLabel="12%" />

// ├─ 标签页 / 下拉菜单
<Tabs items={[{ key: 'a', label: '标签A' }, { key: 'b', label: '标签B' }]} active="a" onChange={setTab} />
<Dropdown items={[{ label: '编辑', onClick: () => {} }, { label: '删除', variant: 'danger' }]}>操作</Dropdown>

// ├─ 分页 / 步骤条
<Pagination total={100} page={1} pageSize={10} onChange={setPage} />
<Steps items={[{ key: 's1', label: '第一步' }, { key: 's2', label: '第二步' }]} current={1} />

// ├─ 滑块 / 进度条
<Slider min={0} max={100} value={50} onChange={setValue} />
<ProgressBar value={75} label="75%" />

// ├─ 面包屑 / 分割线
<Breadcrumb items={[{ label: '首页' }, { label: '用户管理' }]} />
<Divider />
<Divider>分割文字</Divider>

// ├─ 加载 / 空状态 / 骨架屏
<Loading text="加载中..." />
<EmptyState text="暂无数据" hint="请先创建一条记录"><Button>新建</Button></EmptyState>
<Skeleton variant="text" lines={3} />
<Skeleton variant="table" lines={5} cols={4} />
<Skeleton variant="avatar" />
<Skeleton variant="image" />

// ├─ 表单验证
<Form validation={{ email: [{ required: true, message: '请输入邮箱' }] }}
      onSubmit={values => ctx.api?.post('/login', values)}   // ctx.api 由中间件注入
      onError={errors => setErrors(errors)}>
  <Field label="邮箱" error={errors.email}>
    <Input name="email" />
  </Field>
  <Button type="submit">登录</Button>
</Form>

// ├─ 新增批次组件（全量实现）
<Rate value={3} onChange={setRate} />                                        // 评分
<ToggleGroup type="single" options={toolbar} value={fmt} />                  // 工具栏切换
<CheckboxGroup options={members} value={selected} onChange={setSelected} />   // 多选列表
<PinInput length={6} value={code} onChange={setCode} />                       // 验证码
<CopyButton value="https://weifuwu.dev" label="复制" />                     // 复制
<ColorPicker value={color} showInput onChange={setColor} />                   // 颜色
<Notification /> + notification.success({ title, description })               // 队列通知
<Collapse items={docs} active={open} />                                       // 行内折叠
<Tree data={orgTree} checkable checkedKeys={keys} />                          // 树形（父子联动）
<Cascader options={regions} value={['zj','hz']} />                            // 级联选择
<Transfer data={members} targetKeys={selected} />                             // 穿梭框
<Command items={commands} open={open} onOpenChange={setOpen} />               // ⌘K 命令面板
<Carousel autoplay>{slides}</Carousel>                                        // 轮播
<Resizable defaultSize={180}>…</Resizable>                                    // 拖拽分割
<Calendar month={5} year={2025} events={events} />                            // 月历
<Watermark text="内部资料">…</Watermark>                                      // 水印
<VirtualList height={400} itemHeight={36} items={rows} renderItem={render} /> // 虚拟列表
<QRCode value="https://weifuwu.dev" size={128} />                            // 二维码（自研编码）
<Img src="photo.png" preview />                                              // 图片点击放大
<BackTop /> <Affix offsetTop={64}>…</Affix>                                   // 回顶 / 固定
<HoverCard content={<UserCard />}>…</HoverCard>                               // 悬停富内容
<Mentions options={users} value={text} />                                     // @提及
<ContextMenu items={actions}>…</ContextMenu>                                  // 右键菜单
<Menubar menus={menus} />                                                     // 水平菜单
<InfiniteScroll hasMore onLoadMore>…</InfiniteScroll>                        // 无限滚动
```

> 所有组件引用 `--wf-*` CSS 变量做主题，详见下文的「样式定制指南」。

### 生命周期映射

组件没有生命周期函数。每个阶段对应到代码的明确位置：

```
mount ──────────────────────────────────────────
  const Counter = (_init, ctx) => {       ← mount（只一次）
    let count = 0                           ← 初始化状态
    return (props) => {                     ← render 函数
      // ...                                 ← 每次 dirty/props 变化执行
    }
  }

ref ────────────────────────────────────────────
  h('div', {
    ref: (el) => {
      if (el) { /* 元素已创建 */ }           ← 相当于 onmounted
      else     { /* 元素已移除 */ }           ← 相当于 onunmount
    }
  })

props 变化 ─────────────────────────────────────
  return (props) => {
    // 每次 render 都收到最新 props           ← 相当于 onupdate
    if (props.value !== prevValue) { ... }
  }
```

| 旧概念 | 新写法 |
|--------|--------|
| `onmount` | mount 外层函数直接写 |
| `onmounted` | `ref` 的 `if (el)` 分支 |
| `onunmount` | `ref` 的 `else` 分支 |
| `onupdate` | render 内层函数收新 props 自行比较 |
| `全局刷新` | `ctx.ui.render(['_wf_root'])` |
| `局部刷新` | `ctx.ui.render()` 或 `$.x = val` |
| `跨组件刷新` | `ctx.ui.selfId('name')` + `render(['name'])` |

## 组件列表

### 表单核心

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Button | `Button` | `variant`, `size`, `loading`, `disabled`, `block`, `type` | 按钮 |
| Input | `Input` | `label`, `name`, `type`, `value`, `placeholder`, `required`, `disabled`, `error`, `hint`, `onInput`, `onChange` | 输入框 |
| Textarea | `Textarea` | `rows`, `maxLength`, `showCount`, `error` | 文本域 |
| Select | `Select` | `options: SelectOption[]`, `placeholder`, `searchable` | 下拉选择 |

### 表单选择

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Checkbox | `Checkbox` | `checked`, `label`, `onChange` | 复选框 |
| Switch | `Switch` | `checked`, `label`, `onChange` | 开关 |
| RadioGroup | `RadioGroup` | `options: RadioOption[]`, `value`, `name` | 单选组 |
| Slider | `Slider` | `min`, `max`, `step`, `value`, `onChange` | 滑块 |

### 表单增强

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Form | `Form` | `onSubmit`, `validation` | 表单容器 |
| Field | `Field` | `label`, `error`, `required`, `hint` | 字段包装 |
| FileUpload | `FileUpload` | `accept`, `multiple`, `maxSize`, `onChange` | 文件上传 |
| SearchInput | `SearchInput` | `value`, `placeholder`, `onInput`, `onClear` | 搜索框 |
| SegmentedControl | `SegmentedControl` | `options: SegmentedOption[]`, `value`, `onChange`, `size` | 分段选择器 |
| ProgressBar | `ProgressBar` | `value`, `max`, `label`, `showValue` | 进度条 |
| InputNumber | `InputNumber` | `value`, `min`, `max`, `step`, `precision`, `onChange` | 数字输入（增减按钮） |
| PasswordInput | `PasswordInput` | `value`, `onInput`, `autoComplete` | 密码输入（可见性切换） |
| TagsInput | `TagsInput` | `value: string[]`, `maxTags`, `allowDuplicates` | 标签输入（中文输入法感知） |

### 数据展示

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Table | `Table` | `columns: TableColumn[]`, `data`, `loading`, `sortKey`, `sortOrder`, `onSort`, `onRowClick` | 表格 |
| Card | `Card` | `variant`, `outlined`, `padding`, `clickable`, `hover`, `active`, `onClick` | 卡片 |
| Badge | `Badge` | `variant: BadgeVariant`, `dot` | 徽标 |
| Tag | `Tag` | `variant: 'default'\|'primary'\|'success'\|'danger'`, `closable`, `onClose` | 标签 |
| Avatar | `Avatar` | `src`, `name`, `size`, `color` | 头像 |
| AvatarGroup | `AvatarGroup` | `items`, `max`, `size` | 头像组（堆叠 + 溢出 +N） |
| Timeline | `Timeline` | `items: TimelineItem[]`, `mode`, `reverse` | 时间线（执行日志/历史） |
| Descriptions | `Descriptions` | `items: DescriptionItem[]`, `column`, `bordered` | 描述列表（详情页字段） |
| Markdown | `Markdown` | `content` | AI 回复渲染（安全子集 parser） |
| CodeBlock | `CodeBlock` | `code`, `lang`, `title` | 代码块（语言标签 + 复制） |
| Highlight | `Highlight` | `text`, `query: string \| string[]` | 搜索词高亮（mark） |
| List | `List` | `items`, `renderItem`, `divided`, `header/footer/empty` | 通用列表 |
| Result | `Result` | `status`, `title`, `desc`, `extra` | 结果页（成功/失败/警告/信息） |
| Icon | `Icon` | `name: IconName`, `size` | 图标（内置 25 个 stroke 图标，currentColor 随字号） |
| StatCard | `StatCard` | `label`, `value`, `trend: 'up'\|'down'`, `trendLabel`, `icon`, `animate` | 统计卡片 |
| PageHeader | `PageHeader` | `title`, `sub`, `display` | 页面标题（actions 放 children） |
| Img | `Img` | `src`, `alt`, `fallback`, `loading`, `width`, `height` | 图片（含 fallback） |
| InView | `InView` | `once`, `threshold`, `rootMargin`, `placeholder`, `onEnter` | 进入视窗后懒加载内容 |

### 数据反馈

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Modal | `Modal` | `open`, `title`, `onClose`, `width`, `footer`, `closable` | 模态框 |
| Confirm | `Confirm` | `open`, `message`, `confirmText`, `cancelText`, `variant`, `onConfirm`, `onCancel` | 确认对话框（同 `ctx.confirm()` 命令式） |
| Drawer | `Drawer` | `open`, `title`, `position: DrawerPosition`, `onClose`, `footer` | 抽屉 |
| Tooltip | `Tooltip` | `content`, `position: TooltipPosition`, `disabled` | 工具提示（hover/focus 触发） |
| Popover | `Popover` | `content`, `position: PopoverPosition`, `trigger`, `open`, `onOpenChange`, `disabled` | 弹出层 |
| Toast | `Toast` | `toasts: ToastItem[]`, `position`, `max`, `onRemove` | 消息提示 |
| Alert | `Alert` | `variant: AlertVariant`, `closable`, `onClose` | 警告提示（内容放 children） |
| Loading | `Loading` | `text` | 加载中 |
| EmptyState | `EmptyState` | `icon`, `text`, `hint` | 空状态（操作放 children） |
| Skeleton | `Skeleton` | `variant: SkeletonVariant`, `lines`, `cols`, `width`, `height` | 骨架屏 |

### 导航组件

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Breadcrumb | `Breadcrumb` | `items: BreadcrumbItem[]` | 面包屑 |
| Menu | `Menu` | `items: MenuItem[]`, `activeKey`, `onSelect` | 侧栏导航（分组 + 图标 + 方向键） |
| Tabs | `Tabs` | `items: TabItem[]`, `active`, `onChange` | 标签页 |
| Dropdown | `Dropdown` | `trigger`, `items: DropdownItem[]`, `open`, `onOpenChange` | 下拉菜单 |
| Pagination | `Pagination` | `total`, `page`, `pageSize`, `onChange` | 分页 |
| Steps | `Steps` | `items: StepItem[]`（`{ key, label }`）, `current`, `active` | 步骤条 |
| Accordion | `Accordion` | `items: AccordionItem[]`, `multiple` | 手风琴 |

### 新增批次（全量 92 组件）

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Rate | `Rate` | `value`, `count`, `onChange`, `allowClear`, `readOnly`, `size` | 评分（键盘方向键/Home/End） |
| Typography | `Title` `Text` `Paragraph` | `Title: level 1-5`；`Text: type/strong/underline/strike/mark/code`；`Paragraph: ellipsis` | 语义排版（Title/Text/Paragraph 三组件） |
| Label | `Label` | `htmlFor`, `required` | 独立标签（必填星号） |
| AspectRatio | `AspectRatio` | `ratio` | 宽高比容器（内容填满） |
| Toggle | `Toggle` | `pressed`, `onPressedChange`, `variant`, `size` | 切换按钮（shadcn 对齐） |
| ToggleGroup | `ToggleGroup` | `type: 'single'\|'multiple'`, `options`, `value`, `onChange` | 切换组 |
| CheckboxGroup | `CheckboxGroup` | `options`, `value: string[]`, `onChange`, `cols` | 复选框组（栅格列数） |
| PinInput | `PinInput` | `length`, `value`, `onChange`, `type` | 验证码输入（自动聚焦/粘贴分派/回退） |
| CopyButton | `CopyButton` | `value`, `label`, `onCopy` | 复制按钮（clipboard + execCommand 降级） |
| ColorPicker | `ColorPicker` | `value`, `onChange`, `showInput`, `preset` | 颜色选择（预设色板 + hex 输入） |
| HoverCard | `HoverCard` | `content`, `position`, `openDelay`, `closeDelay` | 悬停富内容卡（shadcn） |
| Notification | `Notification` | 命令式 `notification.success/error/warning/open` | 队列式通知（antd 对齐） |
| BackTop | `BackTop` | `visibilityHeight`, `target`, `smooth` | 回到顶部（滚动超阈值显示） |
| Affix | `Affix` | `offsetTop`, `target` | 固定定位（滚动超阈值钉住） |
| ContextMenu | `ContextMenu` | `items: ContextMenuItem[]`（`{ label, onClick, variant: 'danger' }`） | 右键菜单（光标定位 + 方向键） |
| Mentions | `Mentions` | `options: { value, label }[]`, `value`, `onChange`, `prefix` | @提及（composition 抑制） |
| Collapse | `Collapse` | `items: CollapseItem[]`（`{ key, title, content, loading }`）, `active`, `multiple` | 行内折叠（异步 loading） |
| Tree | `Tree` | `data: TreeNode[]`, `expandedKeys`, `checkedKeys`, `checkable`, `selectedKeys`, `onCheck/onExpand/onSelect` | 树（递归 + 勾选父子联动 + 半选传播） |
| Cascader | `Cascader` | `options: CascaderOption[]`, `value: string[]`, `onChange` | 级联选择（多列推进） |
| Transfer | `Transfer` | `data: { key, label }[]`, `targetKeys`, `onChange`, `titles` | 穿梭框（选中 + 批量移动） |
| Command | `Command` | `items: CommandItem[]`, `open`, `onOpenChange`, `shortcut` | 命令面板（⌘K 全局 + 键盘流） |
| Menubar | `Menubar` | `menus: { key, label, items }[]` | 水平菜单栏（←→ 切换 + ↓ 展开） |
| Carousel | `Carousel` | `children`, `autoplay`, `interval`, `loop`, `showArrows/Dots` | 轮播（箭头/圆点/循环/自动播放） |
| Resizable | `Resizable` | `direction`, `defaultSize`, `min/maxSize` | 拖拽分割面板（pointer + 键盘方向键） |
| Calendar | `Calendar` | `month`, `year`, `events`, `selectedDate`, `onMonthChange/onSelectDate` | 月历（事件点 + 月切换 + 选日） |
| Watermark | `Watermark` | `text`, `fontSize`, `rotate`, `zIndex` | 水印（canvas 平铺） |
| VirtualList | `VirtualList` | `items`, `height`, `itemHeight`, `renderItem`, `overscan` | 虚拟列表（spacer + 可见窗口，1000+ 条） |
| InfiniteScroll | `InfiniteScroll` | `hasMore`, `loadMore`, `children`, `loader` | 触底加载（IntersectionObserver） |
| QRCode | `QRCode` | `value`, `ecLevel`, `size`, `color`, `bgColor` | 二维码（自研 Reed-Solomon，版本 1-6） |

### 图表

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Chart | `Chart` | `type: ChartType`, `data`, `options`, `title`, `area` | SVG 图表（line/bar/pie）|
| DatePicker | `DatePicker` | `mode: DatePickerMode`, `value`, `onChange`, `placeholder`, `disabled` | 日期选择器（date/datetime/time/range）|
| Editor | `Editor` | `value`, `onChange`, `toolbar`, `placeholder`, `disabled` | 富文本编辑器，零依赖 |

### 布局

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Divider | `Divider` | `vertical` | 分割线（水平带文字放 children，`vertical` 垂直） |

### AI 交互原语（wf: 协议配套）

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| AiChat | `AiChat` | `chat`, `maxHeight?`, `labels?`, `renderMessage?`, `renderToolArgs?` | 标准 AI 对话界面：气泡 + 工具卡 + 审批卡 + 自动滚动 + 错误重试（接收 `ctx.ui.useChat()` handle） |
| MessageBubble | `MessageBubble` | `content`, `role`, `status`, `actions` | 独立消息气泡（业务聊天页复用） |
| ToolCallCard | `ToolCallCard` | `call`, `progress?`, `result?`, `renderArgs?` | 工具调用卡片：running（进度条）/ ok / error 三态（协议 §4） |
| ApprovalCard | `ApprovalCard` | `request`, `status?`, `onApprove`, `onReject` | 人工审批卡片：待批（允许/拒绝+备注）/ 已批 / 已拒 / 超时（协议 §4.5） |

### 全局工具

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| ThemeSwitch | `ThemeSwitch` | `mode: 'auto'\|'light'\|'dark'`, `onChange`, `storageKey` | 主题切换（auto/light/dark，localStorage 持久化）；另有 `applyTheme()` / `getTheme()` 命令式工具 |

---

