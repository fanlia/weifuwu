# @weifuwujs/components

**33 个 UI 组件 + 5 个浏览器原语 — 基于 weifuwu/client 信号系统，零额外运行时。**

```bash
npm install @weifuwujs/components
# 14 kB, 零上游依赖 (peer: weifuwu >=0.33.0)
```

与 React 组件库的核心区别：**组件接收 `Signal<T>` 作为 props，不需要 `useState`/`onChange`/`value`/`setValue` 配对。**

```tsx
import { Button, Modal, Table, toast } from '@weifuwujs/components'
import { signal } from 'weifuwu/client'

const isOpen = signal(false)
<Button onClick={() => isOpen.value = true}>弹窗</Button>
<Modal open={isOpen} title="提示">内容</Modal>
toast.success('操作成功')
```

---

## 模块总览

| 类别 | 组件 | 依赖原语 |
|------|------|----------|
| **原语** | `createFocusTrap`, `createClickAway`, `scrollLock`, `rovingTabIndex`, `createFloating` | — |
| **布局** | `Card`, `Divider`, `Space`, `Sidebar` | — |
| **按钮/操作** | `Button`, `Dropdown`, `Popover`, `Tooltip` | `createFloating`, `createClickAway` |
| **表单输入** | `Input`, `Textarea`, `Select`, `Checkbox`, `CheckboxGroup`, `RadioGroup`, `Switch`, `Slider` | — |
| **导航** | `Tabs`, `Breadcrumb`, `Pagination`, `Steps`, `Sidebar` | `rovingTabIndex` |
| **数据展示** | `Table`, `Badge`, `Avatar`, `Tag`, `Tree`, `Empty` | — |
| **反馈** | `Alert`, `Toast`, `Progress`, `Spinner`, `Skeleton` | — |
| **弹出层** | `Modal`, `Drawer`, `Popover`, `Tooltip`, `Dropdown` | `createFocusTrap`, `scrollLock`, `createFloating` |
| **折叠** | `Accordion` | — |

---

## 快速开始

```tsx
import { signal, computed } from 'weifuwu/client'
import {
  // 布局
  Card, CardHeader, CardTitle, CardContent, CardFooter,
  Divider, Space,
  // 表单
  Button, Input, Textarea, Select, CheckboxGroup, RadioGroup,
  Switch, Slider,
  // 导航
  Tabs, TabList, Tab, TabPanel, Breadcrumb, Pagination, Steps, Sidebar,
  // 数据
  Table, Badge, Avatar, Tag, Tree, Empty,
  // 反馈
  Alert, toast, ToastContainer, Progress, Spinner, Skeleton,
  // 弹出层
  Modal, Drawer, Dropdown, Tooltip, Popover,
  // 折叠
  Accordion, AccordionItem,
  // 原语
  createFocusTrap, createClickAway, scrollLock, rovingTabIndex, createFloating,
} from '@weifuwujs/components'

// 所有 Signal 驱动的组件直接接收 signal
const count = signal(0)
const isOpen = signal(false)
const tab = signal('overview')

function App() {
  return (
    <Space gap="md">
      <Button onClick={() => count.value++}>{count.value}</Button>
      <Modal open={isOpen} title="提示">内容</Modal>
      <ToastContainer />
    </Space>
  )
}
```

---

## 组件详解

### 原语层

```ts
import { createFocusTrap, createClickAway, scrollLock, rovingTabIndex, createFloating } from '@weifuwujs/components'
```

| 函数 | 签名 | 说明 |
|------|------|------|
| `createFocusTrap` | `(el: HTMLElement) => () => void` | 焦点锁定在元素内，Tab/Shift+Tab 循环 |
| `createClickAway` | `(el: HTMLElement, fn) => () => void` | 元素外点击检测 |
| `scrollLock` | `(el?: HTMLElement) => () => void` | 背景滚动锁定，补偿滚动条宽度 |
| `rovingTabIndex` | `(container, getItems, opts?) => () => void` | 键盘箭头导航，支持 orientation/wrap |
| `createFloating` | `(anchor, floating, opts?) => () => void` | 浮动定位，12 方向 + autoFlip |

---

### 布局

#### Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
    <CardDescription>描述文字</CardDescription>
  </CardHeader>
  <CardContent>主要内容</CardContent>
  <CardFooter><Button>保存</Button></CardFooter>
