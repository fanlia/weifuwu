/**
 * weifuwu/components cheatsheet
 *
 * 每个 demo 组件都是 (initProps, ctx) => (props) => VNode，
 * 使用闭包变量 + ctx.ui.render() 管理交互状态。
 *
 * 启动: node apps/components-demo/server.ts
 */

import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { createRouter, h, stream, evKey } from 'weifuwu/ui-dom'
import { v3Toast, v3Confirm } from 'weifuwu/ui-dom'
import {
  Button, Input, Textarea, Select,
  Checkbox, Switch, RadioGroup, Slider,
  Form, Field, SearchInput, SegmentedControl, ProgressBar,
  Table, Modal, Toast, Alert, Loading, EmptyState,
  Card, Badge, Tag, Avatar, StatCard, Steps,
  Tabs, Dropdown, Pagination, Accordion,
  Breadcrumb, Divider, FileUpload, Tooltip, Drawer, Popover, Skeleton, Img,
  InView, DatePicker, Chart, Editor, ThemeSwitch,
  AiChat, ChatInput, AuthPage, ToolCallCard, ApprovalCard, PageHeader, Icon,
  Markdown, CodeBlock, Timeline, InputNumber, Descriptions, AvatarGroup, MessageBubble,
  Menu, PasswordInput, TagsInput, Highlight, List, Result,
  Rate, Title, Text, Paragraph, Label, AspectRatio,
  Toggle, ToggleGroup, CheckboxGroup, PinInput, CopyButton, ColorPicker,
  BackTop, Affix, HoverCard, Notification, ContextMenu, Mentions,
  Collapse, Tree, Cascader, Transfer, Command, Menubar, Carousel, Resizable, Calendar, Watermark,
  VirtualList, VirtualTable, InfiniteScroll, QRCode, Anchor, LogViewer, JSONViewer, DiffView, Sparkline, Tour, Kanban, Pipeline, TreeSelect,
  Layout, LayoutHeader, LayoutSider, LayoutContent, LayoutFooter, Popconfirm, AutoComplete, Link,
  Space, Grid, Col, Scrollbar, AlertGroup, FloatButton, FloatButtonGroup, NavMenu,
  JsonSchemaForm, ReasoningBlock, CitationCard, SessionList,
} from 'weifuwu/components'
import type { ToastItem, ToastType, ToastPosition, ToastInjected, JsonSchema } from 'weifuwu/components'

// ── 布局组件 ──────────────────────────────────────────

// ── 搜索过滤态（App 写、Section 读——单页 demo 免逐卡片 props 传递）──
const cardFilter = { q: '' }
const matchCard = (title: string, desc?: string) => {
  if (!cardFilter.q) return true
  const q = cardFilter.q.trim().toLowerCase()
  return title.toLowerCase().includes(q) || (desc ?? '').toLowerCase().includes(q)
}

const SECTIONS = ['表单核心', '表单选择', '表单增强', '数据展示', '数据反馈', '导航组件', 'AI 对话', '其他', '新增批次']
const secId = (t: string) => `sec-${t}`
const cardId = (t: string) => `c-${t.replace(/[^\w一-龥-]+/g, '-')}`

function Section(_initProps: { title: string; children: any }, _ctx: any) {
  // 全量渲染（无懒渲染）：所有分组一次建树，搜索即时全局过滤——方便快速定位组件
  // §3.1 纪律：renderFn 必须用渲染期 props（最新）——不得用 mount 捕获的 initProps 渲染
  // （否则 children 永远是首次挂载的 vnode 对象——搜索过滤 dispose 后重发的同对象
  //  既是旧树又是新树 → 自 dispose → 卡片错位/消失）
  return (props: { title: string; children: any }) => {
    const searching = !!cardFilter.q
    const kids = (Array.isArray(props.children) ? props.children : [props.children]).filter(Boolean)
    const visible = searching ? kids.filter((v: any) => matchCard(String(v?.props?.title ?? ''), String(v?.props?.desc ?? ''))) : kids
    // DemoCard 业务 key（title——搜索过滤/恢复时卡片身份稳定：copied 等内部状态不错位；
    // 审计抓出：过滤长度变化 + 无 key 组件 → 动态数组位置错位风险）
    for (const v of visible) {
      if (v && typeof v === 'object' && !Array.isArray(v) && (v as any).key == null) {
        ;(v as any).key = String((v as any).props?.title ?? '')
      }
    }
    if (searching && visible.length === 0) return null // 搜索时隐藏空分组
    return (
      <section class="wf-stack wf-gap-lg" id={secId(props.title)}>
        <h2 class="wf-text-2xl wf-m-0 wf-border-b wf-pb-sm">{props.title}</h2>
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 420px), 1fr))">{visible}</div>
      </section>
    )
  }
}

function DemoCard(initProps: { title: string; desc: string; code: string; children: any }, ctx: any) {
  let copied = false
  // §3.1 纪律：renderFn 用渲染期 props（最新）——mount 捕获的 initProps 不得用于渲染
  return (props: { title: string; desc: string; code: string; children: any }) => (
    <div class="wf-surface wf-border wf-rounded-md wf-clip" id={cardId(props.title)}>
      <h3 class="wf-text-base wf-text-semibold wf-p-md wf-bg-secondary wf-border-b wf-m-0">{props.title}</h3>
      <div class="wf-p-md wf-row wf-gap-sm wf-cluster wf-border-b wf-scroll">{props.children}</div>
      <div class="wf-px-md wf-py-sm wf-text-xs wf-text-secondary">{props.desc}</div>
      {/* S0：代码块默认收起（<details> 原生折叠——36% 页面高度退出渲染树）+ 复制按钮 */}
      <details>
        <summary class="wf-row wf-between wf-gap-sm wf-px-md wf-py-sm wf-text-xs wf-text-secondary" style="cursor:pointer">
          <span>{copied ? '✓ 已复制' : '查看代码'}</span>
          <button
            type="button"
            class="wf-btn wf-btn--sm"
            onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); void (ctx as any)?.browser?.copyText?.(props.code); copied = true; ctx.ui.render() }}
          >复制</button>
        </summary>
        <pre class="wf-bg-tertiary wf-p-md wf-text-xs wf-m-0 wf-scroll">{props.code}</pre>
      </details>
    </div>
  )
}

// ── 交互型 Demo 组件 ──────────────────────────────────

const DemoButton: Component = async (_props, ctx) => {
  let loading = false
  let count = 0
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        <Button variant="primary" onClick={() => { count++; ctx.ui.render() }}>点击 {count} 次</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </div>
      <div class="wf-row">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <div class="wf-row">
        <Button loading={loading} onClick={() => { loading = true; ctx.ui.render(); setTimeout(() => { loading = false; ctx.ui.render() }, 1500) }}>点我 Loading</Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" block>Block</Button>
      </div>
    </div>
  )
}

const DemoInput: Component = async (_props, ctx) => {
  let text = '可编辑'
  let email = ''
  let pwd = ''
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Input label="文本" value={text} onInput={e => { text = (e.target as HTMLInputElement).value; ctx.ui.render() }} />
      <Input label="邮箱" type="email" placeholder="name@example.com" required value={email} onInput={e => { email = (e.target as HTMLInputElement).value; ctx.ui.render() }} />
      <Input label="密码" type="password" placeholder="••••••••" value={pwd} onInput={e => { pwd = (e.target as HTMLInputElement).value; ctx.ui.render() }} />
      <Input label="错误状态" error="请输入有效内容" />
      <Input label="带提示" hint="只能包含字母和数字" />
      <Input label="颜色" type="color" value="#ff6600" onInput={e => (e.target as HTMLInputElement).value} />
    </div>
  )
}

const DemoTextarea: Component = async (_props, ctx) => {
  let bio = '可编辑文本'
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Textarea label="简介" value={bio} onInput={e => { bio = (e.target as HTMLTextAreaElement).value; ctx.ui.render() }} rows={3} />
      <Textarea label="错误状态" error="内容不能为空" rows={2} />
      <Textarea label="带提示" hint="最多 500 字" rows={2} />
    </div>
  )
}

const DemoSelect: Component = async (_props, ctx) => {
  let role = ''
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Select label="原生 select" placeholder="请选择"
        value={role}
        onChange={v => { role = v as string; ctx.ui.render() }}
        options={[
          { value: 'admin', label: '管理员' },
          { value: 'user', label: '普通用户' },
          { value: 'guest', label: '访客' },
        ]} />
      <div class="wf-text-xs wf-text-secondary">当前值: {role || '(未选择)'}</div>
      <Select label="带错误" error="请选择角色" options={[{ value: 'a', label: '选项 A' }]} />
      <Select label="分组选项（optgroup）" placeholder="选择城市"
        options={[
          { label: '一线', options: [{ value: 'bj', label: '北京' }, { value: 'sh', label: '上海' }] },
          { label: '二线', options: [{ value: 'hz', label: '杭州' }] },
          { value: 'other', label: '其他' },
        ]} />
    </div>
  )
}

const DemoCheckbox: Component = async (_props, ctx) => {
  let agree = false
  let remember = true
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <Checkbox label="已阅读并同意协议" checked={agree} onChange={v => { agree = v; ctx.ui.render() }} />
      <Checkbox label="记住登录状态" checked={remember} onChange={v => { remember = v; ctx.ui.render() }} />
      <Checkbox label="不可选 (disabled)" disabled />
      <div class="wf-text-xs wf-text-secondary">同意: {String(agree)}, 记住: {String(remember)}</div>
    </div>
  )
}

const DemoSwitch: Component = async (_props, ctx) => {
  let notify = true
  let auto = false
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <Switch label="启用通知" checked={notify} onChange={v => { notify = v; ctx.ui.render() }} />
      <Switch label="自动更新" checked={auto} onChange={v => { auto = v; ctx.ui.render() }} />
      <Switch label="已禁用 (disabled)" disabled checked />
      <div class="wf-text-xs wf-text-secondary">通知: {notify ? '开' : '关'}, 自动更新: {auto ? '开' : '关'}</div>
    </div>
  )
}

const DemoRadio: Component = async (_props, ctx) => {
  let gender = 'male'
  let inline = 'a'
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <RadioGroup name="gender" value={gender} onChange={v => { gender = v; ctx.ui.render() }}
        options={[
          { value: 'male', label: '男' },
          { value: 'female', label: '女' },
          { value: 'other', label: '其他' },
        ]} />
      <RadioGroup name="inline" value={inline} inline onChange={v => { inline = v; ctx.ui.render() }}
        options={[
          { value: 'a', label: '选项 A' },
          { value: 'b', label: '选项 B' },
        ]} />
      <div class="wf-text-xs wf-text-secondary">选择: {gender}</div>
    </div>
  )
}

const DemoSegmented: Component = async (_props, ctx) => {
  let mode = 'ai'
  let size: 'sm' | 'md' = 'md'
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <SegmentedControl ariaLabel="生成方式"
        value={mode}
        onChange={v => { mode = v; ctx.ui.render() }}
        options={[
          { value: 'ai', label: '🤖 AI 生成' },
          { value: 'manual', label: '手动编写' },
          { value: 'template', label: '模板' },
        ]} />
      <SegmentedControl size="sm" ariaLabel="尺寸"
        value={size}
        onChange={v => { size = v as any; ctx.ui.render() }}
        options={[{ value: 'sm', label: '小' }, { value: 'md', label: '中' }]} />
      <div class="wf-text-xs wf-text-secondary">当前模式: {mode}</div>
    </div>
  )
}

const DemoSlider: Component = async (_props, ctx) => {
  let volume = 60
  let brightness = 30
  let price = 800
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Slider label="音量" value={volume} onChange={v => { volume = v; ctx.ui.render() }} />
      <Slider label="亮度" value={brightness} min={0} max={100} onChange={v => { brightness = v; ctx.ui.render() }} />
      <Slider label="价格" value={price} min={0} max={2000} step={50}
        marks={[{ value: 0, label: '0' }, { value: 500 }, { value: 1000 }, { value: 1500 }, { value: 2000, label: '2000' }]}
        onChange={v => { price = v; ctx.ui.render() }}
        onChangeEnd={v => console.log('价格调整完成:', v)} />
    </div>
  )
}

const DemoForm: Component = async (_props, ctx) => {
  let errors = {} as Record<string, string>
  let submitted = false
  const rerender = () => ctx.ui.render()

  return async (_p: any) => (
    <Form
      validation={{
        username: [{ required: true, message: '请输入用户名' }],
        email: [{ required: true, pattern: /@/, message: '请输入有效邮箱' }],
      }}
      onSubmit={() => { submitted = true; rerender() }}
      onError={(e) => { errors = e; rerender() }}>
      <Field label="用户名" error={errors.username}>
        <Input name="username" placeholder="输入用户名" />
      </Field>
      <Field label="邮箱" error={errors.email}>
        <Input name="email" type="email" placeholder="email@example.com" />
      </Field>
      {submitted && <Alert variant="success">表单已提交！</Alert>}
      <Button type="submit" variant="primary">提交表单</Button>
    </Form>
  )
}

const DemoFormSubmit: Component = async (_props, ctx) => {
  let loading = false
  let done = false
  return async (_p: any) => (
    <Form
      validation={{
        name: [{ required: true, minLength: 2, message: '名称至少 2 字符' }],
      }}
      onSubmit={() => {
        if (loading) return
        loading = true; done = false; ctx.ui.render()
        setTimeout(() => { loading = false; done = true; ctx.ui.render() }, 1200)
      }}>
      <Field label="项目名称" required>
        <Input name="name" placeholder="输入项目名称" disabled={loading} />
      </Field>
      {done && <Alert variant="success">提交成功（模拟 1.2s）</Alert>}
      <Button type="submit" variant="primary" loading={loading}>{loading ? '提交中…' : '提交'}</Button>
    </Form>
  )
}

const DemoField: Component = async (_props, ctx) => {
  let name = ''
  let mail = 'bad-input'
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Field label="姓名" required><Input placeholder="输入姓名" value={name} onInput={e => { name = (e.target as HTMLInputElement).value; ctx.ui.render() }} /></Field>
      <Field label="邮箱" error="邮箱格式不正确"><Input type="email" value={mail} /></Field>
      <Field label="密码" hint="至少 6 位"><Input type="password" /></Field>
    </div>
  )
}

const DemoSearchInput: Component = async (_props, ctx) => {
  let query = ''
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <SearchInput placeholder="搜索用户..." value={query} onInput={e => { query = (e.target as HTMLInputElement).value; ctx.ui.render() }} onClear={() => { query = ''; ctx.ui.render() }} />
      <div class="wf-text-xs wf-text-secondary">搜索词: {query || '(空)'}</div>
    </div>
  )
}

const DemoProgress: Component = async (_props, ctx) => {
  let pct = 45
  let started = false
  return async (_p: any) => {
    if (!started) {
      started = true
      const tick = () => {
        if (pct >= 100) return
        pct = Math.min(100, pct + 5)
        ctx.ui.render()
        if (pct < 100) setTimeout(tick, 800)
      }
      setTimeout(tick, 800)
    }
    return (
    <div class="wf-stack wf-gap-md wf-w-full">
      <ProgressBar value={pct} label="模拟进度" showValue />
      <ProgressBar value={100} label="已完成" showValue status="success" />
      <ProgressBar label="不确定态" /> {/* indeterminate */}
      <ProgressBar value={60} size="sm" label="小尺寸" showValue />
      <ProgressBar value={40} status="warning" showValue label="警告" />
    </div>
  )
  }
}

const DemoTable: Component = async (_props, ctx) => {
  let sortKey = 'name'
  let sortOrder: 'asc' | 'desc' = 'asc'
  let view = 'data' // 'data' | 'empty'
  const rerender = () => ctx.ui.render()
  const data = [
    { id: 1, name: '张三', role: '管理员', status: '活跃' },
    { id: 2, name: '李四', role: '编辑', status: '离线' },
    { id: 3, name: '王五', role: '访客', status: '活跃' },
  ]
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <div class="wf-row wf-gap-xs">
        <button class={`wf-btn wf-btn--sm ${view === 'data' ? 'wf-btn--primary' : 'wf-btn--secondary'}`} onClick={() => { view = 'data'; rerender() }}>有数据</button>
        <button class={`wf-btn wf-btn--sm ${view === 'empty' ? 'wf-btn--primary' : 'wf-btn--secondary'}`} onClick={() => { view = 'empty'; rerender() }}>空态</button>
      </div>
      <Table data={view === 'empty' ? [] : data} columns={[
        { key: 'id', label: 'ID', width: 60 },
        { key: 'name', label: '姓名', sortable: true },
        { key: 'role', label: '角色', sortable: true },
        { key: 'status', label: '状态', render: v => <Badge variant={v === '活跃' ? 'success' : 'default'}>{v}</Badge> },
      ]}
        sortKey={sortKey} sortOrder={sortOrder}
        onSort={(key, order) => { sortKey = key; sortOrder = order; rerender() }} emptyText="暂无数据" />
      <div class="wf-text-xs wf-text-secondary">点击列头排序（姓名 / 角色）；切换查看空态</div>
    </div>
  )
}

const DemoModal: Component = async (_props, ctx) => {
  let open = false
  let width = '420px'
  let closable = true
  const rerender = () => ctx.ui.render()
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row wf-gap-sm">
        <Button variant="primary" onClick={() => { open = true; rerender() }}>打开弹窗</Button>
        <label class="wf-row wf-gap-xs wf-text-xs">
          <input type="checkbox" checked={closable} onChange={(e: any) => { closable = e.target.checked; rerender() }} />
          显示关闭按钮
        </label>
        <select value={width} onChange={(e: any) => { width = e.target.value; rerender() }} class="wf-text-xs" style="padding:2px 4px">
          <option value="360px">窄 (360px)</option>
          <option value="420px">中 (420px)</option>
          <option value="600px">宽 (600px)</option>
        </select>
      </div>
      <Modal open={open} title="确认操作" width={width} closable={closable}
        onClose={() => { open = false; rerender() }}
        footer={<Button variant="primary" onClick={() => { open = false; rerender() }}>确定</Button>}>
        <p>这是弹窗内容。试试切换右上角的设置。</p>
      </Modal>
    </div>
  )
}

const DemoToast: Component = async (_props, ctx) => {
  let toasts = [] as ToastItem[]
  let position: ToastPosition = 'top-right'
  const rerender = () => ctx.ui.render()
  function add(type: ToastType) {
    const id = String(Date.now())
    const msgs: Record<ToastType, string> = { success: '操作成功完成', error: '发生了一个错误', warning: '请注意：此操作不可撤销', info: '这是一条提示信息' }
    toasts = [...toasts, { id, type, message: msgs[type] }]; rerender()
    setTimeout(() => { toasts = toasts.filter((t: any) => t.id !== id); rerender() }, 3000)
  }
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        <Button variant="primary" onClick={() => add('success')}>成功</Button>
        <Button variant="danger" onClick={() => add('error')}>错误</Button>
        <Button variant="secondary" onClick={() => add('warning')}>警告</Button>
        <Button variant="ghost" onClick={() => add('info')}>信息</Button>
      </div>
      <div class="wf-row wf-gap-xs wf-text-xs wf-text-secondary">
        <span>位置:</span>
        <select value={position} onChange={(e: any) => { position = e.target.value; rerender() }}>
          <option value="top-right">右上</option>
          <option value="top-left">左上</option>
          <option value="bottom-right">右下</option>
          <option value="bottom-left">左下</option>
          <option value="top-center">顶部居中</option>
        </select>
      </div>
      <Toast toasts={toasts} position={position} max={3}
        onRemove={id => { toasts = toasts.filter((t: any) => t.id !== id); rerender() }} />
    </div>
  )
}

