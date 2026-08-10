# 三库 → weifuwu 完整映射表（antd / Element Plus / shadcn-ui）

> **逆向迁移速查**：从三库任意组件出发，找到 weifuwu 中的对应能力。
> 状态：✅ 已有 · 🆕 batch-8（v0.68.0） · 🔧 框架内置（client/layout）
> 与 `components-map.md`（weifuwu → 三库）互为逆向。

---

## antd（84 项）

### 通用基础
| antd | weifuwu | 状态 | 备注 |
|------|---------|:----:|------|
| Button | `<Button>` | ✅ | variant/size/loading/block |
| Icon | `<Icon name>` | ✅ | 自研 30+ stroke SVG |
| Typography.Title/Text/Paragraph | `<Title>/<Text>/<Paragraph>` | ✅ | — |
| Typography.Link | `<Link>`（batch-8） | 🆕 | — |
| Divider | `<Divider>` | ✅ | 含带文字 |
| Space | `<Space>` | 🆕 | — |
| Flex | `<Grid flex>` | 🆕 | flex 容器模式 |
| Grid（Row/Col） | `<Grid>` | 🆕 | 24 栅格 + gutter |
| Splitter | `<Resizable>` | ✅ | — |
| Avatar / Avatar.Group | `<Avatar>/<AvatarGroup>` | ✅ | — |
| Badge | `<Badge>` | ✅ | 含 dot 状态点 |
| Calendar | `<Calendar>` | ✅ | — |

### 导航
| antd | weifuwu | 状态 | 备注 |
|------|---------|:----:|------|
| Menu | `<Menu>` | ✅ | 含分组/方向键 |
| Breadcrumb | `<Breadcrumb>` | ✅ | — |
| Dropdown | `<Dropdown>` | ✅ | — |
| Pagination | `<Pagination>` | ✅ | — |
| Steps | `<Steps>` | ✅ | — |
| Tabs | `<Tabs>` | ✅ | — |
| Anchor | `<Anchor>` | ✅ | — |
| Affix | `<Affix>` | ✅ | — |
| BackTop | `<BackTop>` | ✅ | — |
| Layout / Layout.Header / Layout.Sider / Layout.Content / Layout.Footer | `<Layout>` + LayoutHeader/LayoutSider/LayoutContent/LayoutFooter | 🆕 | — |
| PageHeader | `<PageHeader>` | ✅ | antd v5 已移除，weifuwu 保留 |
| FloatButton | `<FloatButton>` | 🆕 | — |
| AutoComplete | `<AutoComplete>` | 🆕 | — |

### 表单
| antd | weifuwu | 状态 | 备注 |
|------|---------|:----:|------|
| Input | `<Input>` | ✅ | 含 label/error/hint |
| Input.TextArea | `<Textarea>` | ✅ | — |
| Input.Search | `<SearchInput>` | ✅ | — |
| Input.Password | `<PasswordInput>` | ✅ | — |
| InputNumber | `<InputNumber>` | ✅ | — |
| Select | `<Select searchable multiple>` | ✅ | — |
| Checkbox / Checkbox.Group | `<Checkbox>/<CheckboxGroup>` | ✅ | — |
| Radio / Radio.Group | `<RadioGroup>` | ✅ | — |
| Switch | `<Switch>` | ✅ | — |
| Slider | `<Slider>` | ✅ | — |
| DatePicker / TimePicker / RangePicker | `<DatePicker mode="date\|time\|datetime\|range">` | ✅ | 一组件覆盖四 |
| Rate | `<Rate>` | ✅ | — |
| Cascader | `<Cascader>` | ✅ | — |
| Transfer | `<Transfer>` | ✅ | — |
| TreeSelect | `<TreeSelect>` | ✅ | — |
| Mentions | `<Mentions>` | ✅ | — |
| Upload | `<FileUpload>` | ✅ | — |
| ColorPicker | `<ColorPicker>` | ✅ | — |
| Form / Form.Item | `<Form>` + `<Field>` | ✅ | — |