</Card>
```

| 组件 | Props | 说明 |
|------|-------|------|
| `Card` | `class?` | 白色圆角卡片容器 |
| `CardHeader` | `class?` | 顶部区域，带下分割线 |
| `CardTitle` | `class?` | `<h3>` 标题 |
| `CardDescription` | `class?` | 灰色说明文字 |
| `CardContent` | `class?` | 主内容区域 |
| `CardFooter` | `class?` | 底部区域，带上分割线 |

#### Divider

```tsx
<Divider />                    // 简单分割线
<Divider label="或" />         // 带文字分割线
```

| Props | 默认 | 说明 |
|-------|------|------|
| `label?` | — | 分割线中间文字 |
| `class?` | — | 额外 class |

#### Space

```tsx
<Space gap="md">
  <Button>保存</Button>
  <Button variant="outline">取消</Button>
</Space>
<Space direction="vertical" gap="lg">...</Space>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `direction` | `'horizontal'` | 排列方向 |
| `gap` | `'md'` | 间距：`xs`/`sm`/`md`/`lg` 或 `number` |
| `align` | `'center'` | 对齐方式 |

#### Sidebar

```tsx
<Sidebar
  collapsed={sidebarOpen}
  items={[
    { key: '/dashboard', icon: '📊', label: '概览' },
    { type: 'group', label: '数据' },
    { key: '/dashboard/users', icon: '👥', label: '用户管理', badge: '3' },
  ]}
/>
```

自动集成 `ctx.route.path` 高亮当前项。点击调用 `ctx.app.navigate()`。

| Props | 默认 | 说明 |
|-------|------|------|
| `items` | — | 菜单项数组 |
| `collapsed` | — | 折叠状态信号 |
| `onNavigate` | — | 导航回调 |

`SidebarItem` 类型：`{ key?, label, icon?, type?: 'item'|'group', children?, badge? }`

---

### 按钮/操作

#### Button

```tsx
<Button variant="primary" size="md" disabled onClick={() => save()}>
  保存
</Button>
<Button variant="outline" size="sm">取消</Button>
<Button variant="danger" size="lg">删除</Button>
<Button variant="ghost">更多</Button>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `variant` | `'primary'` | `primary`/`secondary`/`outline`/`ghost`/`danger` |
| `size` | `'md'` | `sm`/`md`/`lg` |
| `disabled` | `false` | 禁用状态 |
| `type` | `'button'` | 原生 `button` type |

#### Dropdown

```tsx
<Dropdown
  trigger={<Button variant="outline">操作</Button>}
  items={[
    { label: '编辑', onClick: () => edit(item) },
    { label: '删除', onClick: () => remove(item), variant: 'danger' },
    { type: 'separator' },
    { label: '详情', onClick: () => view(item) },
  ]}
  placement="bottom-end"
/>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `trigger` | — | 触发按钮 (JSX) |
| `items` | — | `DropdownItem[]` |
| `placement` | `'bottom-end'` | 菜单弹出位置 |

`DropdownItem`: `{ label?, onClick?, variant?: 'default'|'danger', disabled?, icon?, type?: 'item'|'separator' }`

#### Tooltip

```tsx
<Tooltip content="保存草稿" placement="top">
  <Button>💾</Button>
</Tooltip>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `content` | — | 提示文字 |
| `placement` | `'top'` | 12 个方向 |
| `delay` | `200` | 悬停延迟 (ms) |

#### Popover

```tsx
<Popover
  content={<div class="p-4"><p>弹出内容</p></div>}
  placement="bottom"
  trigger="click"
>
  <Button>点击弹出</Button>
</Popover>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `content` | — | 弹出内容 (任意 JSX) |
| `placement` | `'bottom'` | 12 个方向 |
| `trigger` | `'click'` | `click` 或 `hover` |

---

### 表单输入

#### Input

```tsx
const name = signal('')
<Input value={name} placeholder="请输入姓名" />

<Input value={email} label="邮箱" error={emailError} required />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | — | `Signal<string>` |
| `label` | — | 输入框标签 |
| `error` | — | 错误信息 (string 或 Signal) |
| `required` | — | 是否必填 |
| `type` | `'text'` | 原生 input type |

#### Textarea

```tsx
<Textarea value={bio} placeholder="自我介绍" rows={4} autoResize />
<Textarea label="备注" error={err} />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | — | `Signal<string>` |
| `autoResize` | `true` | 自动伸缩高度 |
| `rows` | `3` | 初始行数 |
| `label` | — | 标签 |