const DemoAlert: Component = async (_props, ctx) => {
  let showErr = true
  let showInfo = true
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      {showInfo && <Alert variant="info" closable onClose={() => { showInfo = false; ctx.ui.render() }}>这是一条提示信息（可关闭）</Alert>}
      <Alert variant="success">操作成功完成</Alert>
      <Alert variant="warning">请注意：此操作不可撤销</Alert>
      {showErr && <Alert variant="error" closable onClose={() => { showErr = false; ctx.ui.render() }}>发生了一个错误（可关闭）</Alert>}
    </div>
  )
}

const DemoLoading: Component = async (_props, ctx) => {
  let loading = true
  let started = false
  return async (_p: any) => {
    if (!started) {
      started = true
      setTimeout(() => { loading = false; ctx.ui.render() }, 3000)
    }
    return (
    <div class="wf-row wf-gap-lg">
      {loading ? <Loading text="加载中（3秒后消失）..." /> : <Alert variant="success">加载完成</Alert>}
    </div>
  )
  }
}

const DemoSkeleton: Component = async () => async () => (
  <div class="wf-stack wf-gap-md">
    <div class="wf-row wf-gap-md">
      <Skeleton variant="avatar" />
      <div class="wf-stack wf-row wf-gap-xs wf-fill">
        <Skeleton width="60%" />
        <Skeleton />
      </div>
    </div>
    <Skeleton variant="image" />
    <Skeleton variant="table" lines={3} cols={4} />
    <Skeleton variant="rect" width="100%" height={80} />
    <Skeleton variant="circle" width={40} height={40} />
    <Skeleton lines={3} />
  </div>
)

const DemoEmptyState: Component = async (_props, ctx) => {
  let hasData = false
  return async (_p: any) => (
    <div class="wf-w-full">
      {hasData
        ? <div class="wf-stack wf-gap-sm wf-text-center wf-p-lg">
            <p>数据已添加</p>
            <Button variant="ghost" onClick={() => { hasData = false; ctx.ui.render() }}>清空</Button>
          </div>
        : <EmptyState text="暂无数据" hint="点击按钮创建第一个项目">
            <Button variant="primary" onClick={() => { hasData = true; ctx.ui.render() }}>创建项目</Button>
          </EmptyState>}
    </div>
  )
}

const DemoCardShowcase: Component = async (_props, ctx) => {
  let clicked = false
  return async (_p: any) => (
    <div class="wf-row wf-gap-md wf-cluster">
      <Card>默认卡片</Card>
      <Card variant="outlined">线框卡片</Card>
      <Card clickable onClick={() => { clicked = true; ctx.ui.render() }}>可点击卡片</Card>
      {clicked && <div class="wf-text-xs wf-w-full wf-text-secondary">卡片被点击了</div>}
    </div>
  )
}

const DemoBadge: Component = async () => async () => (
  <div class="wf-row wf-gap-sm wf-cluster">
    <Badge>默认</Badge>
    <Badge variant="primary">主要</Badge>
    <Badge variant="success">成功</Badge>
    <Badge variant="warning">警告</Badge>
    <Badge variant="danger">危险</Badge>
    <Badge variant="info">信息</Badge>
    <Badge dot variant="success" /> 在线
    <Badge dot variant="danger" />  离线
    <Badge count={5} variant="danger" />
    <Badge count={150} variant="danger" />
    <Badge count={0} showZero />
  </div>
)

const DemoTag: Component = async (_props, ctx) => {
  let tags = ['可关闭标签', '删除我']
  return async (_p: any) => (
    <div class="wf-row wf-gap-sm wf-cluster">
      <Tag>默认标签</Tag>
      <Tag variant="primary">主要标签</Tag>
      <Tag variant="success">完成</Tag>
      <Tag variant="danger">错误</Tag>
      {tags.map((t: string, i: number) => (
        <Tag key={t} closable onClose={() => { tags = tags.filter((_: any, j: number) => j !== i); ctx.ui.render() }}>{t}</Tag>
      ))}
    </div>
  )
}

const DemoAvatar: Component = async () => async () => (
  <div class="wf-row wf-gap-md wf-bottom">
    <Avatar name="张三" />
    <Avatar name="李四" size="sm" />
    <Avatar name="王五" size="lg" />
    <Avatar name="系统用户" />
  </div>
)

const DemoStatCard: Component = async () => async () => (
  <div class="wf-row wf-gap-md wf-cluster">
    <StatCard label="总用户" value="1,234" icon={<Icon name="users" size={24} className="wf-text-primary" />} trend="up" trendLabel="12%" />
    <StatCard label="收入" value="¥89,000" icon={<Icon name="bar-chart" size={24} className="wf-text-primary" />} trend="up" trendLabel="8%" />
    <StatCard label="退款" value="¥1,200" icon={<Icon name="warning" size={24} className="wf-text-warning" />} trend="down" trendLabel="-3%" />
    <StatCard label="在线用户" value={1234} animate icon={<Icon name="activity" size={24} className="wf-text-success" />} />
  </div>
)

const DemoSteps: Component = async (_props, ctx) => {
  let step = 'info'
  return async (_p: any) => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <Steps items={[
        { key: 'info', label: '填写信息', description: '表单信息' },
        { key: 'pay', label: '支付', description: '在线付款' },
        { key: 'done', label: '完成', description: '订单生效' },
      ]} active={step} />
      <div class="wf-row wf-gap-sm" style="justify-content:center">
        <Button size="sm" variant="secondary" onClick={() => { step = 'info'; ctx.ui.render() }}>第一步</Button>
        <Button size="sm" variant="secondary" onClick={() => { step = 'pay'; ctx.ui.render() }}>第二步</Button>
        <Button size="sm" variant="secondary" onClick={() => { step = 'done'; ctx.ui.render() }}>第三步</Button>
      </div>
      <div class="wf-text-xs wf-text-secondary">三步流程 + 描述；aria-current="step" 标识当前步</div>
    </div>
  )
}

const DemoTabs: Component = async (_props, ctx) => {
  let tab = 'a'
  return async (_p: any) => (
    <div class="wf-w-full">
      <Tabs items={[
        { key: 'a', label: '详情', content: <p class="wf-m-0">这是详情内容。点击其他标签切换。</p> },
        { key: 'b', label: '设置', content: <p class="wf-m-0">这是设置内容。可以在这里修改配置。</p> },
        { key: 'c', label: '日志', content: <p class="wf-m-0">这是日志内容。显示操作记录。</p> },
      ]} active={tab} onChange={v => { tab = v; ctx.ui.render() }} />
    </div>
  )
}

const DemoDropdown: Component = async (_props, ctx) => {
  let open = false
  let lastAction = ''
  return async (_p: any) => (
    <div class="wf-row wf-gap-md" style="min-height:120px">
      <Dropdown
        trigger={
          <Button variant="ghost" onClick={() => { open = !open; ctx.ui.render() }}>
            操作 ▾（点击切换）
          </Button>
        }
        open={open}
        onOpenChange={(o: boolean) => { open = o; ctx.ui.render() }}
        items={[
          { label: '编辑', onClick: () => { lastAction = '编辑'; open = false; ctx.ui.render() } },
          { label: '复制', onClick: () => { lastAction = '复制'; open = false; ctx.ui.render() } },
          { label: '删除', variant: 'danger', onClick: () => { lastAction = '删除'; open = false; ctx.ui.render() } },
        ]} />
      {lastAction && <span class="wf-text-xs wf-text-secondary">上次: {lastAction}</span>}
    </div>
  )
}

const DemoPagination: Component = async (_props, ctx) => {
  let page = 3
  return async (_p: any) => (
    <div class="wf-center wf-gap-sm">
      <Pagination total={200} page={page} onChange={p => { page = p; ctx.ui.render() }} />
      <div class="wf-text-xs wf-text-secondary">当前页: {page}</div>
    </div>
  )
}

const DemoAccordion: Component = async () => async () => (
  <div class="wf-w-full">
    <Accordion items={[
      { key: 'a', title: '什么是 weifuwu？', content: <p class="wf-m-0">weifuwu 是一个全栈框架，一个包包含后端、前端和布局系统。</p> },
      { key: 'b', title: '如何安装？', content: <p class="wf-m-0">运行 <code>npm install weifuwu</code> 即可。</p> },
      { key: 'c', title: '组件库包含什么？', content: <p class="wf-m-0">28 个 HTML 原语，覆盖 90% 的 SaaS 页面需求。</p> },
    ]} />
  </div>
)

const DemoSearchableSelect: Component = async (_props, ctx) => {
  let value = '' as string
  const rerender = () => ctx.ui.render()
  const options = [
    { value: 'zhang', label: '张三 (zhang@example.com)' },
    { value: 'li', label: '李四 (li@example.com)' },
    { value: 'wang', label: '王五 (wang@example.com)' },
    { value: 'zhao', label: '赵六 (zhao@example.com)' },
    { value: 'qian', label: '钱七 (qian@example.com)' },
  ]
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Select searchable label="搜索选择用户" placeholder="输入姓名或邮箱搜索..."
        value={value}
        onChange={(v) => { value = String(v); rerender() }}
        options={options} />
      <div class="wf-text-xs wf-text-secondary">已选: {options.find(o => o.value === value)?.label || '(未选择)'}</div>
    </div>
  )
}

// ── 新增组件 Demo ────────────────────────────────────

const DemoBreadcrumb: Component = async () => async () => (
  <div class="wf-w-full">
    <Breadcrumb items={[
      { label: '首页', href: '/' },
      { label: '用户管理', href: '/users' },
      { label: '编辑' },
    ]} />
  </div>
)

const DemoPageHeader: Component = async (_props, ctx) => {
  let display = false
  return async (_p: any) => (
    <div class="wf-stack wf-gap-md wf-w-full">
      <PageHeader title="用户管理" sub="管理平台所有用户的账号、角色与权限">
        <Button size="sm" variant="primary">新建用户</Button>
        <Button size="sm">导出</Button>
      </PageHeader>
      <PageHeader display title="大标题模式" sub="display 档 30px 页面大标题" />
      <Button size="sm" variant="ghost" onClick={() => { display = !display; ctx.ui.render() }}>切换: {display ? '普通' : 'display'}</Button>
      <PageHeader display={display} title="可切换标题" sub="点击上方按钮切换 display 档" />
    </div>
  )
}

const DemoIcon: Component = async () => async () => {
  const names = ['chevron-down','chevron-up','chevron-left','chevron-right','arrow-left','arrow-up','arrow-down','sort','sort-asc','sort-desc','check','close','alert','info','warning','pause','settings','search','send','stop','retry','upload','trash','edit','plus'] as const
  return (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <div class="wf-row wf-gap-md wf-cluster">
        {names.map(n => (
          <span class="wf-row wf-gap-xs wf-text-xs wf-text-secondary" style="align-items:center">
            <Icon name={n} size={16} />
            <span>{n}</span>
          </span>
        ))}
      </div>
      <div class="wf-row wf-gap-md wf-cluster wf-text-sm">
        <span class="wf-row wf-gap-xs" style="align-items:center"><Icon name="search" /> 随字号</span>
        <span class="wf-row wf-gap-xs wf-text-brand" style="align-items:center"><Icon name="check" size={20} /> currentColor</span>
        <span class="wf-row wf-gap-xs wf-text-error" style="align-items:center"><Icon name="trash" /> 红色</span>
      </div>
    </div>
  )
}

const DemoMarkdown: Component = async () => async () => (
  <Markdown content={`# 项目进展

本周完成了 **核心模块** 与 ~~旧实现~~ 、

## 任务进度

- [x] 核心模块
- [x] CodeBlock 组件
- [ ] 文档补全

## 参数对比

| 组件 | 行数 | 复杂度 |
| :--- | ---: | :---: |
| Markdown | 295 | 中 |
| CodeBlock | 80 | 低 |

> GFM：删除线 / 任务列表 / 表格（含对齐）。

\`\`\`ts
const greet = (name: string) => \`你好，\${name}\`
\`\`\`

[weifuwu 官网](https://weifuwu.dev) 与行内 \`code\` 混排。`} />
)

const DemoCodeBlock: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm wf-w-full">
    <CodeBlock lang="ts" title="示例.ts" code={`import { Markdown } from 'weifuwu/components'

// 复制按钮 + 语言标签 + 横向滚动
const view = <Markdown content="# 标题" />`} />
    <CodeBlock code={`plain text 无语言标签`} />
  </div>
)

const DemoEmptyStateAction: Component = async (_props, ctx) => async () => (
  <div class="wf-w-full">
    <EmptyState
      icon={<Icon name="inbox" />}
      text="还没有成员"
      hint="邀请成员后他们将出现在这里"
    >
      <button class="wf-btn wf-btn--primary wf-btn--sm" onClick={() => ctx.ui.render()}>邀请成员</button>
    </EmptyState>
    <div class="wf-text-xs wf-text-secondary wf-text-center">hint + action 操作按钮（EmptyState 扩展）</div>
  </div>
)

const DemoDescriptionsSize: Component = async () => async () => (
  <div class="wf-w-full">
    <Descriptions
      size="sm"
      items={[
        { label: '姓名', value: '张三' },
        { label: '角色', value: '管理员' },
        { label: '部门', value: '前端组' },
        { label: '状态', value: <Badge variant="success">活跃</Badge> },
      ]}
      column={2}
    />
    <div class="wf-text-xs wf-text-secondary">size=small 紧凑布局（详情页密度）</div>
  </div>
)

const DemoResultError: Component = async () => async () => (
  <div class="wf-w-full">
    <Result
      status="error"
      title="发布失败"
      desc="版本校验未通过——请检查依赖后重试"
      extra={
        <div class="wf-center">
          <div class="wf-row wf-gap-sm">
            <button class="wf-btn wf-btn--primary wf-btn--sm">重试</button>
            <button class="wf-btn wf-btn--secondary wf-btn--sm">查看日志</button>
          </div>
        </div>
      }
    />
    <div class="wf-text-xs wf-text-secondary wf-text-center">error 状态 + 操作区（Result 扩展）</div>
  </div>
)

const DemoHighlightMulti: Component = async () => async () => (
  <div class="wf-w-full">
    <Highlight text="React 与 Vue 都是现代前端框架，React 生态更丰富，Vue 上手更快" query={['react', 'vue']} />
    <div class="wf-text-xs wf-text-secondary">多词高亮（query 数组）——大小写不敏感 mark</div>
  </div>
)

const DemoTimeline: Component = async (_props, ctx) => {
  let logs: Array<{ key: string; title: string; time: string; status: 'default' | 'info' | 'success' | 'warning' | 'error'; content?: string }> = [
    { key: '1', title: 'AI 回复', time: '10:00:12', status: 'success' as const, content: '生成了 256 tokens' },
    { key: '2', title: '工具调用 query_weather', time: '10:00:09', status: 'info' as const, content: '查询 北京…' },
    { key: '3', title: '用户消息', time: '10:00:05', status: 'default' as const, content: '北京天气如何？' },
  ]
  const hItems = [
    { key: 'h1', title: '提交', time: '10:00', status: 'default' as const },
    { key: 'h2', title: '审核中', time: '11:00', status: 'info' as const },
    { key: 'h3', title: '完成', time: '12:00', status: 'success' as const },
  ]
  return async (_p: any) => (
    <div class="wf-stack wf-gap-md wf-w-full">
      <Timeline items={logs} />
      <div class="wf-text-xs wf-text-secondary">竖向（默认）</div>
      <Timeline items={hItems} mode="horizontal" />
      <div class="wf-text-xs wf-text-secondary">横向模式（步骤进度）</div>
      <Button size="sm" variant="ghost" onClick={() => { logs = [...logs.slice(1), { key: String(Date.now()), title: '新事件', time: '现在', status: 'warning' as const, content: '点击追加' }]; ctx.ui.render() }}>追加事件</Button>
    </div>
  )
}

const DemoInputNumber: Component = async (_props, ctx) => {
  let temp = 0.7
  let tokens: number | null = 2048
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <div class="wf-row wf-gap-md">
        <div style="max-width:160px">
          <InputNumber label="temperature" value={temp} min={0} max={1} step={0.1} precision={1} onChange={v => { temp = v ?? 0; ctx.ui.render() }} />
        </div>
        <div style="max-width:160px">
          <InputNumber label="max_tokens" value={tokens} min={1} max={8192} step={256} onChange={v => { tokens = v; ctx.ui.render() }} />
        </div>
      </div>
      <div class="wf-text-xs wf-text-secondary">temperature: {temp} · max_tokens: {tokens}</div>
    </div>
  )
}

const DemoDescriptions: Component = async () => async () => (
  <div class="wf-w-full">
    <Descriptions column={2} items={[
      { label: '名称', value: '小码（开发助手）' },
      { label: '类型', value: 'AI Agent' },
      { label: '模型', value: 'deepseek-chat' },
      { label: '状态', value: <Badge variant="success">运行中</Badge> },
      { label: '创建时间', value: '2026-08-01 10:00' },
      { label: '技能', value: '2 个已绑定', span: 2 },
    ]} />
  </div>
)

const DemoAvatarGroup: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm">
    <AvatarGroup items={[{ name: '张三' }, { name: '李四' }, { name: '王五' }, { name: '赵六' }]} max={3} />
    <AvatarGroup items={[{ name: 'A' }, { name: 'B' }]} size="sm" />
  </div>
)

const DemoMessageBubble: Component = async (_props, ctx) => {
  let st: 'complete' | 'streaming' | 'error' = 'complete'
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <MessageBubble role="user" content="北京天气如何？" />
      <MessageBubble role="assistant" status={st} content={st === 'error' ? '请求失败，请重试' : '北京 25°C，晴。'} actions={st === 'error' ? <Button size="sm" variant="ghost" onClick={() => { st = 'complete'; ctx.ui.render() }}>🔄 重试</Button> : undefined} />
      <div class="wf-row wf-gap-xs">
        {(['complete', 'streaming', 'error'] as const).map(s => (
          <Button size="sm" variant={st === s ? 'primary' : 'ghost'} onClick={() => { st = s; ctx.ui.render() }}>{s}</Button>
        ))}
      </div>
    </div>
  )
}

const DemoMenu: Component = async (_props, ctx) => {
  let active = 'agents'
  let collapsed = false
  const items = [
    { key: 'dashboard', label: '仪表盘', icon: <Icon name="dashboard" size={16} />, group: '工作台' },
    { key: 'agents', label: 'Agent 管理', icon: <Icon name="cpu" size={16} />, group: '工作台' },
    { key: 'depts', label: '部门', icon: <Icon name="briefcase" size={16} />, group: '工作台' },
    {
      key: 'sys', label: '系统管理', icon: <Icon name="settings" size={16} />, group: '系统',
      children: [
        { key: 'sys-users', label: '用户管理' },
        { key: 'sys-roles', label: '角色权限' },
        { key: 'sys-logs', label: '操作日志' },
      ],
    },
    { key: 'logout', label: '退出登录', icon: <Icon name="log-out" size={16} />, group: '系统', danger: true },
  ]
  return async (_p: any) => (
    <div class="wf-w-full">
      <div style={{ width: collapsed ? '56px' : '220px', transition: 'width 0.2s' }} class="wf-p-sm wf-border wf-rounded wf-bg-secondary">
        <Menu items={items} activeKey={active} onSelect={k => { active = k; ctx.ui.render() }}
          collapsible collapsed={collapsed} onCollapseChange={c => { collapsed = c; ctx.ui.render() }} />
      </div>
      <div class="wf-text-xs wf-text-secondary wf-mt-sm">当前: {active}（方向键导航；子菜单 Enter 展开 / Esc 收起；折叠态点图标弹出子菜单浮层；底部按钮折叠）</div>
    </div>
  )
}