### 数据展示
| antd | weifuwu | 状态 | 备注 |
|------|---------|:----:|------|
| Table | `<Table>` | ✅ | 排序/行选择/筛选/列宽 |
| List | `<List>` | ✅ | — |
| Card | `<Card>` | ✅ | — |
| Descriptions | `<Descriptions>` | ✅ | — |
| Tabs | `<Tabs>` | ✅ | — |
| Tag | `<Tag>` | ✅ | — |
| Timeline | `<Timeline>` | ✅ | — |
| Tree | `<Tree>` | ✅ | 勾选父子联动 |
| Tooltip | `<Tooltip>` | ✅ | — |
| Popover | `<Popover>` | ✅ | — |
| Tour | `<Tour>` | ✅ | — |
| Empty | `<EmptyState>` | ✅ | — |
| Skeleton | `<Skeleton>` | ✅ | — |
| Statistic / Statistic.Countdown | `<StatCard countdown>` | 🆕 | countdown 增强 |
| Segmented | `<SegmentedControl>` | ✅ | — |
| Image / Image.PreviewGroup | `<Img preview>` | ✅ | — |
| QRCode | `<QRCode>` | ✅ | — |
| Spin | `<Loading>` | ✅ | — |
| Carousel | `<Carousel>` | ✅ | — |
| Watermark | `<Watermark>` | ✅ | — |

### 反馈
| antd | weifuwu | 状态 | 备注 |
|------|---------|:----:|------|
| Alert | `<Alert>` | ✅ | — |
| Modal | `<Modal>` | ✅ | — |
| Popconfirm | `<Popconfirm>` | 🆕 | — |
| message | `<Toast>` + `toast()` | ✅ | — |
| notification | `<Notification>` | ✅ | — |
| Drawer | `<Drawer position>` | ✅ | 四向 |
| Progress | `<ProgressBar>` | ✅ | — |
| Result | `<Result>` | ✅ | — |
| Skeleton | `<Skeleton>` | ✅ | — |
| Spin | `<Loading>` | ✅ | — |

### 框架级
| antd | weifuwu | 状态 | 备注 |
|------|---------|:----:|------|
| App 引导 | `UIRouter + uiServe` | 🔧 | ui-dom 框架内置（weifuwu/client 已并入 ui-dom） |
| ConfigProvider | `--wf-*` token + ctx 注入 | 🔧 | client 框架内置 |

---

## Element Plus（74 项）

### 基础
| EP | weifuwu | 状态 | 备注 |
|----|---------|:----:|------|
| Button | `<Button>` | ✅ | — |
| Icon | `<Icon>` | ✅ | — |
| Link | `<Link>` | 🆕 | — |
| Divider | `<Divider>` | ✅ | — |
| Space | `<Space>` | 🆕 | — |
| Color | `--wf-*` token | 🔧 | layout token |
| Border | `--wf-border-*` token | 🔧 | layout token |
| Text | `<Text>`（Typography） | ✅ | — |
| Scrollbar | `<Scrollbar>` | 🆕 | — |

### 布局
| EP | weifuwu | 状态 | 备注 |
|----|---------|:----:|------|
| Container / Header / Aside / Main / Footer | `<Layout>` + LayoutHeader/LayoutSider/LayoutContent/LayoutFooter | 🆕 | — |
| Row / Col | `<Grid>` | 🆕 | 24 栅格 |

### 表单
| EP | weifuwu | 状态 | 备注 |
|----|---------|:----:|------|
| Input | `<Input>` | ✅ | — |
| InputNumber | `<InputNumber>` | ✅ | — |
| Autocomplete | `<AutoComplete>` | 🆕 | — |
| Select | `<Select searchable>` | ✅ | — |
| Cascader | `<Cascader>` | ✅ | — |
| Switch | `<Switch>` | ✅ | — |
| Slider | `<Slider>` | ✅ | — |
| TimePicker / TimeSelect | `<DatePicker mode="time">` | ✅ | — |
| DatePicker / DateTimePicker | `<DatePicker mode="date\|datetime">` | ✅ | — |
| Upload | `<FileUpload>` | ✅ | — |
| Rate | `<Rate>` | ✅ | — |
| ColorPicker | `<ColorPicker>` | ✅ | — |
| Transfer | `<Transfer>` | ✅ | — |
| Form / FormItem | `<Form>` + `<Field>` | ✅ | — |
| Checkbox / CheckboxGroup / CheckboxButton | `<Checkbox>/<CheckboxGroup>` | ✅ | — |
| Radio / RadioGroup / RadioButton | `<RadioGroup>` | ✅ | — |
| InputNumber | `<InputNumber>` | ✅ | — |
| InputTag | `<TagsInput>` | ✅ | — |
| TreeSelect | `<TreeSelect>` | ✅ | — |
| SelectV2 / CascaderPanel / TreeV2 | `<Select>/<Cascader>/<Tree>` | ✅ | 虚拟化同族 |