#### Select

```tsx
const city = signal('')
<Select
  value={city}
  options={[
    { value: 'beijing', label: '北京' },
    { value: 'shanghai', label: '上海' },
  ]}
  placeholder="选择城市"
  searchable
/>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | — | `Signal<string>` |
| `options` | — | `SelectOption[]` |
| `searchable` | `false` | 是否可搜索 |
| `placeholder` | `'请选择'` | 占位文字 |

#### Checkbox / CheckboxGroup

```tsx
const checked = signal(false)
<Checkbox value={checked}>同意条款</Checkbox>

const selected = signal<string[]>(['vue'])
<CheckboxGroup value={selected} options={[
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
]} />
```

`Checkbox` Props: `value?: Signal<boolean>`, `disabled?`, `children?`

`CheckboxGroup` Props: `value?: Signal<string[]>`, `options: CheckboxOption[]`, `direction?: 'horizontal'|'vertical'`

#### RadioGroup

```tsx
const selected = signal('option-1')
<RadioGroup value={selected} options={[
  { value: 'option-1', label: '选项一' },
  { value: 'option-2', label: '选项二' },
]} />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | — | `Signal<string>` |
| `options` | — | `RadioOption[]` |
| `direction` | `'vertical'` | 排列方向 |

#### Switch

```tsx
const enabled = signal(false)
<Switch value={enabled} label="启用通知" />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | — | `Signal<boolean>` |
| `label` | — | 显示标签 |
| `disabled` | — | 禁用状态 |

#### Slider

```tsx
const value = signal(50)
<Slider value={value} min={0} max={100} step={10} showValue />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | — | `Signal<number>` |
| `min` | `0` | 最小值 |
| `max` | `100` | 最大值 |
| `step` | `1` | 步长 |
| `showValue` | `false` | 显示当前值 |

---

### 导航

#### Tabs

```tsx
const tab = signal('overview')
<Tabs value={tab}>
  <TabList>
    <Tab value="overview">概览</Tab>
    <Tab value="details">详情</Tab>
  </TabList>
  <TabPanel value="overview">概览内容</TabPanel>
  <TabPanel value="details">详情内容</TabPanel>
</Tabs>
```

| 组件 | Props | 说明 |
|------|-------|------|
| `Tabs` | `value: Signal<string>`, `children` | 容器 |
| `TabList` | `children` | Tab 按钮容器 |
| `Tab` | `value: string`, `disabled?` | 单个标签页按钮 |
| `TabPanel` | `value: string`, `children` | 标签页内容 |

#### Accordion

```tsx
<Accordion>
  <AccordionItem value="1" title="标题一">内容一</AccordionItem>
  <AccordionItem value="2" title="标题二">内容二</AccordionItem>
</Accordion>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | — | `Signal<string\|null>` 外部控制 |
| `defaultValue` | — | 默认展开项 |

`AccordionItem`: `value: string`, `title: string`, `children`

#### Breadcrumb

```tsx
<Breadcrumb items={[
  { label: '首页', href: '/' },
  { label: '用户管理', href: '/users' },
  { label: '详情' },
]} separator="·"
/>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `items` | — | `BreadcrumbItem[]` |
| `separator` | `'/'` | 分隔符文字 |

`BreadcrumbItem`: `{ label: string, href?: string }`

#### Pagination

```tsx
<Pagination current={page} total={100} onChange={(p) => page.value = p} showTotal />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `current` | — | 当前页 (number 或 Signal) |
| `total` | — | 总条数 |
| `pageSize` | `10` | 每页条数 |
| `showTotal` | `false` | 显示"共 N 条" |

#### Steps

```tsx
const step = signal(1)
<Steps current={step}>
  <Steps.Step title="基本信息" description="填写姓名和邮箱" />
  <Steps.Step title="详细资料" />
  <Steps.Step title="完成" />
</Steps>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `current` | — | 当前步骤 (number 或 Signal) |
| `direction` | `'vertical'` | `vertical`/`horizontal` |