const DemoPasswordInput: Component = async (_props, ctx) => {
  let pwd = 'secret123'
  return async (_p: any) => (
    <div class="wf-w-full wf-stack wf-gap-sm" style="max-width:320px">
      <PasswordInput label="登录密码" value={pwd} placeholder="••••••••" onInput={(e: any) => { pwd = e.target.value; ctx.ui.render() }} hint="点击右侧眼睛切换可见性" />
    </div>
  )
}

const DemoTagsInput: Component = async (_props, ctx) => {
  let tags = ['typescript', 'weifuwu']
  return async (_p: any) => (
    <div class="wf-w-full wf-stack wf-gap-sm" style="max-width:360px">
      <TagsInput label="技能标签" value={tags} placeholder="输入后回车添加，支持中文输入法" onChange={v => { tags = v; ctx.ui.render() }} hint={`当前 ${tags.length} 个标签`} />
    </div>
  )
}

const DemoHighlight: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm wf-w-full">
    <div class="wf-text-sm"><Highlight text="搜索 张三 的订单记录，张三 是管理员" query={['张三']} /></div>
    <div class="wf-text-sm wf-text-secondary"><Highlight text="支持多词：weifuwu 与 components" query={['weifuwu', 'components']} /></div>
  </div>
)

const DemoList: Component = async () => async () => (
  <div class="wf-w-full" style="max-width:400px">
    <List divided header="最近文件"
      items={[{ n: '需求文档.md', s: '2 分钟前' }, { n: '架构设计.pdf', s: '昨天' }, { n: '接口说明.docx', s: '3 天前' }]}
      renderItem={(f: any) => (
        <div class="wf-split">
          <span class="wf-row wf-gap-xs"><Icon name="file" size={14} /><span class="wf-text-sm">{f.n}</span></span>
          <span class="wf-text-xs wf-text-tertiary">{f.s}</span>
        </div>
      )} />
  </div>
)

const DemoResult: Component = async () => async () => (
  <div class="wf-w-full wf-stack wf-gap-md">
    <Result status="success" title="注册成功" desc="欢迎加入 weifuwu，验证邮件已发送至你的邮箱"
      extra={<><Button variant="primary">进入工作台</Button><Button variant="ghost">返回首页</Button></>} />
    <Result status="error" title="提交失败" desc="网络异常，请稍后重试或联系客服"
      extra={<Button variant="primary">重试</Button>} />
    <Result status="warning" title="权限不足" desc="当前账号无访问该资源的权限，请联系管理员开通" />
  </div>
)

const DemoDivider: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm wf-w-full">
    <p>上方分割线</p>
    <Divider />
    <p>下方分割线</p>
    <Divider>或</Divider>
    <p>
      <span>左</span>
      <Divider vertical />
      <span>中</span>
      <Divider vertical />
      <span>右</span>
    </p>
  </div>
)

const DemoFileUpload: Component = async (_props, ctx) => {
  let files: File[] = []
  let uploading = false
  let progress = 0
  // 模拟上传（父层驱动进度——组件不做 xhr，诚实裁剪）
  const simulateUpload = () => {
    if (files.length === 0) return
    uploading = true; progress = 0; ctx.ui.render()
    const timer = setInterval(() => {
      progress += 20
      if (progress >= 100) { clearInterval(timer); uploading = false }
      ctx.ui.render()
    }, 300)
  }
  return async (_p: any) => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <FileUpload
        accept="image/*,.pdf"
        multiple
        maxSize={5 * 1024 * 1024}
        value={files}
        uploading={uploading}
        progress={progress}
        onChange={f => { files = f; ctx.ui.render() }} />
      <div class="wf-row wf-gap-sm">
        <Button variant="primary" size="sm" onClick={simulateUpload} disabled={!files.length}>模拟上传（进度）</Button>
        <span class="wf-text-xs wf-text-secondary">选择图片文件可预览缩略图</span>
      </div>
    </div>
  )
}

const DemoTooltip: Component = async () => async () => (
  <div class="wf-row wf-gap-xl wf-py-lg">
    <Tooltip content="保存文件" position="top"><Button>上</Button></Tooltip>
    <Tooltip content="底部提示" position="bottom"><Button>下</Button></Tooltip>
    <Tooltip content="左侧提示" position="left"><Button>左</Button></Tooltip>
    <Tooltip content="右侧提示" position="right"><Button>右</Button></Tooltip>
  </div>
)

const DemoDrawer: Component = async (_props, ctx) => {
  let rightOpen = false
  let leftOpen = false
  return async (_p: any) => (
    <div class="wf-row wf-gap-sm">
      <Button variant="primary" onClick={() => { rightOpen = true; ctx.ui.render() }}>右侧抽屉</Button>
      <Button onClick={() => { leftOpen = true; ctx.ui.render() }}>左侧抽屉</Button>
      <Drawer open={rightOpen} title="编辑用户" position="right" onClose={() => { rightOpen = false; ctx.ui.render() }}
        footer={<>
          <Button variant="ghost" onClick={() => { rightOpen = false; ctx.ui.render() }}>取消</Button>
          <Button variant="primary" onClick={() => { rightOpen = false; ctx.ui.render() }}>保存</Button>
        </>}>
        <Input label="姓名" placeholder="请输入姓名" />
        <Input label="邮箱" type="email" placeholder="email@example.com" />
      </Drawer>
      <Drawer open={leftOpen} title="导航菜单" position="left" onClose={() => { leftOpen = false; ctx.ui.render() }}>
        <p>左侧面板内容</p>
      </Drawer>
    </div>
  )
}

const DemoPopover: Component = async (_props, ctx) => {
  let showBottom = false
  let showTop = false
  return async (_p: any) => (
    <div class="wf-row wf-gap-sm">
      <Popover content={<div class="wf-py-xs"><p class="wf-m-0 wf-mb-sm">自定义面板内容</p><Button size="sm">操作</Button></div>}>
        <Button variant="secondary">点击弹出</Button>
      </Popover>
      <Popover content={<span>顶部提示</span>} position="top">
        <Button variant="ghost">顶部</Button>
      </Popover>
      <Popover trigger="hover" content={<span>悬停出现的面板</span>}>
        <span class="wf-text-brand" style="cursor:pointer">悬停查看</span>
      </Popover>
    </div>
  )
}

const DemoImage: Component = async () => async () => (
  <div class="wf-row wf-gap-lg wf-top">
    <Img src="https://picsum.photos/200/200?1" alt="示例图片" width={120} height={120} style={{ borderRadius: '8px', objectFit: 'cover' }} />
    <Img src="https://picsum.photos/200/200?2" alt="loading=lazy" width={120} height={120} style={{ borderRadius: '50%', objectFit: 'cover' }} />
    <Img src="/broken.jpg" fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='14'%3E加载失败%3C/text%3E%3C/svg%3E" alt="fallback" width={120} height={120} style={{ objectFit: 'cover', borderRadius: '8px' }} />
    {/* preview：点击放大（缩放滚轮/双击，Escape/遮罩关闭） */}
    <Img src="https://picsum.photos/600/400?3" alt="preview 点击放大" preview width={120} height={120} style={{ borderRadius: '8px', objectFit: 'cover', cursor: 'zoom-in' }} />
  </div>
)

const DemoInView: Component = async (_props, ctx) => {
  let log: string[] = []
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <p class="wf-text-sm wf-text-secondary">向下滚动，下方的懒加载区域将在进入视窗后渲染👇</p>
      <div class="wf-center wf-bg-secondary wf-rounded wf-text-sm wf-text-tertiary" style="height:120px">上方留白区域，需要滚动</div>
      <InView onEnter={() => { log = [...log, '已加载']; ctx.ui.render() }}>
        <div class="wf-p-lg wf-text-center wf-bg-brand wf-rounded">
          <div class="wf-text-3xl wf-mb-sm wf-m-0">🎉</div>
          <p class="wf-m-0 wf-text-semibold">懒加载内容已加载！</p>
          <p class="wf-text-xs wf-text-secondary wf-mt-xs wf-m-0">用户滚动到此区域后才渲染</p>
        </div>
      </InView>
      <div class="wf-center wf-bg-secondary wf-rounded wf-text-sm wf-text-tertiary" style="height:160px">底部留白区域</div>
      {log.length > 0 && <div class="wf-text-xs wf-text-secondary">事件: {log.join(', ')}</div>}
    </div>
  )
}

const DemoDatePicker: Component = async (_props, ctx) => {
  let result = ''
  return async (_p: any) => (
    <div class="wf-row wf-gap-md wf-cluster wf-w-full">
      <div class="wf-w-full" style="max-width:220px">
        <DatePicker mode="date" onChange={v => { result = v; ctx.ui.render() }} placeholder="选择日期" />
      </div>
      <div class="wf-w-full" style="max-width:220px">
        <DatePicker mode="datetime" onChange={v => { result = v; ctx.ui.render() }} placeholder="日期+时间" />
      </div>
      <div class="wf-w-full" style="max-width:180px">
        <DatePicker mode="time" onChange={v => { result = v; ctx.ui.render() }} placeholder="选择时间" />
      </div>
      <div class="wf-w-full" style="max-width:220px">
        <DatePicker mode="range" onChange={v => { result = v; ctx.ui.render() }} placeholder="日期范围" />
      </div>
      {result && <div class="wf-text-xs wf-text-secondary wf-w-full">已选: {result}</div>}
    </div>
  )
}


const DemoEditor: Component = async (_props, ctx) => {
  let html = '<p>Hello <strong>weifuwu</strong>!</p><blockquote>引用块示例</blockquote><p class="wf-text-center">居中文字</p>'
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Editor value={html} onChange={v => { html = v; ctx.ui.render() }} placeholder="输入内容..." />
      <div class="wf-text-xs wf-text-secondary wf-py-xs wf-truncate wf-w-full">
        HTML 输出: {html?.substring(0, 150) || '(空)'}
      </div>
    </div>
  )
}

const DemoThemeSwitch: Component = async (_props, ctx) => {
  let mode = 'auto'
  let preset: any = undefined
  // 品牌 seed 实时换肤（演示 WUI 设计语言第一档：改一个值全站跟随）
  let brandSeed = '#4f6ef7'
  let darkBrandSeed = '#6b8aff'
  const rerender = () => ctx.ui.render()
  const applySeeds = (light: string, dark: string) => {
    const root = document.documentElement
    root.style.setProperty('--wf-brand-seed', light)
    root.style.setProperty('--wf-dark-brand-seed', dark)
  }
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <div class="wf-row wf-gap-sm">
        <ThemeSwitch onChange={(m) => { mode = m; rerender() }} />
      </div>
      <div class="wf-row wf-gap-sm">
        {/* 预设主题行（可选）：minimal/compact/rounded，与暗色正交 */}
        <ThemeSwitch preset={preset} onPresetChange={(p) => { preset = p; rerender() }} />
      </div>
      <div class="wf-row wf-gap-sm wf-items-center">
        <label class="wf-text-xs wf-text-secondary">亮色品牌</label>
        <input type="color" value={brandSeed} aria-label="亮色品牌色"
          style={{ width: '28px', height: '28px', padding: 0, border: 'var(--wf-border-width) solid var(--wf-color-border)', borderRadius: 'var(--wf-radius-sm)', background: 'none' }}
          onChange={(e: any) => { brandSeed = e.target.value; applySeeds(brandSeed, darkBrandSeed); rerender() }} />
        <label class="wf-text-xs wf-text-secondary">暗色品牌</label>
        <input type="color" value={darkBrandSeed} aria-label="暗色品牌色"
          style={{ width: '28px', height: '28px', padding: 0, border: 'var(--wf-border-width) solid var(--wf-color-border)', borderRadius: 'var(--wf-radius-sm)', background: 'none' }}
          onChange={(e: any) => { darkBrandSeed = e.target.value; applySeeds(brandSeed, darkBrandSeed); rerender() }} />
        <button class="wf-btn wf-btn--sm" onClick={() => {
          brandSeed = '#4f6ef7'; darkBrandSeed = '#6b8aff'
          const root = document.documentElement
          root.style.removeProperty('--wf-brand-seed')
          root.style.removeProperty('--wf-dark-brand-seed')
          rerender()
        }}>重置</button>
      </div>
      <div class="wf-text-xs wf-text-secondary">
        模式: <code>{mode}</code> · 预设: <code>{preset ?? 'default'}</code> · 品牌: <code>{brandSeed}</code> / <code>{darkBrandSeed}</code> ·
        已持久化 localStorage · 右上角也有一个可直接用
      </div>
    </div>
  )
}

const DemoChart: Component = async () => async () => {
  const sales = [
    { label: '1月', value: 120 },
    { label: '2月', value: 200 },
    { label: '3月', value: 150 },
    { label: '4月', value: 80 },
    { label: '5月', value: 70 },
    { label: '6月', value: 110 },
  ]
  const pieData = [
    { label: '直接', value: 35, color: '#3b82f6' },
    { label: '社交', value: 25, color: '#22c55e' },
    { label: '邮件', value: 20, color: '#f59e0b' },
    { label: '其他', value: 20, color: '#8b5cf6' },
  ]
  return (
    <div class="wf-row" style="--wf-gap:16px">
      <div class="wf-fill wf-text-center" style="min-width:300px"><Chart type="line" data={sales} title="月销售额" /></div>
      <div class="wf-fill wf-text-center" style="min-width:300px"><Chart type="bar" data={sales} title="月销售额(柱状)" /></div>
      <div class="wf-fill wf-text-center" style="min-width:300px"><Chart type="pie" data={pieData} /></div>
    </div>
  )
}

const DemoConfirm: Component = async (_props, ctx) => {
  let result = ''
  const handleDelete = async () => {
    const ok = await (ctx as any).confirm?.('确定要删除这条记录吗？', {
      title: '确认删除',
      confirmText: '删除',
      variant: 'danger',
    })
    result = ok ? '已删除' : '已取消'
    ctx.ui.render()
  }
  const handleSave = async () => {
    const ok = await (ctx as any).confirm?.('保存修改？')
    result = ok ? '已保存' : '已取消'
    ctx.ui.render()
  }
  return async (_p: any) => (
    <div class="wf-row wf-gap-sm">
      <Button variant="danger" onClick={handleDelete}>删除</Button>
      <Button onClick={handleSave}>保存</Button>
      {result && <span class="wf-text-xs wf-text-secondary">{result}</span>}
    </div>
  )
}

// ── AI 对话组件演示 ────────────────────────────────────

/** ToolCallCard：running / ok / error 状态机（纯展示） */
const DemoToolCallCard: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm">
    <ToolCallCard call={{ id: 't1', name: 'query_weather', args: { city: '北京' } }} />
    <ToolCallCard
      call={{ id: 't2', name: 'generate_report', args: { type: 'monthly' } }}
      progress={{ toolCallId: 't2', step: 2, total: 5, message: '生成中…', status: 'running' }}
    />
    <ToolCallCard
      call={{ id: 't3', name: 'send_email', args: { to: 'boss@example.com' } }}
      result={{ id: 't3', ok: true, output: { sent: true } }}
    />
    <ToolCallCard
      call={{ id: 't4', name: 'place_order', args: { qty: 99 } }}
      result={{ id: 't4', ok: false, error: { code: 'rejected', message: '人工拒绝' } }}
    />
  </div>
)

/** JsonSchemaForm：schema → 工具参数输入表单（AI 差异化） */
const toolSchema: JsonSchema = {
  type: 'object',
  title: 'query_weather 参数',
  properties: {
    city: { type: 'string', title: '城市', description: '目标城市名' },
    days: { type: 'integer', title: '预报天数', minimum: 1, maximum: 7 },
    with_weather: { type: 'boolean', title: '含天气详情' },
    unit: { type: 'string', enum: ['celsius', 'fahrenheit'], title: '单位' },
  },
  required: ['city'],
}
const DemoJsonSchemaForm: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm">
    <JsonSchemaForm schema={toolSchema} value={{ city: '北京', days: 3, with_weather: true }} submitLabel="执行工具" />
    <span class="wf-text-xs wf-text-secondary">↑ schema 驱动表单：必填校验（城市）拦截提交；单位/天数/开关即改即生效（onChange）</span>
  </div>
)

/** ReasoningBlock：CoT 推理过程折叠展示 */
const DemoReasoningBlock: Component = async (_p, ctx) => {
  let streaming = false
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <ReasoningBlock
        content={'先分析用户意图：用户询问北京天气，需要调用 query_weather 工具。\n参数推导：city=北京，days=3（默认），单位取摄氏度。\n工具已就绪，开始执行。'}
        label="已思考"
        streaming={streaming}
      />
      <button class="wf-btn wf-btn--sm" onClick={() => { streaming = !streaming; ctx.ui.render() }}>
        {streaming ? '停止模拟流式' : '模拟流式'}
      </button>
    </div>
  )
}

/** CitationCard：RAG 引用来源展示 */
const DemoCitationCard: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm">
    <div class="wf-text-sm">根据以下资料回答：
      <span class="wf-text-secondary">引用来源折叠展示（最多 3 条，溢出 +N）</span>
    </div>
    <CitationCard
      items={[
        { id: 'c1', title: '产品手册 · 计费', source: 'docs/billing.md', snippet: '按量计费以小时为粒度，出账后 24 小时内可查看明细。', url: 'https://example.com/docs/billing' },
        { id: 'c2', title: 'FAQ · 退款', source: 'faq.md', snippet: '退款将在 3-5 个工作日内原路退回，超过 30 天请联系客服。' },
        { id: 'c3', title: 'API 文档 · 限流', source: 'api/rate-limit.md', snippet: '单账号 QPS 上限 100，超出返回 429。' },
        { id: 'c4', title: '公告 · 新功能', source: 'changelog.md', snippet: 'v0.75 新增审批修改参数能力。' },
      ]}
    />
  </div>
)

/** SessionList：会话管理列表（分组 + 搜索 + 重命名/删除/新建） */
const DemoSessionList: Component = async (_p, ctx) => {
  const day = 24 * 3600 * 1000
  const now = Date.now()
  let sessions = [
    { id: 's1', title: '北京天气查询', updatedAt: now - 30 * 60 * 1000 },
    { id: 's2', title: '订单退款处理', updatedAt: now - 5 * 60 * 1000 },
    { id: 's3', title: '上周的周报总结', updatedAt: now - 2 * day },
    { id: 's4', title: '知识库问答', updatedAt: now - 20 * day },
  ]
  let active = 's2'
  let idc = 10
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        <div class="wf-col" style={{ width: '260px' }}>
          <SessionList
            sessions={sessions}
            activeId={active}
            searchable
            onSelect={(id) => { active = id; ctx.ui.render() }}
            onNew={() => { sessions = [{ id: `s${idc++}`, title: '新会话', updatedAt: Date.now() }, ...sessions]; ctx.ui.render() }}
            onRename={(id, title) => { sessions = sessions.map((s) => s.id === id ? { ...s, title } : s); ctx.ui.render() }}
            onDelete={(id) => { sessions = sessions.filter((s) => s.id !== id); if (active === id) active = ''; ctx.ui.render() }}
          />
        </div>
      </div>
      <span class="wf-text-xs wf-text-secondary">分组（今天/昨天/更早）+ 搜索 + 选中；悬停行内重命名/删除；+ 新建会话</span>
    </div>
  )
}