### 数据
| EP | weifuwu | 状态 | 备注 |
|----|---------|:----:|------|
| Avatar / AvatarGroup | `<Avatar>/<AvatarGroup>` | ✅ | — |
| Badge | `<Badge>` | ✅ | — |
| Calendar | `<Calendar>` | ✅ | — |
| Card | `<Card>` | ✅ | — |
| Carousel | `<Carousel>` | ✅ | — |
| Collapse / CollapseItem | `<Collapse>` | ✅ | — |
| Descriptions / DescriptionsItem | `<Descriptions>` | ✅ | — |
| Empty | `<EmptyState>` | ✅ | — |
| Image / ImageViewer | `<Img preview>` | ✅ | — |
| InfiniteScroll | `<InfiniteScroll>` + `<InView>` | ✅ | — |
| List | `<List>` | ✅ | — |
| Loading | `<Loading>` | ✅ | — |
| Result | `<Result>` | ✅ | — |
| Skeleton / SkeletonItem | `<Skeleton>` | ✅ | — |
| Table / TableColumn | `<Table>` | ✅ | — |
| Tabs / TabPane | `<Tabs>` | ✅ | — |
| Tag | `<Tag>` | ✅ | — |
| Timeline / TimelineItem | `<Timeline>` | ✅ | — |
| Tree | `<Tree>` | ✅ | — |
| Tooltip / TooltipV2 | `<Tooltip>` | ✅ | — |
| VirtualizedTable | `<VirtualTable>` | ✅ | — |

### 导航
| EP | weifuwu | 状态 | 备注 |
|----|---------|:----:|------|
| Affix | `<Affix>` | ✅ | — |
| Backtop | `<BackTop>` | ✅ | — |
| Breadcrumb | `<Breadcrumb>` | ✅ | — |
| Dropdown / DropdownItem / DropdownMenu | `<Dropdown>` | ✅ | — |
| Menu / MenuItem / MenuItemGroup | `<Menu>` | ✅ | — |
| PageHeader | `<PageHeader>` | ✅ | — |
| Pagination | `<Pagination>` | ✅ | — |
| Steps / Step | `<Steps>` | ✅ | — |

### 反馈
| EP | weifuwu | 状态 | 备注 |
|----|---------|:----:|------|
| Alert | `<Alert>` | ✅ | — |
| AlertGroup | `<AlertGroup>` | 🆕 | EP 2.8 新增 |
| Dialog | `<Modal>` | ✅ | — |
| Drawer | `<Drawer>` | ✅ | — |
| Message | `<Toast>` + `toast()` | ✅ | — |
| MessageBox | `<Confirm>` + `confirm()` | ✅ | — |
| Notification | `<Notification>` | ✅ | — |
| Popconfirm | `<Popconfirm>` | 🆕 | — |
| Popover | `<Popover>` | ✅ | — |
| Progress | `<ProgressBar>` | ✅ | — |
| Rate | `<Rate>` | ✅ | — |
| Slider | `<Slider>` | ✅ | — |
| Switch | `<Switch>` | ✅ | — |
| Tooltip | `<Tooltip>` | ✅ | — |

### 框架级
| EP | weifuwu | 状态 | 备注 |
|----|---------|:----:|------|
| ConfigProvider | `--wf-*` token + ctx | 🔧 | client 内置 |
| Teleport | `createPortal` | 🔧 | client 内置 |
| Overlay | 渲染器内置遮罩 | 🔧 | client 内置 |
| AlertGroup | `<AlertGroup>` | 🆕 | — |

---

## shadcn-ui（50 项）