`Steps.Step`: `title: string`, `description?: string`

---

### 数据展示

#### Table

```tsx
<Table
  columns={[
    { key: 'name', title: '姓名', sortable: true },
    { key: 'age', title: '年龄', sortable: true },
    { key: 'city', title: '城市' },
    { key: 'action', title: '操作', render: (_, record) => <Button>编辑</Button> },
  ]}
  data={[
    { id: 1, name: '张三', age: 28, city: '北京' },
    { id: 2, name: '李四', age: 32, city: '上海' },
  ]}
  rowKey="id"
  striped
  bordered
/>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `columns` | — | `TableColumn[]` |
| `data` | — | 数据数组 |
| `rowKey` | `'id'` | 行 key 字段或函数 |
| `bordered` | `false` | 单元格边框 |
| `striped` | `false` | 斑马纹 |
| `size` | `'md'` | `sm`/`md`/`lg` |
| `emptyText` | `'暂无数据'` | 空数据提示 |

`TableColumn`: `{ key, title, sortable?, width?, render?, align? }`

#### Badge

```tsx
<Badge variant="success">已通过</Badge>
<Badge variant="danger">错误</Badge>
<Badge variant="outline">草稿</Badge>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `variant` | `'default'` | `default`/`secondary`/`success`/`warning`/`danger`/`outline` |

#### Avatar

```tsx
<Avatar src="/user.jpg" alt="用户" />
<Avatar fallback="张" />
<AvatarGroup>
  <Avatar src="/a.jpg" />
  <Avatar src="/b.jpg" />
</AvatarGroup>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `src` | — | 图片 URL |
| `fallback` | — | 无图片时显示文字 |
| `size` | `'md'` | `sm`/`md`/`lg` |

#### Tag

```tsx
<Tag>前端</Tag>
<Tag variant="success" closable onClose={() => remove(tag)}>已通过</Tag>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `variant` | `'default'` | `default`/`primary`/`success`/`warning`/`danger` |
| `closable` | — | 是否可关闭 |
| `onClose` | — | 关闭回调 |
| `size` | `'md'` | `sm`/`md` |

#### Tree

```tsx
const treeData = [
  {
    key: 'src', title: 'src',
    children: [
      { key: 'src/index.ts', title: 'index.ts' },
      { key: 'src/components', title: 'components', children: [
        { key: 'src/components/button.tsx', title: 'button.tsx' },
      ]},
    ],
  },
]
<Tree data={treeData} defaultExpandedKeys={['src']} onSelect={(k) => console.log(k)} />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `data` | — | `TreeNode[]` |
| `defaultExpandedKeys` | — | 默认展开节点 key 数组 |
| `selectedKey` | — | `Signal<string\|null>` 选中控制 |
| `onSelect` | — | 选中回调 |

`TreeNode`: `{ key, title, icon?, children?, disabled? }`

#### Empty

```tsx
<Empty description="暂无数据" />
<Empty icon="📦">
  <Button>新建</Button>
</Empty>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `icon` | `'📭'` | 图标 |
| `description` | `'暂无数据'` | 描述文字 |

---

### 反馈

#### Alert

```tsx
<Alert variant="error" title="操作失败">请稍后重试</Alert>
<Alert variant="success">保存成功</Alert>
<Alert variant="warning">即将到期</Alert>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `variant` | `'info'` | `info`/`success`/`warning`/`error` |
| `title` | — | 标题 |

#### Toast

```tsx
// 1. 在 App 根组件挂载一次
<ToastContainer />

// 2. 任意位置调用
toast.success('保存成功')
toast.error('操作失败', { duration: 5000 })
toast.info('提示信息')
toast.warning('警告')
```

| 函数 | 说明 |
|------|------|
| `toast.success(msg, opts?)` | 成功提示 |
| `toast.error(msg, opts?)` | 错误提示 |
| `toast.info(msg, opts?)` | 信息提示 |
| `toast.warning(msg, opts?)` | 警告提示 |

`ToastOptions`: `{ duration?: number, description?: string }`

#### Progress

```tsx
<Progress value={65} />
<Progress value={100} variant="success" showLabel />
<Progress value={30} variant="warning" size="sm" />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `value` | `0` | 当前值 |
| `max` | `100` | 最大值 |
| `variant` | `'default'` | `default`/`success`/`warning` |
| `size` | `'md'` | `sm`/`md` |
| `showLabel` | `false` | 显示百分比 |