/** ApprovalCard：pending / approved / rejected 终态 */
const DemoApprovalCard: Component = async (_p, ctx) => {
  let loading = false
  let modified: string | undefined
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <ApprovalCard
        request={{ id: 'ap1', toolCallId: 't1', name: 'place_order', args: { qty: 2 }, reason: '单笔超限，需人工确认' }}
        loading={loading}
        onApprove={() => { loading = true; ctx.ui.render(); setTimeout(() => { loading = false; ctx.ui.render() }, 1500) }}
        onReject={() => {}}
      />
      <div class="wf-text-xs wf-text-secondary">↑ 点「允许」看提交中状态（loading 防连点）</div>
      <ApprovalCard
        request={{ id: 'ap4', toolCallId: 't4', name: 'place_order', args: { qty: 2, note: '' }, reason: '单笔超限——可修改参数后批准（modified 决策）' }}
        argsSchema={{ type: 'object', properties: { qty: { type: 'integer', title: '数量', minimum: 1, maximum: 10 }, note: { type: 'string', title: '备注' } }, required: ['qty'] }}
        onApprove={(m) => { modified = m ? `qty=${m.qty}` : '原参数批准'; ctx.ui.render() }}
        onReject={() => {}}
      />
      <div class="wf-text-xs wf-text-secondary">↑ 点「修改参数」改数量后批准：{modified ?? '（尚未操作）'}</div>
      <ApprovalCard
        request={{ id: 'ap2', toolCallId: 't2', name: 'delete_user', args: { userId: 'u_42' } }}
        status="approved"
      />
      <ApprovalCard
        request={{ id: 'ap3', toolCallId: 't3', name: 'refund', args: { orderId: 'o_7' } }}
        status="rejected"
      />
    </div>
  )
}

/** AiChat：useChat + 标准对话界面（流式 / 工具 / 审批 / 自动滚动） */
const DemoAiChat: Component = async (_props, ctx) => {
  const chat = ctx.ui.useChat({
    url: '/api/chat',
    approveUrl: '/api/approve',
    body: (messages) => ({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      mode: chat.mode, // chat | agent
    }),
  })
  chat.mode = 'chat'

  return async () => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        {(['chat', 'agent'] as const).map((m) => (
          <button
            class={`wf-btn wf-btn--sm ${chat.mode === m ? 'wf-btn--primary' : ''}`}
            type="button"
            onClick={() => { chat.mode = m; chat.clear() }}
          >
            {m === 'chat' ? '流式对话' : 'Agent（工具+审批）'}
          </button>
        ))}
      </div>
      <AiChat chat={chat} maxHeight="300px" />
    </div>
  )
}

/** ChatInput：独立复用聊天输入条（单行/多行/流式——AiChat 抽取） */
const DemoChatInput: Component = async (_props, ctx) => {
  let value = ''
  let streaming = false
  const sent: string[] = []
  const rerender = () => ctx.ui.render()
  return async () => (
    <div class="wf-stack wf-gap-md">
      <div class="wf-stack wf-gap-xs">
        <Text variant="secondary">单行 + 发送（Enter）</Text>
        <ChatInput
          value={value}
          onChange={(v) => { value = v }}
          onSend={(t) => { sent.push(t); value = ''; rerender() }}
          labels={{ placeholder: '输入消息，回车发送...' }}
        />
        {sent.length > 0 && <Text variant="secondary">已发送：{sent.join(' | ')}</Text>}
      </div>
      <div class="wf-stack wf-gap-xs">
        <Text variant="secondary">多行 textarea（Shift+Enter 换行）</Text>
        <ChatInput
          multiline
          value={value}
          onChange={(v) => { value = v }}
          onSend={(t) => { sent.push(t); value = ''; rerender() }}
        />
      </div>
      <div class="wf-stack wf-gap-xs">
        <Text variant="secondary">流式（发送后 1.5s 自动进入停止态）</Text>
        <ChatInput
          value={value}
          onChange={(v) => { value = v }}
          streaming={streaming}
          onSend={() => { streaming = true; rerender(); setTimeout(() => { streaming = false; rerender() }, 1500) }}
          onStop={() => { streaming = false; rerender() }}
        />
      </div>
    </div>
  )
}

/** AuthPage：认证页骨架（登录/注册/错误+loading 三态） */
const DemoAuthPage: Component = async (_props, ctx) => {
  let mode: 'login' | 'register' = 'login'
  let loading = false
  let error = ''
  const rerender = () => ctx.ui.render()
  return async () => (
    <div class="wf-stack wf-gap-md">
      <div class="wf-row wf-gap-sm">
        <button class={`wf-btn wf-btn--sm ${mode === 'login' ? 'wf-btn--primary' : ''}`} type="button" onClick={() => { mode = 'login'; error = ''; rerender() }}>登录</button>
        <button class={`wf-btn wf-btn--sm ${mode === 'register' ? 'wf-btn--primary' : ''}`} type="button" onClick={() => { mode = 'register'; error = ''; rerender() }}>注册</button>
        <button class="wf-btn wf-btn--sm" type="button" onClick={() => { loading = !loading; rerender() }}>{loading ? '取消 loading' : '模拟 loading'}</button>
        <button class="wf-btn wf-btn--sm" type="button" onClick={() => { error = error ? '' : '邮箱已被注册（模拟错误）'; rerender() }}>{error ? '清除错误' : '模拟错误'}</button>
      </div>
      <AuthPage
        title={mode === 'login' ? '登录' : '创建账号'}
        subtitle="Agent Platform — 多租户 AI 平台"
        logo={<Avatar name="A" size="lg" />}
        submitLabel={mode === 'login' ? '登 录' : '注 册'}
        loading={loading}
        error={error || null}
        onSubmit={() => { loading = true; rerender(); setTimeout(() => { loading = false; error = '网络错误（模拟）'; rerender() }, 800) }}
        footer={<span>{mode === 'login' ? '还没有账号？' : '已有账号？'}<a onClick={() => { mode = mode === 'login' ? 'register' : 'login'; error = ''; rerender() }}>{mode === 'login' ? '立即注册' : '立即登录'}</a></span>}
      >
        {mode === 'register' && (
          <Field label="姓名" required>
            <Input placeholder="你的名字" />
          </Field>
        )}
        <Field label="邮箱" required>
          <Input type="email" placeholder="you@example.com" />
        </Field>
        <Field label="密码" required>
          <PasswordInput placeholder="••••••••" />
        </Field>
      </AuthPage>
    </div>
  )
}

// ── 新增组件 Demo（全量实现批次）────────────────────

const DemoRate: Component = async (_props, ctx) => {
  let v = 3
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <Rate value={v} onChange={(n: number) => { v = n; ctx.ui.render() }} />
      <Rate value={4} readOnly />
      <Rate value={v} allowHalf onChange={(n: number) => { v = n; ctx.ui.render() }} />
      <div class="wf-text-xs wf-text-secondary">半星（与第一行同步）</div>
      <Rate size="lg" allowClear onChange={(n: number) => { v = n; ctx.ui.render() }} />
      <div class="wf-text-sm wf-text-secondary">当前：{v} 星</div>
    </div>
  )
}

const DemoTypography: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm" style="max-width:100%">
    <Title level={1}>一级标题</Title>
    <Title level={3}>三级标题</Title>
    <div>
      <Text type="secondary">次要文字</Text>{' '}
      <Text type="success">成功</Text>{' '}
      <Text type="warning">警告</Text>{' '}
      <Text type="danger">危险</Text>
    </div>
    <div>
      <Text strong>加粗</Text> <Text underline>下划线</Text> <Text strikethrough>删除线</Text> <Text code>const x = 1</Text>
    </div>
    <Paragraph type="secondary" ellipsis>这是一段很长的段落文本，用于演示 ellipsis 单行截断效果，超出宽度时显示省略号。</Paragraph>
  </div>
)

const DemoLabel: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm">
    <Label htmlFor="demo-name">用户名</Label>
    <Label required>必填项</Label>
  </div>
)

const DemoAspectRatio: Component = async () => async () => (
  <div class="wf-surface wf-border wf-rounded-md">
    <AspectRatio ratio={16 / 9}>
      <div class="wf-center wf-text-secondary wf-bg-tertiary">16:9 容器</div>
    </AspectRatio>
  </div>
)

const DemoToggleGroup: Component = async (_props, ctx) => {
  let single = 'bold'
  let multi: string[] = ['bold']
  let pressed = false
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <ToggleGroup type="single" options={[{ value: 'bold', label: 'B' }, { value: 'italic', label: 'I' }, { value: 'underline', label: 'U' }]} value={single} onChange={(v: any) => { single = v; ctx.ui.render() }} />
      <ToggleGroup type="multiple" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} value={multi} onChange={(v: any) => { multi = v; ctx.ui.render() }} />
      <div class="wf-row wf-gap-sm">
        <Toggle pressed={pressed} onPressedChange={(p: boolean) => { pressed = p; ctx.ui.render() }}>单个切换</Toggle>
        <span class="wf-text-sm wf-text-secondary">状态：{pressed ? '已按下' : '未按下'}</span>
      </div>
    </div>
  )
}

const DemoCheckboxGroup: Component = async (_props, ctx) => {
  let v: string[] = ['a']
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <CheckboxGroup label="选择成员" options={[{ value: 'a', label: '张三' }, { value: 'b', label: '李四' }, { value: 'c', label: '王五' }]} value={v} onChange={(k: string[]) => { v = k; ctx.ui.render() }} />
      <div class="wf-text-sm wf-text-secondary">已选：{v.join(', ') || '无'}</div>
    </div>
  )
}

const DemoPinInput: Component = async (_props, ctx) => {
  let v = ''
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <PinInput length={6} value={v} onChange={(s: string) => { v = s; ctx.ui.render() }} />
      <div class="wf-text-sm wf-text-secondary">验证码：{v || '等待输入'}</div>
    </div>
  )
}

const DemoCopyButton: Component = async () => async () => (
  <div class="wf-row wf-gap-sm">
    <CopyButton value="https://weifuwu.dev/docs" label="复制链接" />
    <CopyButton value="仅图标" iconOnly />
  </div>
)

const DemoColorPicker: Component = async (_props, ctx) => {
  let c = '#4f6ef7'
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <ColorPicker value={c} showInput onChange={(v: string) => { c = v; ctx.ui.render() }} />
      <div class="wf-row wf-gap-sm">
        <ColorPicker value={c} size="sm" onChange={(v: string) => { c = v; ctx.ui.render() }} />
        <ColorPicker value={c} size="lg" onChange={(v: string) => { c = v; ctx.ui.render() }} />
        <ColorPicker value={c} disabled onChange={() => {}} />
      </div>
      <div class="wf-text-sm wf-text-secondary">当前：{c}</div>
    </div>
  )
}

const DemoHoverCard: Component = async () => async () => (
  <HoverCard openDelay={0} content={
    <div class="wf-stack wf-gap-xs">
      <div class="wf-text-sm wf-text-semibold">用户详情</div>
      <div class="wf-text-xs wf-text-secondary">悬停卡片展示富内容，支持任意 VNode</div>
    </div>
  }>
    <Button variant="secondary">悬停查看用户</Button>
  </HoverCard>
)

const DemoNotification: Component = async (_props, ctx) => {
  const show = () => {
    ;(ctx as any).notification?.success?.({ title: '部署成功', description: 'v0.63.0 已上线' })
  }
  return async () => (
    <div class="wf-row wf-gap-sm">
      <Button variant="primary" onClick={show}>成功通知</Button>
      <Button variant="secondary" onClick={() => (ctx as any).notification?.warning?.({ title: '磁盘空间不足', description: '已使用 92%' })}>警告通知</Button>
    </div>
  )
}

const DemoBackTop: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm">
    <div class="wf-text-sm wf-text-secondary">向下滚动页面超过 400px 后，右下角出现回到顶部按钮</div>
    <BackTop aria-label="回到顶部" />
  </div>
)

const DemoAffix: Component = async () => async () => (
  <div class="wf-stack wf-gap-sm">
    <div class="wf-text-sm wf-text-secondary">滚动页面：导航条滑出视窗顶部后固定（Affix，offsetTop=0）</div>
    {/* offsetTop=0：Affix 块滑出视窗顶部后才固定（scrollY >= 块文档位置）——
        offsetTop>0 则提前吸附（块距顶 offsetTop 时固定，antd 语义） */}
    <Affix offsetTop={0}>
      <div class="wf-surface wf-border wf-rounded-md wf-px-md wf-py-sm wf-row wf-gap-md wf-text-sm">
        <a href="#affix-demo" class="wf-text-primary">锚点一</a>
        <a href="#affix-demo" class="wf-text-secondary">锚点二</a>
        <a href="#affix-demo" class="wf-text-secondary">锚点三</a>
      </div>
    </Affix>
  </div>
)

const DemoAnchor: Component = async (_props, ctx) => {
  let active = '#anchor-a'
  const sections = [
    { id: 'anchor-a', title: '第一节', body: Array.from({ length: 8 }, (_, i) => `这是第一节的第 ${i + 1} 段内容。用于演示锚点滚动高亮跟随。`).join('') },
    { id: 'anchor-b', title: '第二节', body: Array.from({ length: 8 }, (_, i) => `这是第二节的第 ${i + 1} 段内容。滚动时右侧锚点自动高亮当前节。`).join('') },
    { id: 'anchor-c', title: '第三节', body: Array.from({ length: 8 }, (_, i) => `这是第三节的第 ${i + 1} 段内容。点击锚点平滑滚动到对应位置。`).join('') },
  ]
  return async () => (
    <div class="wf-w-full wf-row wf-gap-lg" style="align-items: flex-start">
      <div class="wf-fill">
        {sections.map(s => (
          <div id={s.id} class="wf-border-b wf-pb-md wf-mb-md">
            <div class="wf-text-base wf-text-semibold wf-mb-sm">{s.title}</div>
            <div class="wf-text-sm wf-text-secondary">{s.body}</div>
          </div>
        ))}
      </div>
      <div class="wf-surface wf-border wf-rounded wf-p-md" style="width: 140px; position: sticky; top: 16px">
        <Anchor items={sections.map(s => ({ href: `#${s.id}`, title: s.title }))}
          activeKey={active} onAnchorChange={h => { active = h; ctx.ui.render() }} />
        <div class="wf-text-xs wf-text-secondary wf-mt-sm">滚动页面跟随高亮</div>
      </div>
    </div>
  )
}

const DemoContextMenu: Component = async () => async () => (
  <ContextMenu items={[
    { key: 'edit', label: '编辑', onClick: () => alert('编辑') },
    { key: 'copy', label: '复制' },
    { key: 'delete', label: '删除', variant: 'danger', onClick: () => alert('删除') },
  ]}>
    <div class="wf-surface wf-border wf-rounded-md wf-p-lg wf-text-center wf-text-secondary">右键点击此区域</div>
  </ContextMenu>
)

const DemoMentions: Component = async (_props, ctx) => {
  let v = '输入 @ 提及成员：@ali'
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <Mentions options={[{ value: 'alice', label: 'Alice' }, { value: 'bob', label: 'Bob' }, { value: 'carol', label: 'Carol' }]} value={v} onChange={(s: string) => { v = s; ctx.ui.render() }} />
      <div class="wf-text-sm wf-text-secondary">文本：{v}</div>
    </div>
  )
}

const DemoCollapse: Component = async (_props, ctx) => {
  let active = ['1']
  return async () => (
    <Collapse items={[
      { key: '1', title: '知识库文档', content: '文档分块内容展示（行内展开，区别于 Accordion 卡片面板）' },
      { key: '2', title: '异步加载示例', loading: true },
      { key: '3', title: '带操作区', extra: <Button size="sm" variant="ghost">操作</Button>, content: '标题右侧可放操作按钮' },
    ]} active={active} onChange={(keys: string[]) => { active = keys; ctx.ui.render() }} />
  )
}

const DemoToggleTree: Component = async (_props, ctx) => {
  let checked = ['fe']
  let expanded = ['root', 'tech']
  let search = ''
  const treeData = [
    { key: 'root', label: '总部', children: [
      { key: 'tech', label: '技术部', children: [{ key: 'fe', label: '前端组' }, { key: 'be', label: '后端组' }] },
      { key: 'mkt', label: '市场部' },
    ] },
  ]
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <input class="wf-input" placeholder="搜索节点…" value={search} onInput={(e: any) => { search = e.target.value; ctx.ui.render() }} />
      <Tree data={treeData} expandedKeys={expanded} onExpand={(keys: string[]) => { expanded = keys; ctx.ui.render() }}
        searchValue={search}
        checkable checkedKeys={checked} onCheck={(keys: string[]) => { checked = keys; ctx.ui.render() }} />
    </div>
  )
}

const DemoCascader: Component = async (_props, ctx) => {
  let value: string[] = ['zj', 'hz']
  return async () => (
    <Cascader options={[
      { value: 'zj', label: '浙江', children: [{ value: 'hz', label: '杭州' }, { value: 'nb', label: '宁波' }] },
      { value: 'gd', label: '广东', children: [{ value: 'sz', label: '深圳' }] },
    ]} value={value} onChange={(v: string[]) => { value = v; ctx.ui.render() }} showSearch />
  )
}