| shadcn | weifuwu | 状态 | 备注 |
|--------|---------|:----:|------|
| Accordion | `<Accordion>` | ✅ | — |
| Alert | `<Alert>` | ✅ | — |
| AlertDialog | `<Confirm>` | ✅ | — |
| AspectRatio | `<AspectRatio>` | ✅ | — |
| Avatar | `<Avatar>` | ✅ | — |
| Badge | `<Badge>` | ✅ | — |
| Breadcrumb | `<Breadcrumb>` | ✅ | — |
| Button | `<Button>` | ✅ | — |
| Calendar | `<Calendar>` | ✅ | — |
| Card | `<Card>` | ✅ | — |
| Carousel | `<Carousel>` | ✅ | — |
| Chart | `<Chart>` | ✅ | 自研零依赖 |
| Checkbox | `<Checkbox>` | ✅ | — |
| Collapsible | `<Collapse>` | ✅ | — |
| Combobox | `<Select searchable>` + `<AutoComplete>` | ✅/🆕 | 可搜索选择 + 输入联想 |
| Command | `<Command>` | ✅ | Cmd+K 面板 |
| ContextMenu | `<ContextMenu>` | ✅ | — |
| DataTable | `<Table>` + `<VirtualTable>` | ✅ | — |
| DatePicker | `<DatePicker>` | ✅ | — |
| Dialog | `<Modal>` | ✅ | — |
| Drawer | `<Drawer>` | ✅ | — |
| DropdownMenu | `<Dropdown>` | ✅ | — |
| Form | `<Form>` + `<Field>` | ✅ | — |
| HoverCard | `<HoverCard>` | ✅ | — |
| Input | `<Input>` | ✅ | — |
| InputOTP | `<PinInput>` | ✅ | — |
| Label | `<Label>` | ✅ | — |
| Menubar | `<Menubar>` | ✅ | — |
| NavigationMenu | `<NavMenu>` | 🆕 | — |
| Pagination | `<Pagination>` | ✅ | — |
| Popover | `<Popover>` | ✅ | — |
| Progress | `<ProgressBar>` | ✅ | — |
| RadioGroup | `<RadioGroup>` | ✅ | — |
| Resizable | `<Resizable>` | ✅ | — |
| ScrollArea | `<Scrollbar>` | 🆕 | 容器滚动 |
| Select | `<Select>` | ✅ | — |
| Separator | `<Divider>` | ✅ | — |
| Sheet | `<Drawer position="bottom">` | ✅ | — |
| Sidebar | `<Layout>` + LayoutSider | 🆕 | — |
| Skeleton | `<Skeleton>` | ✅ | — |
| Slider | `<Slider>` | ✅ | — |
| Sonner | `<Toast>` + `toast()` | ✅ | — |
| Switch | `<Switch>` | ✅ | — |
| Table | `<Table>` | ✅ | — |
| Tabs | `<Tabs>` | ✅ | — |
| Textarea | `<Textarea>` | ✅ | — |
| Toast | `<Toast>` | ✅ | — |
| Toggle / ToggleGroup | `<ToggleGroup>` | ✅ | — |
| Tooltip | `<Tooltip>` | ✅ | — |
| —（无独立项） | — | — | — |

---

## 汇总

| 库 | 总数 | ✅ 已有 | 🆕 batch-8 | 🔧 框架内置 |
|----|:----:|:------:|:---------:|:---------:|
| antd | 84 | 75 | 7（Layout/Link/Space/Grid/Flex/Empty 修正/AutoComplete/Popconfirm/FloatButton/StatCard） | 2 |
| EP | 74 | 65 | 7（Link/Space/Scrollbar/Layout/Grid/AutoComplete/Popconfirm/AlertGroup） | 3 |
| shadcn | 50 | 45 | 3（NavMenu/Scrollbar/Layout） | 0 |
| **合计** | **208** | **185** | **17**（去重后 11 组件 + 5 增强） | **5** |

> batch-8 新增组件：`Layout`（含子组件）、`AutoComplete`、`Popconfirm`、`FloatButton`、
> `NavMenu`、`Link`、`Space`、`Grid`、`Scrollbar`、`AlertGroup`、`StatCard`（countdown 增强）
