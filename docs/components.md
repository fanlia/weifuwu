# 组件库（weifuwu/components）

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

118 个 HTML 原语组件。每个是 `async (initProps, ctx) => (props) => Promise<VNode>`（两阶段组件，与前端框架同一模型——外层工厂 + 内层 renderFn 强制异步），引用 `--wf-*` CSS 变量做主题。另含 `confirm()` / `toast()` 命令式中间件。

> **组件速查（weifuwu 组件 ↔ antd / Element Plus / shadcn-ui 对应 + 迁移示例）**：见 [`docs/components-map.md`](components-map.md)——从其他组件库迁来的开发者按功能直接找对应组件。
> **自定义组件开发**：见 [docs/custom-components.md](custom-components.md)——usePopup/useControlled/对话框/AI 组件/类型纪律逐步指南。

```ts
import { Button, Input, Table, Modal, Toast } from 'weifuwu/components'
import 'weifuwu/components/style.css'   // 包含 Token + 66 布局原语 + 156 工具类 + 组件样式，一次性引入
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

// ├─ 选择器（options 支持平铺项与分组混用：{ label, options } → optgroup）
<Select options={[{ value: 'a', label: '选项A' }]} placeholder="请选择" />
<Select searchable options={options} onChange={v => setVal(v)} />
<Select options={[{ label: '一线', options: [{ value: 'bj', label: '北京' }] }, { value: 'other', label: '其他' }]} />

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
  const Counter = async (_init, ctx) => {   ← mount（只一次，可 await）
    let count = 0                           ← 初始化状态
    return async (props) => {               ← renderFn（强制异步）
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
  return async (props) => {
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

## 通用约定（所有组件一致）

### 受控模式

| 组件类型 | 受控 prop | 必须配回调 |
|----------|-----------|-----------|
| 开关/勾选（Checkbox/Switch/RadioGroup） | `checked` | `onChange` |
| 输入（Input/Select/DatePicker/Textarea） | `value` | `onChange` / `onInput` |
| 标签页/折叠（Tabs/Collapse） | `active` | `onChange` |
| 弹层（Modal/Drawer/Dropdown/Popover） | `open` | `onClose` / `onOpenChange` |
| 树/级联/穿梭（Tree/Cascader/Transfer） | `checkedKeys`/`value`/`targetKeys` | `onChange` |
| 月历（Calendar） | `month`/`year` | `onMonthChange` |

**规则**：传受控 props 而不传回调时，交互**静默失效**——组件 `console.warn` 明确提示（Collapse/Tree/Calendar/Cascader/Dropdown 已有防护）。非受控（不传受控 props）即可直接点击。

### size 变体

- `sm` / `md` / `lg`（Button/Avatar/Input 族）。未提供 size 的组件使用默认尺寸（CSS `--wf-control-pad-*` 驱动）。
- 触屏（coarse pointer）自动 44px 命中区，不受 size 影响。

### 事件命名

| 语义 | 命名 |
|------|------|
| 值变化（受控） | `onChange` |
| 原生输入 | `onInput` |
| 列表选中 | `onSelect` |
| 弹层开关 | `onOpenChange`（弹层）/ `onClose`（对话框） |
| 表格排序 | `onSort` |

### 命令式 API（无需组件）

`confirm()` / `toast()` / `notification.success()`——组件内 `ctx.confirm?.('确定？')` 直接可用（中间件注入）。

## 关键组件 Props 参考
> 从组件 TS 类型自动提取（`src/components/*/*.ts` 的 `interface XxxProps`）。
> 完整 props 以 TS 类型为准——`tsc` 编译期校验；此处为速查。受控约定：传受控 props 必须配回调（缺回调运行期 warn）。

### Button（表单/通用）
| Prop | 类型 | 说明 |
|------|------|------|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | — |
| `size` | `'sm' \| 'md' \| 'lg'` | — |
| `block` | `boolean` | — |
| `loading` | `boolean` | — |
| `disabled` | `boolean` | — |
| `type` | `'button' \| 'submit'` | — |
| `title` | `string` | — |
| `class` | `string` | 透传原生 class（覆盖默认 wf-btn 组合） |
| `onClick` | `(e: MouseEvent) => void` | — |
| `children` | `any` | — |

### Input（表单核心）
| Prop | 类型 | 说明 |
|------|------|------|
| `label` | `string` | — |
| `name` | `string` | — |
| `type` | `'text' \| 'email' \| 'password' \| 'number' \| 'url' \| 'date' \| 'tel' \| 'time' \| 'color'` | — |
| `value` | `string` | — |
| `placeholder` | `string` | — |
| `required` | `boolean` | — |
| `disabled` | `boolean` | — |
| `error` | `string` | — |
| `hint` | `string` | — |
| `variant` | `'default' \| 'borderless'` | 边框变体：borderless 用于可编辑标题/内联编辑（hover/focus 才显边框） |
| `onInput` | `(e: Event) => void` | — |
| `onChange` | `(e: Event) => void` | — |
| `min` | `string \| number` | 原生 input 属性透传（type=number 时 min/max/step 等） |
| `max` | `string \| number` | — |
| `step` | `string \| number` | — |
| `key` | `string]: any` | — |

### Textarea（表单核心）
| Prop | 类型 | 说明 |
|------|------|------|
| `label` | `string` | — |
| `value` | `string` | — |
| `placeholder` | `string` | — |
| `required` | `boolean` | — |
| `disabled` | `boolean` | — |
| `error` | `string` | — |
| `hint` | `string` | — |
| `rows` | `number` | — |
| `maxLength` | `number` | 最大字符数（同时限制输入） |
| `showCount` | `boolean` | 显示字数统计（右下角；配合受控 value 实时更新） |
| `onInput` | `(e: Event) => void` | — |

### Select（表单选择）
| Prop | 类型 | 说明 |
|------|------|------|
| `label` | `string` | — |
| `value` | `string \| string[]` | — |
| `options` | `SelectOption[]` | — |
| `placeholder` | `string` | — |
| `required` | `boolean` | — |
| `disabled` | `boolean` | — |
| `error` | `string` | — |
| `onChange` | `(value: string \| string[]) => void` | — |
| `children` | `any` | — |
| `searchable` | `boolean` | 启用搜索过滤 |
| `multiple` | `boolean` | 多选模式（searchable 下生效；value/onChange 为数组） |
| `onSearch` | `(keyword: string) => SelectOption[] \| Promise<SelectOption[]>` | 异步搜索回调，返回值作为新选项列表 |

### Checkbox（表单选择）
| Prop | 类型 | 说明 |
|------|------|------|
| `label` | `string` | — |
| `checked` | `boolean` | — |
| `disabled` | `boolean` | — |
| `onChange` | `(checked: boolean) => void` | — |

### Switch（表单选择）
| Prop | 类型 | 说明 |
|------|------|------|
| `label` | `string` | — |
| `checked` | `boolean` | — |
| `disabled` | `boolean` | — |
| `onChange` | `(checked: boolean) => void` | — |

### RadioGroup（表单选择）
| Prop | 类型 | 说明 |
|------|------|------|
| `name` | `string` | — |
| `value` | `string` | — |
| `options` | `RadioOption[]` | — |
| `inline` | `boolean` | — |
| `onChange` | `(value: string) => void` | — |

### DatePicker（表单选择）
| Prop | 类型 | 说明 |
|------|------|------|
| `mode` | `DatePickerMode` | — |
| `value` | `string` | — |
| `onChange` | `(value: string) => void` | — |
| `placeholder` | `string` | — |
| `disabled` | `boolean` | — |
| `error` | `string` | 错误态——输入框错误样式 + aria-invalid（F2 状态矩阵） |

### Form（表单增强）
| Prop | 类型 | 说明 |
|------|------|------|
| `onSubmit` | `(values: Record<string, any>) => void \| Promise<void>` | 提交回调，接收字段名→值的对象 |
| `validation` | `Record<string, ValidationRule[]>` | 验证规则：字段名 → 规则数组 |
| `onError` | `(errors: Record<string, string>) => void` | 验证失败时回调，接收字段名→错误消息的对象 |
| `children` | `any` | — |

### Field（表单增强）
| Prop | 类型 | 说明 |
|------|------|------|
| `label` | `string` | — |
| `required` | `boolean` | — |
| `error` | `string` | — |
| `hint` | `string` | — |
| `children` | `any` | — |

### Table（数据展示）
| Prop | 类型 | 说明 |
|------|------|------|
| `data` | `any[]` | — |
| `columns` | `TableColumn[]` | — |
| `onRowClick` | `(row: any, index: number) => void` | — |
| `sortKey` | `string` | 当前排序列的 key |
| `sortOrder` | `'asc' \| 'desc'` | 当前排序方向 |
| `onSort` | `(key: string, order: 'asc' \| 'desc') => void` | 排序变化回调 |
| `rowSelection` | `TableRowSelection` | 行选择（受控） |
| `emptyText` | `string` | 数据为空时显示的文本 |
| `minWidth` | `string` | 表格最小宽度（窄屏横向滚动，如 '720px'） |
| `loading` | `boolean` | 加载中：保留表头，渲染骨架行 |
| `loadingRows` | `number` | 骨架行数，默认 3 |

### Modal（数据反馈）
| Prop | 类型 | 说明 |
|------|------|------|
| `open` | `boolean` | — |
| `title` | `string` | — |
| `onClose` | `() => void` | — |
| `children` | `any` | — |
| `footer` | `any` | — |
| `width` | `string` | 自定义宽度，如 '500px'、'80%'，默认 400px |
| `closable` | `boolean` | 是否显示关闭按钮，默认 true |
| `maskClosable` | `boolean` | 点击遮罩是否关闭，默认 true（危险确认应设 false） |

### Drawer（数据反馈）
| Prop | 类型 | 说明 |
|------|------|------|
| `open` | `boolean` | — |
| `title` | `string` | — |
| `position` | `DrawerPosition` | — |
| `onClose` | `() => void` | — |
| `children` | `any` | — |
| `footer` | `any` | — |

### Confirm（数据反馈）
| Prop | 类型 | 说明 |
|------|------|------|
| `open` | `boolean` | — |
| `title` | `string` | — |
| `message` | `any` | 提示内容（文本或任意 VNode） |
| `confirmText` | `string` | — |
| `cancelText` | `string` | — |
| `variant` | `'primary' \| 'danger'` | — |
| `width` | `string` | 对话框宽度，如 '500px'、'80%'，默认 Modal 的 400px |
| `maskClosable` | `boolean` | 遮罩点击是否取消（默认 false：危险操作防误触；显式传 true 可恢复） |
| `onConfirm` | `() => void` | — |
| `onCancel` | `() => void` | — |

### Toast（数据反馈）
| Prop | 类型 | 说明 |
|------|------|------|
| `toasts` | `ToastItem[]` | — |
| `onRemove` | `(id: string) => void` | — |
| `position` | `ToastPosition` | 容器位置，默认 top-right |
| `duration` | `number` | 全局默认自动消失时间（ms），0 = 不自动消失，默认 0 |
| `max` | `number` | 最大显示条数，超出时移除最早条目，默认 0 = 不限制 |

### Tooltip（数据反馈）
| Prop | 类型 | 说明 |
|------|------|------|
| `content` | `string` | — |
| `position` | `TooltipPosition` | — |
| `children` | `any` | — |
| `disabled` | `boolean` | — |

### Popover（数据反馈）
| Prop | 类型 | 说明 |
|------|------|------|
| `content` | `any` | — |
| `trigger` | `'click' \| 'hover'` | — |
| `position` | `PopoverPosition` | — |
| `open` | `boolean` | — |
| `onOpenChange` | `(open: boolean) => void` | — |
| `disabled` | `boolean` | — |
| `children` | `any` | — |

### Dropdown（导航组件）
| Prop | 类型 | 说明 |
|------|------|------|
| `trigger` | `any` | — |
| `items` | `DropdownItem[]` | — |
| `open` | `boolean` | — |
| `onOpenChange` | `(open: boolean) => void` | 关闭回调（面板内 Escape / 外部点击） |

### Tabs（导航组件）
| Prop | 类型 | 说明 |
|------|------|------|
| `items` | `TabItem[]` | — |
| `active` | `string` | — |
| `onChange` | `(key: string) => void` | — |

### Pagination（导航组件）
| Prop | 类型 | 说明 |
|------|------|------|
| `total` | `number` | — |
| `page` | `number` | — |
| `pageSize` | `number` | — |
| `onChange` | `(page: number) => void` | — |

### Tree（新增批次）
| Prop | 类型 | 说明 |
|------|------|------|
| `data` | `TreeNode[]` | — |
| `selectedKeys` | `string[]` | 受控选中 keys |
| `onSelect` | `(keys: string[]) => void` | — |
| `expandedKeys` | `string[]` | 受控展开 keys |
| `onExpand` | `(keys: string[]) => void` | — |
| `checkable` | `boolean` | 勾选模式（父子联动，antd 非 strict 语义） |
| `checkedKeys` | `string[]` | — |
| `onCheck` | `(keys: string[]) => void` | — |
| `className` | `string` | — |

### Cascader（新增批次）
| Prop | 类型 | 说明 |
|------|------|------|
| `options` | `CascaderOption[]` | — |
| `value` | `string[]` | 选中路径（数组，如 ['zj','hz','xh']） |
| `onChange` | `(value: string[]) => void` | — |
| `placeholder` | `string` | — |
| `disabled` | `boolean` | — |
| `error` | `string` | — |
| `label` | `string` | — |

### Transfer（新增批次）
| Prop | 类型 | 说明 |
|------|------|------|
| `data` | `TransferItem[]` | — |
| `targetKeys` | `string[]` | 目标侧已选 keys |
| `onChange` | `(targetKeys: string[]) => void` | — |
| `titles` | `[string, string]` | — |
| `size` | `'sm' \| 'md' \| 'lg'` | — |
| `disabled` | `boolean` | — |

### Carousel（新增批次）
| Prop | 类型 | 说明 |
|------|------|------|
| `children` | `any[]` | — |
| `autoplay` | `boolean` | 自动播放 |
| `interval` | `number` | 自动播放间隔（ms），默认 3000 |
| `showArrows` | `boolean` | — |
| `showDots` | `boolean` | — |
| `loop` | `boolean` | 循环播放（尾 → 头），默认 true |
| `className` | `string` | — |

### Calendar（新增批次）
| Prop | 类型 | 说明 |
|------|------|------|
| `events` | `CalendarEvent[]` | — |
| `month` | `number` | 受控年月：month 0-11，year 四位数 |
| `year` | `number` | — |
| `onMonthChange` | `(month: number, year: number) => void` | — |
| `onSelectDate` | `(date: string) => void` | — |
| `selectedDate` | `string` | — |

### AiChat（AI 交互）
| Prop | 类型 | 说明 |
|------|------|------|
| `chat` | `UseChatHandle` | ctx.ui.useChat() 返回的会话 handle（同一 $，状态变化自动重渲染） |
| `maxHeight` | `string` | 消息列表最大高度（默认 '70vh'） |
| `labels` | `Partial<AiChatLabels>` | 界面文案覆盖 |
| `renderMessage` | `(msg: UiMessage) => any` | 自定义气泡渲染逃生舱（默认纯文本） |
| `renderToolArgs` | `(args: Record<string, unknown>) => any` | 工具参数渲染（透传 ToolCallCard） |
| `raiseOnKeyboard` | `boolean` | 键盘弹起时输入区 fixed 抬升（全屏 chat 布局用；内联卡片默认 false——原生聚焦滚动已够） |

### FileUpload（表单增强）
| Prop | 类型 | 说明 |
|------|------|------|
| `accept` | `string` | — |
| `multiple` | `boolean` | — |
| `maxSize` | `number` | — |
| `disabled` | `boolean` | — |
| `error` | `string` | — |
| `hint` | `string` | — |
| `value` | `File[]` | — |
| `onChange` | `(files: File[]) => void` | — |
| `children` | `any` | — |

### Slider（表单选择）
| Prop | 类型 | 说明 |
|------|------|------|
| `label` | `string` | — |
| `value` | `number \| string` | — |
| `min` | `number` | — |
| `max` | `number` | — |
| `step` | `number` | — |
| `onChange` | `(value: number) => void` | — |

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
| List | `List` | `items`, `renderItem`, `keyBy?`, `divided`, `header/footer/empty` | 通用列表——`keyBy`（可选）自定义项 key：renderItem 渲染有内部状态的组件且列表动态增删/重排时传身份跟随内容的 key（默认数组下标 = 位置身份） |
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
| Tree | `Tree` | `data: TreeNode[]`, `expandedKeys`, `checkedKeys`, `checkable`, `selectedKeys`, `onCheck/onExpand/onSelect` | 树（递归 + 勾选父子联动 + 半选传播；空数据「暂无数据」） |
| Cascader | `Cascader` | `options: CascaderOption[]`, `value: string[]`, `onChange` | 级联选择（多列推进） |
| Transfer | `Transfer` | `data: { key, label }[]`, `targetKeys`, `onChange`, `titles` | 穿梭框（选中 + 批量移动） |
| Command | `Command` | `items: CommandItem[]`, `open`, `onOpenChange`, `shortcut` | 命令面板（⌘K 全局 + 键盘流） |
| Menubar | `Menubar` | `menus: { key, label, items }[]` | 水平菜单栏（←→ 切换 + ↓ 展开） |
| Carousel | `Carousel` | `children`, `autoplay`, `interval`, `loop`, `showArrows/Dots` | 轮播（箭头/圆点/循环/自动播放） |
| Resizable | `Resizable` | `direction`, `defaultSize`, `min/maxSize` | 拖拽分割面板（pointer + 键盘方向键） |
| Calendar | `Calendar` | `month`, `year`, `events`, `selectedDate`, `onMonthChange/onSelectDate` | 月历（事件点 + 月切换 + 选日） |
| Watermark | `Watermark` | `text`, `fontSize`, `rotate`, `zIndex` | 水印（canvas 平铺） |
| VirtualList | `VirtualList` | `items`, `height`, `itemHeight`, `renderItem`, `overscan`, `emptyText` | 虚拟列表（spacer + 可见窗口，1000+ 条；空态占位） |
| InfiniteScroll | `InfiniteScroll` | `hasMore`, `loadMore`, `children`, `loader` | 触底加载（IntersectionObserver） |
| QRCode | `QRCode` | `value`, `ecLevel`, `size`, `color`, `bgColor` | 二维码（自研 Reed-Solomon，版本 1-6） |

### 图表

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Chart | `Chart` | `type: ChartType`, `data`, `options`, `title`, `area` | SVG 图表（line/bar/pie）|
| DatePicker | `DatePicker` | `mode: DatePickerMode`, `value`, `onChange`, `placeholder`, `disabled` | 日期选择器（date/datetime/time/range）|
| Editor | `Editor` | `value`, `onChange`, `toolbar`, `placeholder`, `disabled`, `ai?` | 富文本编辑器（事件流事务层：撤销/重做/时光机；AI 协作可选） |
| FilePreview | `FilePreview` | `type`, `content?`, `url?`, `editable?`, `ai?`, `onSave?` | 文件预览（md/html/pdf/office/text）——基于事件流，md/text 可编辑 |

### Editor（富文本编辑器 + AI 协作）

基于 contentEditable 的富文本编辑器，**事件流事务层**：语义操作（格式/链接/图片/表格/AI 替换）→ `edit:commit`（before 快照 + 事件）→ 撤销/重做/时光机精确到任意版本。

```tsx
import { Editor } from 'weifuwu/components'

<Editor value={html} onChange={v => setHtml(v)} placeholder="输入内容..." />
```

**Props**：

| Prop | 类型 | 说明 |
|------|------|------|
| `value` / `onChange` | `string` / `(html) => void` | 受控 HTML（内部模型为准——输出经序列化归一化） |
| `toolbar` | `ToolbarItem[]` | 工具栏项（bold/italic/h1-3/align/link/image/table/clear/source…）；默认 18 项 |
| `placeholder` / `disabled` / `minHeight` | | 占位符 / 禁用 / 最小高度 |
| `onUpload` | `(file) => Promise<string>` | 图片上传（返回 URL）；不传则 URL 输入 |
| `ai` | `EditorAiOptions` | **AI 协作（可选）**——见下 |
| `draftKey` | `string` | **草稿持久化（可选）**：内容自动保存（防抖 500ms），挂载时 `value` 为空且存在草稿 → 自动恢复（刷新/崩溃不丢） |

**撤销/重做/时光机**：

- `Ctrl+Z` / `Ctrl+Y`：一步撤销/重做**语义操作**（输入合并为单步——连续打字一次撤销全退）
- 工具栏 🕘 **操作历史**：commit 列表（标签 + 时间）→ 点击回到任意版本（redo 保留可重做回来）

**AI 协作**（`ai` prop——不传则无 AI 能力）：

```tsx
<Editor
  value={html}
  onChange={v => setHtml(v)}
  ai={{ url: '/api/ai-editor' }}          // wf: SSE 端点（docs/ai-contract.md）
/>
```

- 工具栏 AI 动作组（默认：润色/翻译/缩写/扩写/纠错）——选中文本（无选区 = 全文）→ 点击 → 浮层**流式**生成建议（原文 diff 对比）→ **接受**（替换 = 一个原子撤销步）/ **拒绝**
- `Ctrl+Enter`：快速触发最近使用的 AI 动作
- 自定义动作：`ai.actions`（prompt 模板注入 `{selection}`）

```tsx
<Editor value={html} onChange={v => setHtml(v)}
  ai={{
    url: '/api/ai-editor',
    actions: [{
      id: 'tone', label: '改语气',
      prompt: ({ selection }) => `请把以下文本改为正式语气：\n\n${selection}`,
    }],
  }} />
```

### FilePreview（文件预览——基于事件流）

md/html/pdf/office/text 文件预览——**文档 = fold(事件流)**（复用 Editor 文档模型）：
md/text 解析为 DocState——预览/编辑/撤销/AI 同一模型；编辑后可序列化回 md 保存。

```tsx
import { FilePreview } from 'weifuwu/components'

// md 预览 + 编辑 + AI 协作（润色文档 = 原子撤销）
<FilePreview type="md" content={md} editable ai={{ url: '/api/ai' }}
  onSave={(md) => saveToSandbox(md)} fileName="README.md" />
```

**类型支持矩阵**：

| 类型 | 预览 | 编辑 | 说明 |
|------|------|------|------|
| `md` | ✅ 复用 `<Markdown>`（安全 token 渲染：表格/任务列表/URL 白名单） | ✅ 复用 `<Editor>`（事件流事务层——撤销/时光机/AI） | 编辑保存 = 序列化回 Markdown |
| `text` | `<pre>` | ✅ 复用 `<Editor>` | 纯文本 |
| `html` | ✅ iframe `sandbox`（安全隔离——不直插 DOM） | ❌（安全边界） | 只读 |
| `pdf` | ✅ iframe（浏览器原生查看器） | ❌ | 只读 |
| `office` | ✅ iframe（服务端转换产物 URL） | ❌ | 转换由服务端提供（前端零依赖——诚实裁剪） |

**Props**：`type`（可选——按 `fileName`/`url` 扩展名自动探测：md/txt/html/pdf/
docx 等）、`content`（md/html/text）、`url`（远程加载/文件服务路径）、
`editable`（md/text 切换 Editor）、`ai`（编辑模式透传 Editor AI 协作）、
`onSave(content, type)`（保存回写）、`onLoad`（解析完成）、`height`。

**交互**：工具条「复制」（原始内容——`ctx.browser.copyText`）+「保存」；
编辑模式 `Ctrl+S` 保存。远程文件（sandbox 路径）：`url` 加载 + `onSave` 回写。

### SheetGrid（xlsx 网格编辑器——ODES 事件流）

**Props**：`workbook`（受控 WorkbookState——稀疏 cells Map）、`onChange`、
`ai`（AI 公式——SSE wf:）、`readonly`、`height`。

**能力**：单元格编辑（点击 → input → Enter/focusout 提交）、行列增删（引用平移）、
撤销（Ctrl+Z——commit 快照）、sheet 标签切换、**AI 公式**（选中单元格 → 相邻数据
上下文提示 → 浮层确认 → 接受 = cell-set commit 原子撤销）。

**事件流**：每个编辑 = `OfficeOp` → `__edit_tail(50, 'office')` 审计；AI 接受带
`target=messageId`（跨端关联 `__ai_events`）。

### SlideCanvas（pptx 画布编辑器——ODES 事件流）

**Props**：`deck`（受控 DeckState——slide → shape 几何集合）、`onChange`、
`ai`（AI 润色）、`readonly`、`height`。

**能力**：960×540 画布（scale 适配）、shape 拖拽移动/右下角缩放（pointerup 原子
提交）、双击文本编辑、幻灯片增删、Delete 删除、撤销、**AI 润色**（选中 shape →
浮层确认 → 接受 = shape-set commit）。

### Office 前端转换（零依赖——无需后端）

`weifuwu/office`（源码 `src/office/`——打包进 components）：docx/xlsx/pptx ↔
ODES 模型（DocState/WorkbookState/DeckState）双向转换——自研 ZIP（EOCD→central→
local + `DecompressionStream('deflate-raw')`）+ 轻量 XML 解析器 + VNode 组件化
生成 OOXML（OOXML 也是 VNode——与前端 VNode → DOM 同构）。

**用法**（FilePreview 内置）：`editable` office 类型 → 打开本地 docx/xlsx/pptx →
对应编辑器（Editor/SheetGrid/SlideCanvas）→ 下载导出。裁剪：复杂分节/公式计算/
动画母版——诚实提示。

**事件流**：预览加载 `editEmit('preview')`（`__edit_tail` 可审计）；编辑走 Editor
commit 事件流（同一时间线）。**sandbox 集成**：`url` 加载 + `onSave` 回写由消费方接
文件读写工具。

**裁剪**：docx/xlsx/pptx 前端解析不做（零依赖——office 由服务端转换）；代码块/
表格编辑时降级（超 Editor 模型——见 md 转换文档）。

### 布局

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| Divider | `Divider` | `vertical` | 分割线（水平带文字放 children，`vertical` 垂直） |
| AuthPage | `AuthPage` | `title`, `subtitle?`, `logo?`, `children`, `footer?`, `submitLabel`, `loading?`, `error?`, `onSubmit?` | 认证页骨架：居中卡片 + logo + 标题/副标题 + 表单插槽 + 错误条 + 提交 loading + 底部链接（登录/注册复用；认证流程/跳转由消费方提供） |

### AI 交互原语（wf: 协议配套）

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| AiChat | `AiChat` | `chat`, `maxHeight?`, `labels?`, `renderMessage?`, `renderToolArgs?` | 标准 AI 对话界面：气泡 + 工具卡 + 审批卡 + 自动滚动 + 错误重试（接收 `ctx.ui.useChat()` handle） |
| ChatInput | `ChatInput` | `value`, `onChange`, `onSend`, `streaming?`, `onStop?`, `error?`, `onRetry?`, `multiline?`, `actions?` | 独立聊天输入条（AiChat 抽取）：单行/多行（Enter 发送/Shift+Enter 换行）+ streaming 停止切换 + §5.3 IME 受控输入纪律——纯输入层，聊天逻辑（useChat）由消费方组合 |
| MessageBubble | `MessageBubble` | `content`, `role`, `status`, `actions` | 独立消息气泡（业务聊天页复用） |
| ToolCallCard | `ToolCallCard` | `call`, `progress?`, `result?`, `renderArgs?` | 工具调用卡片：running（进度条）/ ok / error 三态（协议 §4） |
| JsonSchemaForm | `JsonSchemaForm` | `schema`, `value?`, `onChange?`, `onSubmit?`, `submitLabel?` | JSON Schema（对象子集）→ 参数输入表单：类型映射 + required/范围校验 + 嵌套/数组（工具参数输入面；不支持项告警降级） |
| ReasoningBlock | `ReasoningBlock` | `content`, `label?`, `defaultExpanded?`, `streaming?` | CoT 推理折叠展示（thinking 模式 `reasoning_content`；aria-expanded + 键盘可达 + 流式脉冲） |
| CitationCard | `CitationCard` | `items`, `label?`, `maxVisible?`, `defaultExpanded?`, `onOpen?` | RAG 引用来源展示：折叠「引用 N 条」+ 条目（序号/标题/来源/片段/链接）+ 溢出 +N；onOpen 时全部可点（调用方处理跳转） |
| SessionList | `SessionList` | `sessions`, `activeId?`, `onSelect?`, `onNew?`, `onRename?`, `onDelete?`, `searchable?` | 会话管理列表：分组（今天/昨天/更早）+ 选中高亮 + 搜索 + 行内重命名（Enter 确认/Escape 取消）/删除 + 键盘方向键导航 |
| ApprovalCard | `ApprovalCard` | `request`, `status?`, `onApprove(modifiedArgs?)`, `onReject`, `argsSchema?` | 人工审批卡片：待批（允许/拒绝+备注）/ 已批 / 已拒 / 超时；`argsSchema` 提供时渲染「修改参数」（JsonSchemaForm 预填 args，提交带修改后参数 → `onApprove(modifiedArgs)` → 父层选 modified 决策） |

### 全局工具

| 组件 | 导入名 | 关键 Props | 说明 |
|-----|--------|-----------|------|
| ThemeSwitch | `ThemeSwitch` | `mode: 'auto'\|'light'\|'dark'`, `onChange`, `storageKey` | 主题切换（auto/light/dark，localStorage 持久化）；另有 `applyTheme()` / `getTheme()` 命令式工具 |

---