const DemoAutoCompleteDis: Component = async (_p, ctx) => {
  let disabled = false
  return async () => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <AutoComplete options={[
        { value: 'pay-admin', label: '支付平台管理' },
        { value: 'order-center', label: '订单中心' },
      ]} disabled={disabled} placeholder="禁用时不可输入…" />
      <div><Button onClick={() => { disabled = !disabled; ctx.ui.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}

const DemoCascaderDis: Component = async (_p, ctx) => {
  let disabled = false
  let err = ''
  return async () => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Cascader options={[
        { value: 'zj', label: '浙江', children: [{ value: 'hz', label: '杭州' }] },
        { value: 'gd', label: '广东', children: [{ value: 'sz', label: '深圳' }] },
      ]} disabled={disabled} error={err} placeholder={disabled ? '禁用中' : '选择地区'} />
      <div class="wf-row wf-gap-sm">
        <Button onClick={() => { disabled = !disabled; err = ''; ctx.ui.render() }}>{disabled ? '启用' : '禁用'}</Button>
        <Button variant="danger" onClick={() => { disabled = false; err = '地区必填（校验示例）'; ctx.ui.render() }}>触发错误</Button>
      </div>
    </div>
  )
}

const DemoMentionsDis: Component = async (_p, ctx) => {
  let disabled = false
  return async () => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Mentions options={[{ value: 'alice', label: 'Alice' }, { value: 'bob', label: 'Bob' }]} disabled={disabled} rows={2} placeholder={disabled ? '禁用中' : '输入 @ 提及成员…'} />
      <div><Button onClick={() => { disabled = !disabled; ctx.ui.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}

const DemoTagsInputErr: Component = async (_p, ctx) => {
  let tags = ['前端']
  let err = ''
  return async () => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <TagsInput value={tags} onChange={(t) => { tags = t; if (t.length >= 3) err = ''; ctx.ui.render() }} maxTags={3} error={err} placeholder="最多 3 个标签（回车添加）" />
      {err && <div class="wf-text-sm wf-text-error">{err}</div>}
      <div class="wf-row wf-gap-sm">
        <Button variant="danger" onClick={() => { err = '标签数量超限（示例）'; ctx.ui.render() }}>触发错误</Button>
      </div>
    </div>
  )
}

const DemoPinInputDis: Component = async (_p, ctx) => {
  let disabled = false
  return async () => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <PinInput length={6} disabled={disabled} />
      <div><Button onClick={() => { disabled = !disabled; ctx.ui.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}

const DemoFileUploadDis: Component = async (_p, ctx) => {
  let files: File[] = []
  let disabled = false
  return async () => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <FileUpload accept="image/*" multiple value={files} disabled={disabled} error={disabled ? '' : undefined}
        onChange={f => { files = f; ctx.ui.render() }} />
      <div><Button onClick={() => { disabled = !disabled; ctx.ui.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}

const DemoTableRowSelect: Component = async (_props, ctx) => {
  let keys: (string | number)[] = [1]
  return async () => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <Table
        rowSelection={{ selectedRowKeys: keys, onChange: (k: (string | number)[]) => { keys = k; ctx.ui.render() } }}
        data={[
          { id: 1, name: '张三', role: '管理员' },
          { id: 2, name: '李四', role: '编辑' },
          { id: 3, name: '王五', role: '访客' },
        ]}
        columns={[{ key: 'id', label: 'ID', width: 60 }, { key: 'name', label: '姓名' }, { key: 'role', label: '角色' }]} />
      <div class="wf-text-xs wf-text-secondary">已选 {keys.length} 行——勾选列 + 受控 selectedRowKeys</div>
    </div>
  )
}

const DemoVirtualTableBig: Component = async (_props, ctx) => {
  // 10 万行大数据（虚拟滚动只渲染可见窗口）
  const big = Array.from({ length: 100000 }, (_, i) => ({ id: i, name: `条目-${i}`, value: i * 7 }))
  return async () => (
    <VirtualTable height={280} data={big}
      columns={[{ key: 'id', label: 'ID', width: 80 }, { key: 'name', label: '名称' }, { key: 'value', label: '值', sortable: true }]} />
  )
}

const DemoToggleTreeCheck: Component = async (_props, ctx) => {
  let checked: string[] = ['a1']
  const treeData = [
    { key: 'a', label: '前端组', children: [{ key: 'a1', label: 'React' }, { key: 'a2', label: 'Vue' }] },
    { key: 'b', label: '后端组', children: [{ key: 'b1', label: 'Node' }, { key: 'b2', label: 'Go' }] },
  ]
  return async () => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <Tree data={treeData} checkable checkedKeys={checked}
        onCheck={(k: string[]) => { checked = k; ctx.ui.render() }} />
      <div class="wf-text-xs wf-text-secondary">勾选：{checked.join(' / ') || '（无）'}——父子联动</div>
    </div>
  )
}

const DemoJSONViewerDeep: Component = async () => async () => (
  <div class="wf-w-full">
    <JSONViewer defaultExpandDepth={3} data={{
      user: { name: '张三', roles: ['admin', 'editor'], profile: { age: 30, tags: ['前端', '全栈'], address: { city: '杭州', street: '文一西路' } } },
      meta: { createdAt: '2025-06-10', version: 'v0.78.0' },
    }} />
    <div class="wf-text-xs wf-text-secondary">defaultExpandDepth=3 深展开——懒展开覆盖大对象</div>
  </div>
)

const DemoLogViewerCustom: Component = async () => async () => {
  const logs = [
    '\x1b[32m[INFO]\x1b[0m 2025-06-10T10:00:01 服务启动',
    '\x1b[33m[WARN]\x1b[0m 2025-06-10T10:00:02 缓存命中率下降',
    '\x1b[31m[ERROR]\x1b[0m 2025-06-10T10:00:03 数据库连接超时',
    '\x1b[32m[INFO]\x1b[0m 2025-06-10T10:00:04 重试成功',
  ]
  return (
    <div class="wf-w-full">
      <LogViewer height={140} lines={logs} showLineNumbers showCopy follow={false} />
      <div class="wf-text-xs wf-text-secondary">ANSI 着色 + 行号 + 复制——自定义日志源</div>
    </div>
  )
}

const DemoDiffViewBig: Component = async () => async () => (
  <div class="wf-w-full">
    <DiffView oldTitle="旧实现" newTitle="新实现"
      oldCode={`function add(a, b) {
  const sum = a + b
  return sum
}

function oldHelper(x) {
  return x * 2
}

function untouched(a) {
  return a
}`}
      newCode={`function add(a, b) {
  const sum = a + b
  return sum
}

function newHelper(x) {
  return x * 3
}

function untouched(a) {
  return a
}`} />
    <div class="wf-text-xs wf-text-secondary">LCS 行级对比——未变块折叠</div>
  </div>
)

const DemoInfiniteScrollRetry: Component = async (_props, ctx) => {
  let items = Array.from({ length: 8 }, (_, i) => `条目 ${i + 1}`)
  let loading = false
  let failed = false
  let page = 1
  return async () => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <InfiniteScroll
        hasMore={items.length < 32}
        loading={loading}
        loadMoreText="加载中…"
        endText="已全部加载"
        onLoadMore={() => {
          if (loading) return
          loading = true; ctx.ui.render()
          setTimeout(() => {
            page++
            // 第 2 页模拟失败（重试演示）
            if (page === 2) { failed = true; loading = false; ctx.ui.render(); return }
            failed = false
            items = [...items, ...Array.from({ length: 8 }, (_, i) => `条目 ${items.length + i + 1}`)]
            loading = false; ctx.ui.render()
          }, 800)
        }}>
        {items.map(it => <div class="wf-surface wf-border wf-rounded-md wf-p-sm wf-mb-xs">{it}</div>)}
        {failed && <div class="wf-text-sm wf-text-error wf-mb-xs">加载失败——再次滚动重试</div>}
      </InfiniteScroll>
    </div>
  )
}

const DemoTransfer: Component = async (_props, ctx) => {
  let target = ['a']
  return async () => (
    <Transfer data={[{ key: 'a', label: '成员A' }, { key: 'b', label: '成员B' }, { key: 'c', label: '成员C' }, { key: 'd', label: '成员D' }]}
      targetKeys={target} onChange={(k: string[]) => { target = k; ctx.ui.render() }} titles={['可选成员', '已选成员']} showSearch />
  )
}

const DemoCalendarEvents: Component = async (_props, ctx) => {
  let view = { month: 5, year: 2025 }
  let selected = '2025-06-10'
  return async () => (
    <div class="wf-w-full wf-flex wf-center">
      <Calendar
        month={view.month} year={view.year}
        selectedDate={selected}
        events={[
          { key: 'e1', date: '2025-06-10', title: '需求评审', color: 'var(--wf-color-brand)' },
          { key: 'e2', date: '2025-06-18', title: '发布 v0.78', color: 'var(--wf-color-success)' },
          { key: 'e3', date: '2025-06-25', title: '代码评审', color: 'var(--wf-color-warning)' },
        ]}
        onMonthChange={(m, y) => { view = { month: m, year: y }; ctx.ui.render() }}
        onSelectDate={(d) => { selected = d; ctx.ui.render() }} />
    </div>
  )
}

const DemoCommand: Component = async (_props, ctx) => {
  let open = false
  const items = [
    { key: 'new', label: '新建聊天', shortcut: 'N', onSelect: () => { open = false; ctx.ui.render() } },
    { key: 'search', label: '搜索', shortcut: 'S' },
    { key: 'settings', label: '设置', shortcut: 'G S' },
  ]
  return async () => (
    <div class="wf-stack wf-gap-sm">
      <Button variant="secondary" onClick={() => { open = true; ctx.ui.render() }}>打开命令面板（⌘K）</Button>
      <Command items={items} open={open} onOpenChange={(o: boolean) => { open = o; ctx.ui.render() }} />
    </div>
  )
}

const DemoMenubar: Component = async () => async () => (
  <Menubar menus={[
    { key: 'file', label: '文件', items: [{ key: 'new', label: '新建', shortcut: 'Ctrl+N' }, { key: 'save', label: '保存', shortcut: 'Ctrl+S' }] },
    { key: 'edit', label: '编辑', items: [{ key: 'undo', label: '撤销', shortcut: 'Ctrl+Z' }] },
  ]} />
)

const DemoCarousel: Component = async () => async () => (
  <div class="wf-w-sm">
    <Carousel autoplay interval={2500}>
      {['🟥 第一张', '🟦 第二张', '🟩 第三张'].map((t, i) => (
        <div key={i} class="wf-bg-tertiary wf-p-xl wf-text-center wf-rounded-md">{t}</div>
      ))}
    </Carousel>
    <div class="wf-text-xs wf-text-secondary wf-mt-xs">autoplay：每 2.5s 自动切换</div>
  </div>
)

const DemoResizable: Component = async () => async () => (
  <div class="wf-surface wf-border wf-rounded-md" style="height: 160px">
    <Resizable defaultSize={180}>
      {[<div class="wf-p-md wf-text-sm wf-text-secondary">左面板（拖拽分隔条）</div>, <div class="wf-p-md wf-text-sm wf-text-secondary">右面板</div>] as any}
    </Resizable>
  </div>
)

const DemoCalendar: Component = async (_props, ctx) => {
  let view = { month: 5, year: 2025 }
  return async () => (
    <Calendar month={view.month} year={view.year} selectedDate="2025-06-10"
      onMonthChange={(m: number, y: number) => { view = { month: m, year: y }; ctx.ui.render() }}
      events={[
        { key: 'e1', date: '2025-06-10', title: '产品评审' },
        { key: 'e2', date: '2025-06-15', title: '团队周会' },
      ]} />
  )
}

const DemoWatermark: Component = async () => async () => (
  <Watermark text="weifuwu 内部资料">
    <div class="wf-surface wf-border wf-rounded-md wf-p-xl wf-text-center wf-text-secondary">水印覆盖内容区</div>
  </Watermark>
)

const DemoVirtualList: Component = async () => async () => (
  <VirtualList height={240} itemHeight={36} items={Array.from({ length: 200 }, (_, i) => ({ id: i, label: `第 ${i} 行` }))}
    renderItem={(item: any) => <div class="wf-text-sm wf-border-b wf-py-xs wf-px-sm">{item.label}</div>} />
)

const DemoLogViewer: Component = async (_props, ctx) => {
  let lines: string[] = [
    '\x1b[32m[12:00:01] ✓ 服务启动，端口 3000\x1b[0m',
    '\x1b[32m[12:00:02] ✓ 连接数据库 demo@localhost:5432\x1b[0m',
    '[12:00:03] 等待请求…',
    '\x1b[33m[12:00:04] ⚠ 慢查询警告（342ms）\x1b[0m',
    '\x1b[31m[12:00:05] ✗ POST /api/agent/run 500 请求失败\x1b[0m',
    '[12:00:06] 重试 (1/3)…',
    '\x1b[32m[12:00:07] ✓ 重试成功，返回 200\x1b[0m',
  ]
  let idx = 8
  return async () => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <LogViewer lines={lines} height={260} lineHeight={22} follow />
      <div class="wf-row wf-gap-sm">
        <Button variant="primary" size="sm" onClick={() => {
          const log = idx % 3 === 0 ? `\x1b[31m[12:00:${String(idx).padStart(2, '0')}] ✗ 请求失败\x1b[0m`
            : idx % 3 === 1 ? `\x1b[32m[12:00:${String(idx).padStart(2, '0')}] ✓ 请求成功 (${idx * 7}ms)\x1b[0m`
            : `[12:00:${String(idx).padStart(2, '0')}] 普通日志行 ${idx}`
          lines = [...lines, log]
          idx++
          ctx.ui.render()
        }}>追加日志（模拟流）</Button>
        <Button size="sm" onClick={() => {
          lines = Array.from({ length: 10000 }, (_, i) => `[12:00:${String(i % 60).padStart(2, '0')}] 批量日志 ${i} 行`)
          ctx.ui.render()
        }}>加载 10k 行</Button>
      </div>
    </div>
  )
}

const DemoSparkline: Component = async () => async () => (
  <div class="wf-stack wf-gap-md">
    <div class="wf-row wf-gap-lg wf-cluster">
      <div class="wf-stack wf-gap-xs">
        <span class="wf-text-xs wf-text-secondary">本周流量</span>
        <Sparkline data={[12, 18, 15, 22, 30, 28, 35]} width={140} height={36} stroke="#4f6ef7" fill label="本周流量趋势" />
      </div>
      <div class="wf-stack wf-gap-xs">
        <span class="wf-text-xs wf-text-secondary">平滑曲线</span>
        <Sparkline data={[5, 9, 7, 12, 10, 15, 14]} width={140} height={36} smooth stroke="#16a34a" />
      </div>
      <div class="wf-stack wf-gap-xs">
        <span class="wf-text-xs wf-text-secondary">等值数据（防抖）</span>
        <Sparkline data={[7, 7, 7, 7, 7]} width={140} height={36} stroke="#f59e0b" />
      </div>
    </div>
  </div>
)

const DemoTour: Component = async (_props, ctx) => {
  let open = false
  let step = 0
  const render = () => ctx.ui.render()
  return async () => (
    <div class="wf-stack wf-gap-md">
      <div class="wf-row wf-gap-md wf-cluster">
        <button id="tour-a" class="wf-btn wf-btn--primary" onClick={() => { open = true; step = 0; render() }}>开始引导</button>
        <button id="tour-b" class="wf-btn" style="pointer-events: none;">第二步目标</button>
        <button id="tour-c" class="wf-btn" style="pointer-events: none;">第三步目标</button>
      </div>
      {open && (
        <Tour
          steps={[
            { target: '#tour-a', title: '开始引导', content: '点击任意目标查看引导气泡', placement: 'bottom' },
            { target: '#tour-b', title: '第二步', content: '引导气泡跟随目标位置', placement: 'right' },
            { target: '#tour-c', title: '最后一步', content: '完成或跳过关闭引导', placement: 'top' },
          ]}
          open={open}
          current={step}
          onStepChange={(s) => { step = s; render() }}
          onFinish={() => { open = false; render() }}
          onChange={(v) => { open = v; render() }}
        />
      )}
    </div>
  )
}

const DemoKanban: Component = async (_props, ctx) => {
  let cols = [
    { key: 'todo', title: '待办', items: [{ id: 'k1', title: '设计 API 契约', tag: '设计' }, { id: 'k2', title: '实现 LCS diff', tag: '开发' }] },
    { key: 'doing', title: '进行中', items: [{ id: 'k3', title: 'Tour 定位修复', tag: '开发' }] },
    { key: 'done', title: '已完成', items: [{ id: 'k4', title: 'ctx.browser 迁移', tag: '架构' }, { id: 'k5', title: 'v0.66.0 发布', tag: '发布' }] },
  ]
  const render = () => ctx.ui.render()
  return async () => (
    <Kanban
      columns={cols}
      onMove={(from, to) => {
        // 简单重排：源卡移除 → 目标位插入（受控数据在 demo 层维护）
        const srcCol = cols.find(c => c.key === from.columnKey)
        const dstCol = cols.find(c => c.key === to.columnKey)
        if (!srcCol || !dstCol) return
        const [card] = srcCol.items.splice(from.index, 1)
        if (!card) return
        dstCol.items.splice(to.index, 0, card)
        cols = [...cols]
        render()
      }}
    />
  )
}

const DemoPipeline: Component = async () => async () => (
  <div class="wf-stack wf-gap-md">
    <Pipeline
      orientation="horizontal"
      width={520}
      height={180}
      nodes={[
        { id: 'p1', label: '用户输入', status: 'success' },
        { id: 'p2', label: '意图分析', status: 'success' },
        { id: 'p3', label: '工具调用', status: 'running' },
        { id: 'p4', label: '结果聚合', status: 'pending' },
      ]}
      edges={[
        { from: 'p1', to: 'p2' },
        { from: 'p2', to: 'p3' },
        { from: 'p3', to: 'p4' },
      ]}
    />
  </div>
)

// TREESELECT_CACHE_TEST_20260817
// CACHE_V2_20260817
const DemoTreeSelect: Component = async (_props, ctx) => {
  let value: string | string[] | undefined = undefined
  const render = () => ctx.ui.render()
  return async () => (
    <div class="wf-stack wf-gap-md">
      <div class="wf-row wf-gap-lg wf-cluster">
        <div class="wf-stack wf-gap-xs">
          <span class="wf-text-xs wf-text-secondary">单选</span>
          <TreeSelect
            options={[
              { key: 'svc', label: '服务', children: [
                { key: 'http', label: 'HTTP 服务', children: [
                  { key: 'http-in', label: '内部路由' },
                  { key: 'http-out', label: '外部路由' },
                ] },
                { key: 'rpc', label: 'RPC 服务' },
              ] },
              { key: 'db', label: '数据库', children: [{ key: 'pg', label: 'PostgreSQL' }, { key: 'redis', label: 'Redis' }] },
            ]}
            value={value as string}
            onChange={(v) => { value = v; render() }}
            placeholder="选择服务"
          />
        </div>
        <div class="wf-stack wf-gap-xs">
          <span class="wf-text-xs wf-text-secondary">多选（父子联动）</span>
          <TreeSelect
            multiple
            options={[
              { key: 'svc', label: '服务', children: [
                { key: 'http', label: 'HTTP 服务', children: [
                  { key: 'http-in', label: '内部路由' },
                  { key: 'http-out', label: '外部路由' },
                ] },
                { key: 'rpc', label: 'RPC 服务' },
              ] },
              { key: 'db', label: '数据库', children: [{ key: 'pg', label: 'PostgreSQL' }, { key: 'redis', label: 'Redis' }] },
            ]}
            value={value as string[]}
            onChange={(v) => { value = v; render() }}
            placeholder="选择多个"
          />
        </div>
      </div>
    </div>
  )
}

const OLD_CODE = `function handleUser(input) {
  const data = JSON.parse(input)
  const name = data.name
  const age = data.age
  if (age > 18) {
    return \`欢迎 \${name}\`
  }
  return \`未成年 \${name}\`
}`

const NEW_CODE = `function handleUser(input) {
  const data = JSON.parse(input)
  const { name, age } = data
  if (age >= 18) {
    return \`欢迎 \${name}（成年）\`
  }
  return \`未成年 \${name}\`
}`


const DemoLayout: Component = async (_props, ctx) => {
  let collapsed = false
  return async () => (
    <Layout style={{ height: 360, borderRadius: 12, overflow: 'hidden' }}>
      <LayoutSider collapsible collapsed={collapsed} onCollapse={(v) => { collapsed = v; ctx.ui.render() }}>
        <div class="wf-p-md wf-text-secondary wf-stack wf-gap-sm">
          <b>导航</b>
          <span>仪表盘</span>
          <span>订单</span>
          <span>用户</span>
        </div>
      </LayoutSider>
      <Layout>
        <LayoutHeader>顶部栏</LayoutHeader>
        <LayoutContent>主内容区（batch-8 Layout 外壳）</LayoutContent>
        <LayoutFooter>© 2026 weifuwu</LayoutFooter>
      </Layout>
    </Layout>
  )
}

const DemoPopconfirm: Component<any, ToastInjected> = async (_p, ctx) => async () => (
  <div class="wf-row wf-gap-lg wf-cluster">
    <Popconfirm title="确定删除这条数据？" danger onConfirm={() => ctx.toast('已删除', 'success')}>
      <Button variant="danger">删除</Button>
    </Popconfirm>
    <Popconfirm title="确定提交审核？" onConfirm={() => ctx.toast('已提交', 'success')}>
      <Button>提交</Button>
    </Popconfirm>
  </div>
)

const DemoAutoComplete: Component = async (_p, ctx) => {
  let query = ''
  let selected: string | undefined
  // 输入态由 AutoComplete 内部 $ 管理——onChange 只记录闭包值，不强制父 render
  // （父 render 会重挂 input → 焦点丢失——Select searchable 同款纪律）
  return async () => {
    const options = [
      { value: 'pay-admin', label: '支付平台管理' },
      { value: 'pay-account', label: '支付平账系统' },
      { value: 'order-center', label: '订单中心' },
      { value: 'user-svc', label: '用户服务' },
      { value: 'storage', label: '对象存储' },
    ]
    return (
      <AutoComplete
        options={options}
        value={query}
        onChange={(v) => { query = v }}
        onSelect={(v) => { selected = v }}
        placeholder="输入关键词联想…"
      />
    )
  }
}

const DemoLink: Component = async () => async () => (
  <div class="wf-row wf-gap-lg wf-cluster">
    <Link href="/docs">默认链接</Link>
    <Link href="/docs" variant="primary">主色链接</Link>
    <Link href="/docs" variant="danger">危险链接</Link>
    <Link href="/docs" underline={false}>无下划线</Link>
    <Link disabled>禁用链接</Link>
  </div>
)

const DemoFloatButton: Component<any, ToastInjected> = async (_p, ctx) => async () => (
  <FloatButtonGroup>
    <FloatButton icon={<Icon name="edit" size={18} />} onClick={() => ctx.toast('编辑', 'info')} />
    <FloatButton icon={<Icon name="bar-chart" size={18} />} onClick={() => ctx.toast('报表', 'info')} />
    <FloatButton icon={<Icon name="settings" size={18} />} onClick={() => ctx.toast('设置', 'info')} />
  </FloatButtonGroup>
)

const DemoNavMenu: Component<any, ToastInjected> = async (_p, ctx) => {
  // 受控纪律（§5.2）：activeKey 必须配 onSelect 更新——否则点击静默失效
  let active = 'home'
  return async () => (
    <NavMenu
      items={[
        { key: 'home', label: '首页' },
        { key: 'docs', label: '文档', children: [
          { key: 'guide', label: '指南' },
          { key: 'api', label: 'API', children: [{ key: 'rest', label: 'REST' }, { key: 'ws', label: 'WebSocket' }] },
        ]},
        { key: 'about', label: '关于' },
      ]}
      activeKey={active}
      onSelect={(k) => { active = k; ctx.toast(k, 'info'); ctx.ui.render() }}
    />
  )
}

const DemoSpace: Component = async () => async () => (
  <Space split={<Divider vertical />}>
    <span>操作一</span>
    <span>操作二</span>
    <span>操作三</span>
  </Space>
)

const DemoGrid: Component = async () => async () => (
  <div class="wf-stack wf-gap-md wf-w-full">
    <Grid gutter={16}>
      <Col span={8}><div class="wf-surface wf-p-md wf-text-center">1/3</div></Col>
      <Col span={8}><div class="wf-surface wf-p-md wf-text-center">1/3</div></Col>
      <Col span={8}><div class="wf-surface wf-p-md wf-text-center">1/3</div></Col>
      <Col span={12}><div class="wf-surface wf-p-md wf-text-center">1/2</div></Col>
      <Col span={12}><div class="wf-surface wf-p-md wf-text-center">1/2</div></Col>
    </Grid>
    <Grid flex gap={8}>
      <div class="wf-surface wf-p-sm">弹性 A</div>
      <div class="wf-surface wf-p-sm">弹性 B</div>
    </Grid>
  </div>
)

const DemoScrollbar: Component = async () => async () => (
  <Scrollbar maxHeight={120}>
    <div class="wf-stack wf-gap-xs">
      {Array.from({ length: 20 }, (_, i) => <div key={i}>滚动行 {i + 1}</div>)}
    </div>
  </Scrollbar>
)

const DemoAlertGroup: Component = async () => async () => (
  <AlertGroup
    items={[
      { id: '1', message: '服务 A 重启完成', time: '10:01', variant: 'success' },
      { id: '2', message: '服务 B 发布成功', time: '10:02', variant: 'success' },
      { id: '3', message: '服务 C 容量告警', time: '10:03', variant: 'warning' },
      { id: '4', message: '服务 D 重启完成', time: '10:04', variant: 'success' },
    ]}
  />
)

const DemoStatCountdown: Component = async () => async () => (
  <StatCard label="活动倒计时" countdown={Date.now() + 3600 * 1000 + 95 * 1000} trend="up" trendLabel="进行中" />
)

const DemoDiffView: Component = async () => async () => (
  <DiffView
    oldCode={OLD_CODE}
    newCode={NEW_CODE}
    oldTitle="重构前"
    newTitle="重构后"
    foldThreshold={3}
  />
)

const DemoJSONViewer: Component = async () => async () => {
  const sample = {
    id: 'agent_42',
    name: '订单处理 Agent',
    active: true,
    model: { provider: 'openai', name: 'gpt-4o', temperature: 0.3 },
    tools: [
      { name: 'query_orders', args: { userId: 'u_7', limit: 10, filters: { status: 'pending', paid: false } } },
      { name: 'refund', args: { orderId: 'o_9', amount: 129.9, reason: 'duplicate' } },
    ],
    stats: { runs: 1284, successRate: 0.96, avgLatencyMs: 342 },
  }
  return (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <div style="max-height: 260px; overflow-y: auto">
        <JSONViewer data={sample} />
      </div>
      <span class="wf-text-xs wf-text-secondary">递归折叠 + 类型色 + hover 复制路径（JSONViewer，ToolCallCard 已接入）</span>
    </div>
  )
}

const DemoVirtualTable: Component = async (_props, ctx) => {
  let sortKey: string | undefined
  let sortOrder: 'asc' | 'desc' | undefined
  let selectedKeys: (string | number)[] = []
  const cols = [
    { key: 'id', label: 'ID', width: 80, sortable: true },
    { key: 'name', label: '用户名', width: 180, sortable: true },
    { key: 'email', label: '邮箱', width: 240 },
    { key: 'status', label: '状态', width: 100, render: (v: string) => v === 'active' ? <span class="wf-tag wf-tag--success">活跃</span> : <span class="wf-tag">停用</span> },
  ]
  const data = Array.from({ length: 10000 }, (_, i) => ({
    id: i + 1,
    name: `用户${i + 1}`,
    email: `user${i + 1}@weifuwu.dev`,
    status: i % 3 === 0 ? 'active' : 'inactive',
  }))
  return async () => (
    <div class="wf-w-full">
      <VirtualTable columns={cols} data={data} height={320} rowHeight={40}
        sortKey={sortKey} sortOrder={sortOrder}
        onSort={(k: string, o: 'asc' | 'desc') => { sortKey = k; sortOrder = o; ctx.ui.render() }}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: (k: (string|number)[]) => { selectedKeys = k; ctx.ui.render() } }} />
      <div class="wf-text-xs wf-text-secondary wf-mt-sm">10,000 行仅渲染可见窗口（滚动流畅）；表头可排序 + 行选择（已选 {selectedKeys.length}）</div>
    </div>
  )
}