#### Spinner

```tsx
<Spinner />
<Spinner size="lg" />
<Spinner size="sm" class="text-blue-600" />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `size` | `'md'` | `sm`/`md`/`lg` |

#### Skeleton

```tsx
<Skeleton class="h-4 w-32" />
<Skeleton variant="circle" size="lg" />
<Skeleton variant="rect" class="h-32 w-full" />
```

| Props | 默认 | 说明 |
|-------|------|------|
| `variant` | `'text'` | `text`/`circle`/`rect` |
| `size` | `'md'` | `sm`/`md`/`lg` (circle 模式) |

---

### 弹出层

#### Modal

```tsx
const isOpen = signal(false)
<Button onClick={() => isOpen.value = true}>打开弹窗</Button>

<Modal open={isOpen} title="确认删除" size="sm" onClose={() => isOpen.value = false}>
  <p>确定要删除这条记录吗？</p>
  <Space>
    <Button variant="danger" onClick={onDelete}>删除</Button>
    <Button variant="outline" onClick={() => isOpen.value = false}>取消</Button>
  </Space>
</Modal>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `open` | — | `Signal<boolean>` 控制显示 |
| `title` | — | 对话框标题 |
| `size` | `'md'` | `sm`/`md`/`lg`/`full` |
| `closeOnOverlay` | `true` | 点击遮罩关闭 |

功能：焦点锁定、背景滚动锁定、Escape 关闭。

#### Drawer

```tsx
const isOpen = signal(false)
<Drawer open={isOpen} title="详情" placement="right" size="md" onClose={() => isOpen.value = false}>
  <p>抽屉内容</p>
</Drawer>
```

| Props | 默认 | 说明 |
|-------|------|------|
| `open` | — | `Signal<boolean>` |
| `title` | — | 标题 |
| `placement` | `'right'` | `left`/`right` |
| `size` | `'md'` | `sm`/`md`/`lg` |
| `closeOnOverlay` | `true` | 点击遮罩关闭 |

功能：焦点锁定、背景滚动锁定、Escape 关闭。

---

## 架构设计

```
@weifuwujs/components
│
├── Primitive Layer          ← 5 个 DOM 行为原语
│   ├── createFocusTrap      <Modal>, <Drawer>
│   ├── createClickAway      <Dropdown>, <Popover>
│   ├── scrollLock           <Modal>, <Drawer>
│   ├── rovingTabIndex       <Tabs>, <Select>
│   └── createFloating       <Tooltip>, <Popover>, <Dropdown>, <Select>
│
├── Component Layer          ← 33 个组件
│   ├── Pure CSS (12)        无 JS 行为
│   ├── Signal-driven (8)    signal + computed 控制
│   └── Portal + Primitive (13) createPortal + 原语层
│
└── Runtime Dependency
    └── weifuwu/client       signal, computed, createPortal, Show, For
```

组件不引入额外运行时。所有状态管理使用 weifuwu/client 的信号系统，与核心框架共享同一套响应式模型。

---

## 不包含（应在应用层实现）

- **DatePicker / TimePicker** — 日期逻辑复杂，推荐使用 `wrap()` 封装现有库
- **Upload** — 业务逻辑差异大
- **ColorPicker** — 使用场景有限
- **Chart** — 推荐 `wrap(echarts)` 或 `wrap(recharts)`
- **Video / Audio** — 直接使用原生 HTML5 元素

---

## React 开发者对照

| React + shadcn/ui | @weifuwujs/components |
|-------------------|----------------------|
| `useState(false)` + `<Dialog open={open} onOpenChange={setOpen}>` | `const open = signal(false)` + `<Modal open={open}>` |
| `useFormik({...})` | `useForm({...})` (weifuwu/client) |
| `<Table data={data} />` + 手动排序 | `<Table columns={cols} data={data} sortable />` |
| `toast()` (sonner) | `toast.success()` |
| `useNavigate()` | `ctx.app.navigate()` |
| `<Select value={v} onValueChange={setV}>` | `<Select value={signalV}>` |

---

## 构建

```bash
npm run build       # esbuild → dist/index.js (62.9kB)
npm run typecheck   # tsc --noEmit
```