const DemoQRCode: Component = async () => async () => (
  <div class="wf-row wf-gap-md">
    <QRCode value="https://weifuwu.dev" size={96} />
    <QRCode value="https://weifuwu.dev/docs" size={96} color="#4f6ef7" />
  </div>
)

const DemoInfiniteScroll: Component = async (_props, ctx) => {
  let items: string[] = Array.from({ length: 10 }, (_, i) => `条目 ${i + 1}`)
  let loading = false
  let hasMore = true
  return async () => (
    <InfiniteScroll
      loading={loading}
      hasMore={hasMore}
      onLoadMore={() => {
        loading = true; ctx.ui.render()
        setTimeout(() => {
          const next = Array.from({ length: 5 }, (_, i) => `条目 ${items.length + i + 1}`)
          items = [...items, ...next]
          loading = false
          if (items.length >= 30) hasMore = false
          ctx.ui.render()
        }, 600)
      }}>
      <div class="wf-stack wf-gap-xs">
        {items.map(t => <div key={t} class="wf-text-sm wf-border-b wf-py-xs">{t}</div>)}
      </div>
    </InfiniteScroll>
  )
}

// ── 代码示例字符串 ─────────────────────────────────────

const CODE = {
  button: `<Button variant="primary" onClick={...}>Primary</Button>
<Button variant="secondary" />
<Button variant="ghost" />
<Button variant="danger" />
<Button size="sm" /><Button size="md" /><Button size="lg" />
<Button loading>Loading</Button>
<Button disabled />
<Button block />`,

  input: `<Input label="文本" value={text}
  onInput={e => text = e.target.value} />
<Input label="邮箱" type="email" required />
<Input error="错误提示" />
<Input hint="辅助文字" />`,

  textarea: `<Textarea label="简介" rows={3}
  value={bio}
  onInput={e => bio = e.target.value} />
<Textarea error="错误" />`,

  select: `<Select label="角色" value={role}
  onChange={v => role = v}
  options={[
    {value:'admin',label:'管理员'},
  ]} />
{/* searchable 搜索过滤 */}
<Select searchable
  options={options}
  onChange={v => setVal(v)} />`,

  checkbox: `<Checkbox label="同意"
  checked={agree}
  onChange={v => agree = v} />`,

  switch: `<Switch label="启用"
  checked={notify}
  onChange={v => notify = v} />`,

  radio: `<RadioGroup name="gender"
  value={gender}
  onChange={v => gender = v}
  options={[
    {value:'male',label:'男'},
  ]} />`,

  segmented: `<SegmentedControl
  value={mode}
  onChange={v => mode = v}
  options={[
    {value:'ai', label:'🤖 AI 生成'},
    {value:'manual', label:'手动编写'},
    {value:'template', label:'模板'},
  ]} />
{/* size="sm" 小尺寸 / block 等分 */}
<SegmentedControl size="sm" block ... />`,

  slider: `<Slider label="音量" value={volume}
  onChange={v => setVolume(v)} />  // 拖拽/hover/focus 显示当前值气泡

<Slider label="价格" value={800} min={0} max={2000} step={50}
  marks={[{ value: 0, label: '0' }, { value: 500 },
          { value: 1000 }, { value: 2000, label: '2000' }]}
  onChangeEnd={v => console.log('拖拽结束:', v)} />`,

  form: `<Form
  validation={{
    email: {required: true, message: '必填'},
  }}
  onSubmit={values => ...}
  onError={errors => ...}>
  <Field label="邮箱" error={errors.email}>
    <Input name="email" />
  </Field>
  <Button type="submit">提交</Button>
</Form>`,

  field: `<Field label="姓名" required>
  <Input />
</Field>
<Field error="错误信息">
  <Input />
</Field>`,

  search: `<SearchInput value={query}
  onInput={e => query = e.target.value}
  onClear={() => query = ''} />`,

  progress: `<ProgressBar value={75} label="进度" showValue />`,

  table: `<Table data={items} columns={[
  {key:'id', label:'ID'},
  {key:'name', label:'姓名', sortable: true},
  {key:'status', label:'状态',
    render: v => <Badge>{v}</Badge>},
]}
  sortKey="name" sortOrder="asc"
  onSort={(k,o) => setSort(k,o)} />`,

  modal: `<Modal open={open}
  title="标题"
  width="500px"
  closable={false}
  onClose={() => open = false}>
  <p>内容</p>
</Modal>`,

  toast: `// toasts: [{id, type, message}]
<Toast toasts={toasts}
  position="top-right"
  max={3}
  onRemove={id => ...} />`,

  alert: `<Alert variant="info">提示</Alert>
<Alert variant="success">成功</Alert>
<Alert variant="warning">警告</Alert>
<Alert variant="error" closable>错误</Alert>`,

  loading: `<Loading />
<Loading text="提交中..." />`,

  skeleton: `<Skeleton />
<Skeleton lines={3} />
<Skeleton variant="avatar" />
<Skeleton variant="image" />
<Skeleton variant="table" lines={3} cols={4} />
<Skeleton variant="circle" width={40} height={40} />
<Skeleton variant="rect" width="100%" height={100} />`,

  image: `<Img src="/photo.jpg" alt="照片" />
<Img src="/photo.jpg" fallback="/placeholder.png" />
<Img src="..." loading="lazy" width={200} />
<Img src="..." preview /> {/* 点击放大：Escape/遮罩关闭 */}`,

  inview: `<InView>
  <ExpensiveComponent />
</InView>

<InView once={false} rootMargin="200px"
  onEnter={() => console.log('进入')}>
  <img src="large.jpg" />
</InView>`,

  confirm: `const ok = await ctx.confirm?.('确定删除？', {
  confirmText: '删除',
  variant: 'danger',
})
if (ok) { /* 执行 */ }`,

  empty: `<EmptyState
  text="暂无数据"
  hint="提示信息" />`,
  emptyAction: `<EmptyState text="还没有成员" hint="邀请成员">
  <button>邀请成员</button>
</EmptyState>`,
  descriptionsSize: `<Descriptions size="sm" items={[{label:'姓名',value:'张三'}]} column={2} />`,
  resultError: `<Result status="error" title="发布失败" desc="版本校验未通过">
  <button>重试</button>
</Result>`,
  highlightMulti: `<Highlight text="React 与 Vue" query={['react','vue']} />`,

  card: `<Card>默认卡片</Card>
<Card variant="outlined">线框</Card>
<Card clickable>可点击</Card>`,

  badge: `<Badge>默认</Badge>
<Badge variant="primary" />
<Badge variant="success" />
<Badge variant="danger" />
<Badge dot />`,

  tag: `<Tag>标签</Tag>
<Tag variant="primary" />
<Tag closable>可关闭</Tag>`,

  avatar: `<Avatar name="张三" />
<Avatar size="sm" />
<Avatar src="/photo.jpg" />`,

  stat: `<StatCard label="用户"
  value="1,234" icon={<Icon name="users" />}
  trend="up" trendLabel="12%" />`,

  steps: `<Steps items={[
  {key:'a',label:'第一步'},
]} active="b" />`,

  tabs: `<Tabs items={[
  {key:'a',label:'详情',
    content:<p>...</p>},
]} active="a" onChange={fn} />`,

  dropdown: `<Dropdown trigger={<Button>菜单</Button>}
  open={open}
  items={[
    {label:'编辑', onClick},
    {label:'删除', variant:'danger'},
  ]} />`,

  pagination: `<Pagination total={200}
  page={page} onChange={fn} />`,

  accordion: `<Accordion items={[
  {key:'a',title:'标题',
    content:<p>内容</p>},
]} />`,

  breadcrumb: `<Breadcrumb items={[
  { label: '首页', href: '/' },
  { label: '用户管理' },
  { label: '编辑' },
]} />`,

  divider: `<Divider />
<Divider vertical />
<Divider>或</Divider>`,

  pageheader: `<PageHeader title="用户管理" sub="管理平台所有用户的账号、角色与权限">
  <Button size="sm" variant="primary">新建用户</Button>
  <Button size="sm">导出</Button>
</PageHeader>
<PageHeader display title="大标题模式" />`,

  icon: `<Icon name="check" size={16} />
<Icon name="search" />
<Icon name="settings" size={20} />
{/* stroke SVG · currentColor · 1em 随字号 */}`,

  markdown: `<Markdown content={"# 标题\n\n**粗体** 与 \`code\`\n\n- 列表项\n\n[链接](https://weifuwu.dev)"} />`,

  codeblock: `<CodeBlock lang="ts" title="示例.ts" code={...} />
{/* 复制按钮 + 语言标签 + 横向滚动 */}`,

  timeline: `<Timeline items={[
  { key: '1', title: 'AI 回复', time: '10:00', status: 'success', content: '…' },
  { key: '2', title: '工具调用', time: '10:00', status: 'info' },
]} />`,

  inputNumber: `<InputNumber value={0.7} min={0} max={1} step={0.1} precision={1}
  onChange={v => setTemp(v)} />`,

  descriptions: `<Descriptions column={2} items={[
  { label: '名称', value: '小码' },
  { label: '状态', value: <Badge variant="success">运行中</Badge> },
]} />`,

  avatarGroup: `<AvatarGroup items={[{ name: '张三' }, { name: '李四' }]} max={3} />`,

  messageBubble: `<MessageBubble role="user" content="北京天气如何？" />
<MessageBubble role="assistant" status="streaming" content="…"
  actions={<Button size="sm">重试</Button>} />`,

  menu: `<Menu items={[
  { key: 'agents', label: 'Agent 管理', icon: <Icon name="cpu" size={16} />, group: '工作台' },
  { key: 'settings', label: '设置', icon: <Icon name="settings" size={16} />, group: '系统' },
]} activeKey="agents" onSelect={k => setActive(k)} />`,

  passwordInput: `<PasswordInput label="密码" value={pwd} onInput={e => setPwd(e.target.value)} />
{/* 眼睛按钮切换可见性 */}`,

  tagsInput: `<TagsInput value={tags} placeholder="回车添加标签"
  maxTags={10} onChange={setTags} />`,

  highlight: `<Highlight text="搜索 张三 的订单" query={['张三']} />`,

  list: `<List divided header="最近文件" items={files}
  renderItem={f => <div>{f.name}</div>} />`,

  result: `<Result status="success" title="注册成功" desc="…"
  extra={<Button variant="primary">进入工作台</Button>} />`,

  fileUpload: `<FileUpload accept="image/*,.pdf"
  multiple maxSize={5242880}
  value={files}
  onChange={f => files = f} />`,

  tooltip: `<Tooltip content="保存"
  position="top">
  <Button>保存</Button>
</Tooltip>`,

  drawer: `<Drawer open={open}
  title="编辑" position="right"
  onClose={() => open = false}>
  <p>内容</p>
</Drawer>`,

  datepicker: `<DatePicker mode="date" onChange={v => ...} />
<DatePicker mode="datetime" />
<DatePicker mode="time" />
<DatePicker mode="range" />`,

  chart: `<Chart type="line" data={data} title="标题" />
<Chart type="bar" data={data} />
<Chart type="pie" data={data} />
`,

  editor: `<Editor value={html} onChange={v => html = v}
  placeholder="输入内容..." />

<Editor toolbar={['bold','italic']}
  minHeight="150px" />

<Editor disabled value="只读" />
`,

  themeSwitch: `<ThemeSwitch />

<ThemeSwitch onChange={mode =>
  console.log(mode)} />  // auto | light | dark

{/* 预设主题行（可选）：minimal/compact/rounded，与暗色正交 */}
<ThemeSwitch preset="compact"
  onPresetChange={p =>
    console.log(p)} />

// 单值换肤：改 seed 一个值，色阶自动派生
:root {
  --wf-brand-seed: #7c3aed;
  --wf-dark-brand-seed: #a78bfa;  /* 暗色品牌（可选） */
}

// 命令式
import { applyTheme, getTheme } from 'weifuwu/components'
applyTheme('dark')
getTheme()  // 'auto' | 'light' | 'dark'
`,

  popover: `<Popover content={<div>面板内容</div>}>
  <Button>点击弹出</Button>
</Popover>

<Popover position="top" content=...>
  <Button>顶部</Button>
</Popover>

<Popover trigger="hover" content=...>
  <span>悬停查看</span>
</Popover>`,

  aichat: `const chat = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })
return () => <AiChat chat={chat} />

// 状态：chat.messages / chat.input / chat.streaming / chat.error
// 操作：chat.send() / chat.stop() / chat.retry() / chat.approve(decision)
// 订阅共享：ctx.ui.useExternal(chat) —— 子组件共享会话状态
// agent 消息内嵌：msg.toolCalls / msg.approval`,

  chatinput: `<ChatInput value={input} onChange={v => input = v}
  onSend={text => send(text)}      // 回车/按钮触发（trim 后非空）
  streaming={streaming}            // 流式 → 按钮变「停止」
  onStop={() => stop()}
  multiline                         // 多行 textarea（Shift+Enter 换行）
  actions={<button>附件</button>}  // 扩展位插槽
/>

// 纯输入层：不自带聊天逻辑（useChat 组合在消费方）`,

  authpage: `<AuthPage title="登录" subtitle="多租户 AI 平台" logo={<Avatar />}
  submitLabel="登 录" loading={loading} error={error}
  onSubmit={submit}                 // 表单提交回调（preventDefault 已处理）
  footer={<span>没有账号？<a>注册</a></span>}>
  <Field label="邮箱"><Input type="email" /></Field>
  <Field label="密码"><PasswordInput /></Field>
</AuthPage>

// 纯骨架：字段（children）与提交逻辑（onSubmit）由消费方提供
// 认证流程（token/跳转）不进组件——框架 ctx.auth 可组合`,

  toolcall: `<ToolCallCard call={{ id, name, args }} />
<ToolCallCard call={...} progress={{ toolCallId, step, total }} />
<ToolCallCard call={...} result={{ id, ok, output }} />

// 状态机：running → ok / error`,

  approval: `<ApprovalCard request={{ id, toolCallId, name, args }}
  argsSchema={toolSchema}                       // 提供 → 「修改参数」入口（JsonSchemaForm）
  onApprove={(modifiedArgs) =>
    chat.approve(modifiedArgs ? 'modified' : 'approved', undefined, modifiedArgs)}
  onReject={(note) => chat.approve('rejected', note)} />

// 终态：<ApprovalCard request={...} status="approved" />`,

  rate: `<Rate value={3} onChange={setRate} />
<Rate value={4} readOnly />
<Rate size="lg" allowClear />`,

  typography: `<Title level={1}>标题</Title>
<Text type="secondary">次要</Text>
<Text type="danger">危险</Text>
<Text code>code</Text>
<Paragraph ellipsis>长文本</Paragraph>`,

  label: `<Label htmlFor="name">用户名</Label>
<Label required>必填</Label>`,

  ratio: `<AspectRatio ratio={16/9}>
  <img src="..." />
</AspectRatio>`,

  togglegroup: `<ToggleGroup type="single" options={[{value:'b',label:'B'}]} />
<ToggleGroup type="multiple" />
<Toggle pressed>单个</Toggle>`,

  checkboxgroup: `<CheckboxGroup options={[{value:'a',label:'A'}]}
  value={selected} onChange={setSelected} />`,

  pininput: `<PinInput length={6} value={code}
  onChange={setCode} />`,

  copybtn: `<CopyButton value="https://..." label="复制" />`,

  colorpicker: `<ColorPicker value={color} showInput
  onChange={setColor} />`,

  hovercard: `<HoverCard content={<UserCard />}>
  <Button>悬停</Button>
</HoverCard>`,

  notification: `notification.success({
  title: '部署成功',
  description: 'v0.63.0 已上线',
})`,

  backtop: `<BackTop visibilityHeight={400} />

<Affix offsetTop={80}>
  <nav>固定导航条</nav>
</Affix>`,

  anchor: `<Anchor items={[{ href: '#intro', title: '简介' }, ...]}
  activeKey={active} onAnchorChange={setActive} />`,

  contextmenu: `<ContextMenu items={[{key:'edit',label:'编辑'}]}>
  <div>右键区域</div>
</ContextMenu>`,

  mentions: `<Mentions options={[{value:'alice',label:'Alice'}]}
  value={text} onChange={setText} />`,

  collapse: `<Collapse items={[{key:'1',title:'标题',content:'内容',loading}]}
  active={['1']} />`,

  tree: `<Tree data={treeData} checkable
  checkedKeys={keys} onCheck={setKeys} />`,

  cascader: `<Cascader options={regions}
  value={['zj','hz']} onChange={setPath} />`,

  autocompleteDis: `<AutoComplete options={[{value:'pay-admin',label:'支付平台管理'},{value:'order-center',label:'订单中心'}]}
  value="" disabled placeholder="禁用时不可输入" />`,
  cascaderDis: `<Cascader options={regions} disabled error="地区必填" />`,
  calendarEvents: `<Calendar month={5} year={2025} selectedDate="2025-06-10"
  events={[{date:'2025-06-10',title:'需求评审'}]} onSelectDate={d => set(d)} />`,
  mentionsDis: `<Mentions options={users} disabled rows={2} placeholder="输入 @ 提及成员…" />`,
  tagsInputErr: `<TagsInput value={tags} maxTags={3} error="标签超限" onChange={t => set(t)} />`,
  pininputDis: `<PinInput length={6} disabled />`,
  fileUploadDis: `<FileUpload accept="image/*" multiple disabled error />`,
  formSubmit: `<Form validation={{name:[{required:true,minLength:2}]}}
  onSubmit={submit}><Field label="项目名称" required><Input name="name" /></Field>
  <Button type="submit" loading={loading}>提交</Button></Form>`,
  tableRowSelect: `<Table rowSelection={{selectedRowKeys, onChange:setKeys}}
  data={rows} columns={[{key:'name',label:'姓名'}]} />`,
  virtualtableBig: `<VirtualTable height={280} data={100000行大数据} columns={[{key:'id',label:'ID'}]} />`,
  treeCheck: `<Tree data={treeData} checkable checkedKeys={checked} onCheck={setChecked} />`,
  jsonviewerDeep: `<JSONViewer defaultExpandDepth={3} data={大对象} />`,
  logviewerCustom: `<LogViewer height={140} lines={ANSI日志} showLineNumbers showCopy />`,
  diffviewBig: `<DiffView oldTitle="旧实现" newTitle="新实现" oldCode={...} newCode={...} />`,
  infinitescrollRetry: `<InfiniteScroll hasMore loading onLoadMore={加载}
  endText="已全部加载">...</InfiniteScroll>`,
  transfer: `<Transfer data={members}
  targetKeys={selected} onChange={setSelected} />`,

  command: `<Command items={items} open={open}
  onOpenChange={setOpen} />`,

  menubar: `<Menubar menus={[{key:'file',label:'文件',items:[...]}]} />`,

  carousel: `<Carousel autoplay interval={3000}>
  {slides.map(s => <div>{s}</div>)}
</Carousel>`,

  resizable: `<Resizable defaultSize={180}>
  {[<PaneA />, <PaneB />]}
</Resizable>`,

  calendar: `<Calendar month={5} year={2025}
  events={events} selectedDate="2025-06-10" />`,

  watermark: `<Watermark text="内部资料">
  <div>内容</div>
</Watermark>`,

  virtuallist: `<VirtualList height={400} itemHeight={36}
  items={rows} renderItem={renderRow} />`,

  virtualtable: `<VirtualTable columns={cols} data={rows} height={320}
  sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} />`,

  logviewer: `<LogViewer lines={logs} height={260} follow
  showCopy showLineNumbers maxLines={500} />`,

  jsonviewer: `<JSONViewer data={payload} defaultExpandDepth={2} maxKeys={100} />`,
  jsonschemaform: `<JsonSchemaForm
  schema={toolSchema}
  value={{ city: '北京' }}
  onSubmit={(v) => console.log('执行', v)}
  submitLabel="执行工具"
/>`,
  reasoningblock: `<ReasoningBlock content={reasoningText} />`,
  citationcard: `<CitationCard items={[{ id, title, source, snippet, url }]} maxVisible={3} />`,
  sessionlist: `<SessionList sessions={sessions} activeId={cur} searchable
  onSelect={setCur} onNew={create} onRename={rename} onDelete={remove} />`,
  diffview: `<DiffView oldCode={oldCode} newCode={newCode} oldTitle="重构前" newTitle="重构后" />`,
  sparkline: `<Sparkline data={[12, 18, 15, 22, 30, 28, 35]} width={140} height={36} fill />`,
  tour: `<Tour steps={[{ target: '#a', title: '开始', content: '...' }]} open={open} onChange={setOpen} />`,
  kanban: `<Kanban columns={cols} onMove={(from, to) => {}} />`,
  pipeline: `<Pipeline orientation="horizontal" nodes={[{ id: 'a', label: '输入' }]} edges={[]} />`,
  treeselect: `<TreeSelect options={options} value={value} onChange={setValue} />`,

  layout: `<Layout>
  <LayoutSider collapsible collapsed onCollapse={setCollapsed}>导航</LayoutSider>
  <Layout>
    <LayoutHeader>顶部</LayoutHeader>
    <LayoutContent>主区</LayoutContent>
    <LayoutFooter>底部</LayoutFooter>
  </Layout>
</Layout>`,

  popconfirm: `<Popconfirm title="确定删除？" danger onConfirm={del}>
  <Button variant="danger">删除</Button>
</Popconfirm>`,

  autocomplete: `<AutoComplete options={options}
  value={query} onChange={setQuery} />`,

  link: `<Link href="/docs" variant="primary">文档</Link>`,

  floatbutton: `<FloatButtonGroup>
  <FloatButton icon={editIcon} onClick={edit} />
</FloatButtonGroup>`,

  navmenu: `<NavMenu items={items} activeKey="home" onSelect={go} />`,

  space: `<Space split={<Divider vertical />}>
  <span>一</span><span>二</span><span>三</span>
</Space>`,

  grid: `<Grid gutter={16}>
  <Col span={8}>A</Col><Col span={8}>B</Col><Col span={8}>C</Col>
</Grid>`,

  scrollbar: `<Scrollbar maxHeight={120}>长内容</Scrollbar>`,

  alertgroup: `<AlertGroup items={alerts} />`,

  statCountdown: `<StatCard label="倒计时" countdown={deadline} />`,

  qrcode: `<QRCode value="https://weifuwu.dev" size={128} />
<QRCode value="..." color="#4f6ef7" />`,

  infinitescroll: `<InfiniteScroll hasMore loading={loading}
  onLoadMore={loadMore}>
  {items.map(i => <div>{i}</div>)}
</InfiniteScroll>`,
}

// ── 主应用 ─────────────────────────────────────────────

const App: Component = async (_props, ctx) => {
  // hash 深链：客户端渲染完成后跳转（浏览器原生锚点跳转发生在内容渲染之前）
  ctx.browser?.timeout(() => {
    const id = location.hash.slice(1)
    if (id) ctx.browser?.byId(id)?.scrollIntoView()
  }, 50)
  return async (_p: any) => {
    const cur = (ctx as any)?.i18n?.locale ?? 'zh-CN'
    const isEn = cur.startsWith('en')
    return (
    <div class="wf-container wf-stack" style="--wf-max:960px;--wf-gap:32px">
      {/* 吸顶导航：分组错点 + 搜索过滤 + 主题/语言（layouts-demo 壳范式） */}
      <div class="wf-sticky wf-row wf-gap-sm wf-p-sm wf-bg-primary wf-border-b" style="--wf-offset:0;z-index:var(--wf-pop-z)">
        <b class="wf-text-bold wf-text-nowrap">wf/components</b>
        <nav class="wf-row wf-nowrap wf-scroll wf-gap-xs wf-fill" aria-label="组件分组">
          {SECTIONS.map((s) => (
            <a key={s} href={`#${secId(s)}`} class="wf-nav-item wf-text-nowrap wf-text-sm">{s}</a>
          ))}
        </nav>
        <div class="wf-row wf-gap-sm">
          <SearchInput
            placeholder="搜索组件…"
            value={cardFilter.q}
            onInput={(e) => { cardFilter.q = (e.target as HTMLInputElement).value; ctx.ui.render() }}
            onClear={() => { cardFilter.q = ''; ctx.ui.render() }}
          />
          <ThemeSwitch />
          <Button size="sm" variant={cur.startsWith('zh') ? 'primary' : 'ghost'} onClick={() => (ctx as any)?.i18n?.setLocale?.('zh-CN')}>中文</Button>
          <Button size="sm" variant={isEn ? 'primary' : 'ghost'} onClick={() => (ctx as any)?.i18n?.setLocale?.('en')}>EN</Button>
        </div>
      </div>
      <div class="wf-text-center wf-py-xl">
        <h1 class="wf-text-4xl wf-mb-sm wf-m-0">{(ctx as any)?.i18n?.t?.('app.title') ?? 'weifuwu/components'}</h1>
        <p class="wf-text-secondary">{isEn
          ? '115 HTML primitive components · pure (props, ctx) → VNode · drop-in'
          : ((ctx as any)?.i18n?.t?.('app.desc') ?? '115 个 HTML 原语组件 · 纯函数 (props, ctx) → VNode · 即插即用')}</p>
        <div class="wf-cluster wf-gap-md wf-mt-md">
          <Badge variant="primary">115 组件</Badge>
          <Badge variant="success">1049 测试</Badge>
          <Badge variant="info">零依赖</Badge>
        </div>
      </div>

      <Section title="表单核心">
        <DemoCard title="Button" desc="4 variants × 3 sizes + loading + block + disabled" code={CODE.button}><DemoButton /></DemoCard>
        <DemoCard title="Input" desc="text/email/password/number，支持 label/error/hint/required" code={CODE.input}><DemoInput /></DemoCard>
        <DemoCard title="Textarea" desc="多行文本，支持 rows/label/error/hint" code={CODE.textarea}><DemoTextarea /></DemoCard>
        <DemoCard title="Select" desc="原生下拉选择器" code={CODE.select}><DemoSelect /></DemoCard>
        <DemoCard title="Select (searchable)" desc="搜索过滤下拉，输入即搜" code={CODE.select}><DemoSearchableSelect /></DemoCard>
      </Section>

      <Section title="表单选择">
        <DemoCard title="Checkbox" desc="带 label 的复选框，支持 checked/disabled" code={CODE.checkbox}><DemoCheckbox /></DemoCard>
        <DemoCard title="Switch" desc="开关切换，视觉替代 checkbox" code={CODE.switch}><DemoSwitch /></DemoCard>
        <DemoCard title="RadioGroup" desc="单选组，支持 inline/options/value" code={CODE.radio}><DemoRadio /></DemoCard>
        <DemoCard title="SegmentedControl" desc="分段单选（模式切换/筛选/模板），支持 sm/block" code={CODE.segmented}><DemoSegmented /></DemoCard>
        <DemoCard title="Slider" desc="范围滑块，支持 min/max/step/label" code={CODE.slider}><DemoSlider /></DemoCard>
      </Section>

      <Section title="表单增强">
        <DemoCard title="Form" desc="内置验证规则：required/pattern/minLength/自定义" code={CODE.form}><DemoForm /></DemoCard>
        <DemoCard title="Form 提交" desc="loading 提交 + 校验错误（状态矩阵覆盖）" code={CODE.formSubmit}><DemoFormSubmit /></DemoCard>
        <DemoCard title="Field" desc="label+error+hint 容器" code={CODE.field}><DemoField /></DemoCard>
        <DemoCard title="FileUpload" desc="文件上传，拖拽区 + 文件列表 + accept/maxSize" code={CODE.fileUpload}><DemoFileUpload /></DemoCard>
        <DemoCard title="FileUpload 禁用" desc="disabled + accept 限定（状态矩阵覆盖）" code={CODE.fileUploadDis}><DemoFileUploadDis /></DemoCard>
        <DemoCard title="SearchInput" desc="搜索输入框，带清除按钮" code={CODE.search}><DemoSearchInput /></DemoCard>
        <DemoCard title="ProgressBar" desc="进度条，支持 label/showValue" code={CODE.progress}><DemoProgress /></DemoCard>
        <DemoCard title="InputNumber" desc="数字输入：min/max/step + 增减按钮 + precision" code={CODE.inputNumber}><DemoInputNumber /></DemoCard>
        <DemoCard title="PasswordInput" desc="密码输入：眼睛按钮切换可见性" code={CODE.passwordInput}><DemoPasswordInput /></DemoCard>
        <DemoCard title="TagsInput" desc="标签输入：回车/逗号添加 + 中文输入法感知" code={CODE.tagsInput}><DemoTagsInput /></DemoCard>
        <DemoCard title="TagsInput 限制/错误" desc="maxTags 限制 + error 校验态（状态矩阵覆盖）" code={CODE.tagsInputErr}><DemoTagsInputErr /></DemoCard>
      </Section>

      <Section title="数据展示">
        <DemoCard title="Table" desc="可排序 + 自定义 render + 空状态" code={CODE.table}><DemoTable /></DemoCard>
        <DemoCard title="Table 行选择" desc="rowSelection 勾选列 + 受控 keys（状态矩阵覆盖）" code={CODE.tableRowSelect}><DemoTableRowSelect /></DemoCard>
        <DemoCard title="Card" desc="容器，支持 default/outlined/clickable" code={CODE.card}><DemoCardShowcase /></DemoCard>
        <DemoCard title="Badge" desc="状态标签 + 圆点，6 种 variant" code={CODE.badge}><DemoBadge /></DemoCard>
        <DemoCard title="Tag" desc="标签，支持 closable/onClose" code={CODE.tag}><DemoTag /></DemoCard>
        <DemoCard title="Avatar" desc="头像（首字母/图片），3 种 size" code={CODE.avatar}><DemoAvatar /></DemoCard>
        <DemoCard title="Img" desc="图片 \<img\> 组件：fallback / lazy / preview 点击放大" code={CODE.image}><DemoImage /></DemoCard>
        <DemoCard title="InView" desc="进入视窗后懒加载内容，支持 IntersectionObserver" code={CODE.inview}><DemoInView /></DemoCard>
        <DemoCard title="Timeline" desc="时间线：节点状态色 + 时间 + 内容（执行日志/审批历史）" code={CODE.timeline}><DemoTimeline /></DemoCard>
        <DemoCard title="Descriptions" desc="描述列表：label/value 栅格 + bordered + span（详情页）" code={CODE.descriptions}><DemoDescriptions /></DemoCard>
        <DemoCard title="Descriptions 紧凑" desc="size=small 详情页密度（变体覆盖）" code={CODE.descriptionsSize}><DemoDescriptionsSize /></DemoCard>
        <DemoCard title="AvatarGroup" desc="头像组：堆叠 + max 溢出 +N" code={CODE.avatarGroup}><DemoAvatarGroup /></DemoCard>
        <DemoCard title="Markdown" desc="AI 回复渲染：安全子集 parser + 代码块 + 链接白名单" code={CODE.markdown}><DemoMarkdown /></DemoCard>
        <DemoCard title="CodeBlock" desc="代码块：语言标签 + 复制按钮 + 横向滚动" code={CODE.codeblock}><DemoCodeBlock /></DemoCard>
        <DemoCard title="LogViewer" desc="日志流：ANSI 着色 + 虚拟滚动 + 自动跟随 + 复制" code={CODE.logviewer}><DemoLogViewer /></DemoCard>
        <DemoCard title="LogViewer 自定义" desc="自定义日志源 + 行号 + 复制（变体覆盖）" code={CODE.logviewerCustom}><DemoLogViewerCustom /></DemoCard>
        <DemoCard title="JSONViewer" desc="结构化 JSON：递归折叠 + 类型色 + 路径复制 + 懒展开" code={CODE.jsonviewer}><DemoJSONViewer /></DemoCard>
        <DemoCard title="JSONViewer 深展开" desc="defaultExpandDepth 深度展开嵌套对象（变体覆盖）" code={CODE.jsonviewerDeep}><DemoJSONViewerDeep /></DemoCard>
        <DemoCard title="DiffView" desc="代码 diff：LCS 行级对比 + 未变块折叠 + 三态着色" code={CODE.diffview}><DemoDiffView /></DemoCard>
        <DemoCard title="DiffView 标题" desc="oldTitle/newTitle 标记版本对比（变体覆盖）" code={CODE.diffviewBig}><DemoDiffViewBig /></DemoCard>
        <DemoCard title="Sparkline" desc="迷你趋势线：SVG 自绘 + 归一化 + 平滑曲线 + 面积填充" code={CODE.sparkline}><DemoSparkline /></DemoCard>
        <DemoCard title="Tour" desc="新手引导：步骤气泡 + 目标高亮 + 遮罩 + 键盘 Escape" code={CODE.tour}><DemoTour /></DemoCard>
        <DemoCard title="Kanban" desc="看板：原生 DnD 拖拽 + 跨列/重排 + 悬停高亮" code={CODE.kanban}><DemoKanban /></DemoCard>
        <DemoCard title="Pipeline" desc="Agent 工作流 DAG：分层布局 + 贝塞尔连线 + 状态语义色 + 环检测" code={CODE.pipeline}><DemoPipeline /></DemoCard>
        <DemoCard title="TreeSelect" desc="树形选择：单选/多选（父子联动）+ 选中 label 回显 + 受控纪律" code={CODE.treeselect}><DemoTreeSelect /></DemoCard>
        <DemoCard title="Layout" desc="布局外壳：Sider 折叠 + Header/Content/Footer 骨架（antd Layout / shadcn Sidebar 等价）" code={CODE.layout}><DemoLayout /></DemoCard>
        <DemoCard title="Popconfirm" desc="气泡确认：危险操作防误触 + 复用 usePopup 基座" code={CODE.popconfirm}><DemoPopconfirm /></DemoCard>
        <DemoCard title="AutoComplete" desc="输入联想：自由输入 + 过滤下拉 + 键盘流 + 选中回填" code={CODE.autocomplete}><DemoAutoComplete /></DemoCard>
        <DemoCard title="AutoComplete 禁用态" desc="disabled 时不可输入（状态矩阵覆盖）" code={CODE.autocompleteDis}><DemoAutoCompleteDis /></DemoCard>
        <DemoCard title="Link" desc="文字链接：语义色/下划线/disabled/新窗口" code={CODE.link}><DemoLink /></DemoCard>
        <DemoCard title="FloatButton" desc="悬浮按钮组：展开状态机 + badge" code={CODE.floatbutton}><DemoFloatButton /></DemoCard>
        <DemoCard title="NavMenu" desc="顶部导航：多级 hover 弹出 + 键盘（shadcn NavigationMenu）" code={CODE.navmenu}><DemoNavMenu /></DemoCard>
        <DemoCard title="Space" desc="间距容器：size/direction/wrap + split 分隔符" code={CODE.space}><DemoSpace /></DemoCard>
        <DemoCard title="Grid" desc="24 栅格 + gutter + flex 容器模式（Row/Col/Flex 等价）" code={CODE.grid}><DemoGrid /></DemoCard>
        <DemoCard title="Scrollbar" desc="自定义滚动容器：webkit 样式 + hover 显示" code={CODE.scrollbar}><DemoScrollbar /></DemoCard>
        <DemoCard title="AlertGroup" desc="通知合并组：≥3 条折叠为 +N，点击展开" code={CODE.alertgroup}><DemoAlertGroup /></DemoCard>
        <DemoCard title="StatCard Countdown" desc="倒计时模式：剩余 HH:MM:SS + 结束回调" code={CODE.statCountdown}><DemoStatCountdown /></DemoCard>
        <DemoCard title="MessageBubble" desc="消息气泡：user/assistant + streaming/error 状态 + actions" code={CODE.messageBubble}><DemoMessageBubble /></DemoCard>
        <DemoCard title="Highlight" desc="搜索词高亮：分词渲染 mark，大小写不敏感" code={CODE.highlight}><DemoHighlight /></DemoCard>
        <DemoCard title="Highlight 多词" desc="query 数组多词高亮（变体覆盖）" code={CODE.highlightMulti}><DemoHighlightMulti /></DemoCard>
        <DemoCard title="List" desc="通用列表：renderItem + divided + header/footer/empty" code={CODE.list}><DemoList /></DemoCard>
        <DemoCard title="Result" desc="结果页：success/error/warning/info + extra 操作区" code={CODE.result}><DemoResult /></DemoCard>
        <DemoCard title="Confirm" desc="确认对话框，Promise 化 await 调用" code={CODE.confirm}><DemoConfirm /></DemoCard>
        <DemoCard title="StatCard" desc="KPI 指标卡，支持 trend/icon" code={CODE.stat}><DemoStatCard /></DemoCard>
        <DemoCard title="Chart" desc="SVG 图表：line/bar/pie" code={CODE.chart}><DemoChart /></DemoCard>
        <DemoCard title="Editor" desc="富文本编辑器，contentEditable + toolbar，零依赖" code={CODE.editor}><DemoEditor /></DemoCard>
        <DemoCard title="ThemeSwitch" desc="主题切换：auto/light/dark，localStorage 持久化" code={CODE.themeSwitch}><DemoThemeSwitch /></DemoCard>
      </Section>

      <Section title="数据反馈">
        <DemoCard title="DatePicker" desc="日期选择器，四种模式：date/datetime/time/range" code={CODE.datepicker}><DemoDatePicker /></DemoCard>
        <DemoCard title="Modal" desc="自定义宽度 + closable 控制关闭按钮" code={CODE.modal}><DemoModal /></DemoCard>
        <DemoCard title="Drawer" desc="侧边面板，左右滑入 + ESC 关闭" code={CODE.drawer}><DemoDrawer /></DemoCard>
        <DemoCard title="Popover" desc="通用弹出层，click/hover 触发，4 方向" code={CODE.popover}><DemoPopover /></DemoCard>
        <DemoCard title="Tooltip" desc="hover 浮动提示，4 方向" code={CODE.tooltip}><DemoTooltip /></DemoCard>
        <DemoCard title="Toast" desc="5 种位置 + 自动消失 + 数量限制" code={CODE.toast}><DemoToast /></DemoCard>
        <DemoCard title="Alert" desc="信息提示条，4 种 variant + closable" code={CODE.alert}><DemoAlert /></DemoCard>
        <DemoCard title="Loading" desc="加载状态，支持自定义文字" code={CODE.loading}><DemoLoading /></DemoCard>
        <DemoCard title="Skeleton" desc="text/circle/rect/image/avatar/table 六种变体" code={CODE.skeleton}><DemoSkeleton /></DemoCard>
        <DemoCard title="EmptyState" desc="空状态占位，支持 icon/text/hint/action" code={CODE.empty}><DemoEmptyState /></DemoCard>
      </Section>

      <Section title="导航组件">
        <DemoCard title="Breadcrumb" desc="面包屑导航，支持 aria-current" code={CODE.breadcrumb}><DemoBreadcrumb /></DemoCard>
        <DemoCard title="Menu" desc="侧栏导航：分组 + 图标 + 选中态 + 方向键" code={CODE.menu}><DemoMenu /></DemoCard>
        <DemoCard title="Tabs" desc="标签页切换，支持 active/onChange" code={CODE.tabs}><DemoTabs /></DemoCard>
        <DemoCard title="Dropdown" desc="下拉菜单，支持 danger variant" code={CODE.dropdown}><DemoDropdown /></DemoCard>
        <DemoCard title="Pagination" desc="分页器，自动计算页码范围" code={CODE.pagination}><DemoPagination /></DemoCard>
        <DemoCard title="Steps" desc="分步指示器，支持 active/current" code={CODE.steps}><DemoSteps /></DemoCard>
        <DemoCard title="Accordion" desc="折叠面板，支持多个 items" code={CODE.accordion}><DemoAccordion /></DemoCard>
      </Section>

      <Section title="AI 对话">
        <DemoCard title="AiChat" desc="useChat + 标准对话界面：流式 token / 工具卡 / 审批卡 / 自动滚动，协议对页面透明" code={CODE.aichat}><DemoAiChat /></DemoCard>
        <DemoCard title="ChatInput" desc="独立聊天输入条（AiChat 抽取）：单行/多行 + streaming 停止 + IME 安全——不自带聊天逻辑" code={CODE.chatinput}><DemoChatInput /></DemoCard>
        <DemoCard title="AuthPage" desc="认证页骨架：居中卡片 + logo + 表单插槽 + 错误条 + 提交 loading（登录/注册复用）" code={CODE.authpage}><DemoAuthPage /></DemoCard>
        <DemoCard title="ToolCallCard" desc="工具调用卡片：running / ok / error 状态机（call/progress/result 三字段驱动）" code={CODE.toolcall}><DemoToolCallCard /></DemoCard>
        <DemoCard title="JsonSchemaForm" desc="JSON Schema → 参数输入表单：类型映射 + 必填/范围校验 + 嵌套/数组（AI 工具参数输入面）" code={CODE.jsonschemaform}><DemoJsonSchemaForm /></DemoCard>
        <DemoCard title="ReasoningBlock" desc="CoT 推理折叠展示：aria-expanded + 键盘可达 + 流式脉冲（thinking 模式 reasoning_content）" code={CODE.reasoningblock}><DemoReasoningBlock /></DemoCard>
        <DemoCard title="CitationCard" desc="RAG 引用来源：折叠「引用 N 条」+ 条目列表（序号/标题/来源/片段/链接）+ 溢出 +N" code={CODE.citationcard}><DemoCitationCard /></DemoCard>
        <DemoCard title="SessionList" desc="会话管理列表：分组（今天/昨天/更早）+ 搜索 + 选中 + 重命名/删除/新建 + 键盘导航" code={CODE.sessionlist}><DemoSessionList /></DemoCard>
        <DemoCard title="ApprovalCard" desc="HITL 审批卡片：pending 可批/拒 + 修改参数（JsonSchemaForm）· approved/rejected/timeout 终态" code={CODE.approval}><DemoApprovalCard /></DemoCard>
      </Section>

      <Section title="其他">
        <DemoCard title="PageHeader" desc="页面标题栏，支持 sub + 右侧操作区 + display 大标题" code={CODE.pageheader}><DemoPageHeader /></DemoCard>
        <DemoCard title="Icon" desc="stroke SVG 图标集，currentColor 着色，随字号缩放" code={CODE.icon}><DemoIcon /></DemoCard>
        <DemoCard title="Divider" desc="分割线，支持 horizontal/vertical/带文字" code={CODE.divider}><DemoDivider /></DemoCard>
      </Section>

      <Section title="新增批次">
        <DemoCard title="Rate" desc="评分：键盘方向键 / allowClear / readOnly，新增 star 图标" code={CODE.rate}><DemoRate /></DemoCard>
        <DemoCard title="Typography" desc="Title/Text/Paragraph：语义标签 + 语义色 -text 变体 + mark/code/删除线" code={CODE.typography}><DemoTypography /></DemoCard>
        <DemoCard title="Label / AspectRatio" desc="独立标签（required 星号）+ 宽高比容器（内容填满）" code={CODE.label}><DemoLabel /><DemoAspectRatio /></DemoCard>
        <DemoCard title="Toggle / ToggleGroup" desc="切换按钮：single/multiple 双模式（shadcn 对齐）" code={CODE.togglegroup}><DemoToggleGroup /></DemoCard>
        <DemoCard title="CheckboxGroup" desc="复选框组：数组受控 + 栅格列数（antd Checkbox.Group）" code={CODE.checkboxgroup}><DemoCheckboxGroup /></DemoCard>
        <DemoCard title="PinInput" desc="验证码输入：自动聚焦/粘贴分派/Backspace 回退（shadcn InputOTP）" code={CODE.pininput}><DemoPinInput /></DemoCard>
        <DemoCard title="PinInput 禁用态" desc="disabled 不可编辑（状态矩阵覆盖）" code={CODE.pininputDis}><DemoPinInputDis /></DemoCard>
        <DemoCard title="CopyButton" desc="复制按钮：clipboard + execCommand 降级 + 成功状态机" code={CODE.copybtn}><DemoCopyButton /></DemoCard>
        <DemoCard title="ColorPicker" desc="颜色选择：预设色板 + hex 输入（Popover 弹层）" code={CODE.colorpicker}><DemoColorPicker /></DemoCard>
        <DemoCard title="HoverCard" desc="悬停富内容卡：openDelay 延迟 + 任意 VNode（shadcn）" code={CODE.hovercard}><DemoHoverCard /></DemoCard>
        <DemoCard title="Notification" desc="队列式通知：notification.success/error/warning 命令式（antd 对齐）" code={CODE.notification}><DemoNotification /></DemoCard>
        <DemoCard title="BackTop / Affix" desc="回到顶部（滚动超 400px 显示）+ 固定导航（距顶 80px 钉住）" code={CODE.backtop}><DemoBackTop /><DemoAffix /></DemoCard>
        <DemoCard title="Anchor" desc="锚点导航：滚动高亮跟随 + 点击平滑滚动" code={CODE.anchor}><DemoAnchor /></DemoCard>
        <DemoCard title="ContextMenu" desc="右键菜单：光标定位 + 方向键 + danger 变体（shadcn）" code={CODE.contextmenu}><DemoContextMenu /></DemoCard>
        <DemoCard title="Mentions" desc="@提及：composition 抑制 + 过滤插入（antd Mentions）" code={CODE.mentions}><DemoMentions /></DemoCard>
        <DemoCard title="Mentions 禁用态" desc="disabled 时不可输入（状态矩阵覆盖）" code={CODE.mentionsDis}><DemoMentionsDis /></DemoCard>
        <DemoCard title="Collapse" desc="行内折叠：异步 loading + extra 操作区（区别于 Accordion）" code={CODE.collapse}><DemoCollapse /></DemoCard>
        <DemoCard title="Tree" desc="树形：递归模型 + 勾选父子联动 + indeterminate（antd/EP Tree）" code={CODE.tree}><DemoToggleTree /></DemoCard>
        <DemoCard title="Tree 勾选" desc="checkable 父子联动 + 受控 checkedKeys（变体覆盖）" code={CODE.treeCheck}><DemoToggleTreeCheck /></DemoCard>
        <DemoCard title="Cascader" desc="级联选择：多列面板逐级推进（antd/EP Cascader）" code={CODE.cascader}><DemoCascader /></DemoCard>
        <DemoCard title="Cascader 禁用/错误" desc="disabled + error 校验态（状态矩阵覆盖）" code={CODE.cascaderDis}><DemoCascaderDis /></DemoCard>
        <DemoCard title="Transfer" desc="穿梭框：双列表 + 选中移动（antd/EP Transfer）" code={CODE.transfer}><DemoTransfer /></DemoCard>
        <DemoCard title="Command" desc="命令面板：⌘K 全局快捷键 + 键盘流（shadcn Command）" code={CODE.command}><DemoCommand /></DemoCard>
        <DemoCard title="Menubar" desc="水平菜单栏：←→ 切换 + ↓ 展开（shadcn Menubar）" code={CODE.menubar}><DemoMenubar /></DemoCard>
        <DemoCard title="Carousel" desc="轮播：箭头/圆点/循环 + 自动播放（三库共识）" code={CODE.carousel}><DemoCarousel /></DemoCard>
        <DemoCard title="Resizable" desc="拖拽分割面板：pointer + 键盘方向键 + clamp（shadcn）" code={CODE.resizable}><DemoResizable /></DemoCard>
        <DemoCard title="Calendar" desc="月历：事件点 + 月切换 + 日期选择（antd/EP Calendar）" code={CODE.calendar}><DemoCalendar /></DemoCard>
        <DemoCard title="Calendar 事件" desc="事件标记 + 日期选择交互（变体覆盖）" code={CODE.calendarEvents}><DemoCalendarEvents /></DemoCard>
        <DemoCard title="Watermark" desc="水印：canvas 平铺绘制 + overlay（antd Watermark）" code={CODE.watermark}><DemoWatermark /></DemoCard>
        <DemoCard title="VirtualList" desc="虚拟列表：spacer + 可见窗口，200 条只渲染 ~12 个 DOM" code={CODE.virtuallist}><DemoVirtualList /></DemoCard>
        <DemoCard title="VirtualTable" desc="虚拟表格：10k 行固定表头 + 可见窗口渲染 + 排序" code={CODE.virtualtable}><DemoVirtualTable /></DemoCard>
        <DemoCard title="VirtualTable 大数据" desc="10 万行虚拟滚动（只渲染可见窗口——性能展示）" code={CODE.virtualtableBig}><DemoVirtualTableBig /></DemoCard>
        <DemoCard title="InfiniteScroll" desc="无限滚动：底部哨兵触底加载 + loading/end 态" code={CODE.infinitescroll}><DemoInfiniteScroll /></DemoCard>
        <DemoCard title="InfiniteScroll 失败重试" desc="加载失败提示 + 滚动重试（状态矩阵覆盖）" code={CODE.infinitescrollRetry}><DemoInfiniteScrollRetry /></DemoCard>
        <DemoCard title="QRCode" desc="二维码：自研 QR 编码（Reed-Solomon + 8 掩码）零依赖 SVG" code={CODE.qrcode}><DemoQRCode /></DemoCard>
      </Section>

      <div class="wf-text-center wf-py-xl wf-text-tertiary wf-text-sm">
        {isEn
          ? 'weifuwu/components · all 113 components · open devtools for code'
          : ((ctx as any)?.i18n?.t?.('app.footer') ?? 'weifuwu/components · 全部 113 个组件 · 打开 devtools 查看代码')}
      </div>
    </div>
    )
  }
}

// ── ui-dom 装配（UIRouter + uiServe + ctx 注入链） ──

// i18n 注入（demo 专用 AppMiddleware——ui-dom 无内置 i18n）
const i18nMw = (() => {
  let locale = 'zh-CN'
  const messages: Record<string, Record<string, string>> = {
    'app.title': { 'zh-CN': 'weifuwu/components', en: 'weifuwu/components' },
    'app.desc': {
      'zh-CN': '115 个 HTML 原语组件 · 纯函数 (props, ctx) → VNode · 即插即用',
      en: '115 HTML primitive components · pure (props, ctx) → VNode · drop-in',
    },
    'app.footer': {
      'zh-CN': 'weifuwu/components · 全部 113 个组件 · 打开 devtools 查看代码',
      en: 'weifuwu/components · all 113 components · open devtools for code',
    },
  }
  // 语言切换 → 页面级重渲染（createRouter.refresh——组件重渲染读最新 ctx.i18n）
  let onLocaleChange: (() => void) | null = null
  const mw = (ctx: any) => {
    ctx.i18n = {
      get locale() { return locale },
      setLocale: (l: string) => {
        locale = l
        onLocaleChange?.()
      },
      t: (key: string) => messages[key]?.[locale] ?? messages[key]?.['zh-CN'] ?? key,
      components: {},
    }
    return ctx
  }
  ;(mw as any).onLocaleChange = (fn: () => void) => { onLocaleChange = fn }
  return mw
})()

// 事件流观测（浏览器 debug：真实交互后读 __wf_events()——含错误事件——
// 哪层事件缺失/哪个环节出错一目了然）
;(window as any).__wf_events = () =>
  stream.events().map((e: any) => ({ k: `${e.entity}:${e.action}`, t: e.target, p: e.payload }))
// 环形缓冲满后 length 恒定——取末尾 N 条（读取最近的渲染/错误事件）
;(window as any).__wf_recent = (n = 100) => {
  const evs = stream.events()
  return evs.slice(Math.max(0, evs.length - n)).map((e: any) => ({ k: `${e.entity}:${e.action}`, t: e.target, p: e.payload }))
}
// 实时订阅（emit 同步回调——缓冲溢出不丢——观测/调试可靠通道）
;(window as any).__wf_tail = []
stream.subscribe((e: any) => {
  const arr = (window as any).__wf_tail
  arr.push({ k: `${e.entity}:${e.action}`, t: e.target, p: e.payload, ts: e.ts })
  if (arr.length > 2000) arr.splice(0, arr.length - 2000)
})

// vdom3 事件流引擎装配（createRouter——中间件面展开为 options.ctx）
let demoCtx: any = {}
demoCtx = i18nMw(demoCtx)
demoCtx = v3Toast()(demoCtx)
demoCtx = v3Confirm()(demoCtx)
const router = createRouter(
  [{ path: '/', render: () => h(App, {}) }],
  document.querySelector('#root') as HTMLElement,
  { ctx: demoCtx },
)
;(i18nMw as any).onLocaleChange(() => router.refresh())
