/**
 * weifuwu/components cheatsheet
 *
 * 每个 demo 组件都是 (initProps, ctx) => (props) => VNode，
 * 使用闭包变量 + ctx.ui.render() 管理交互状态。
 *
 * 启动: node apps/components-demo/server.ts
 */

import { createApp, i18n } from 'weifuwu/client'
import { confirm, toast } from 'weifuwu/components'
import type { WfuiContext, Component } from 'weifuwu/client'
import {
  Button, Input, Textarea, Select,
  Checkbox, Switch, RadioGroup, Slider,
  Form, Field, SearchInput, SegmentedControl, ProgressBar,
  Table, Modal, Toast, Alert, Loading, EmptyState,
  Card, Badge, Tag, Avatar, StatCard, Steps,
  Tabs, Dropdown, Pagination, Accordion,
  Breadcrumb, Divider, FileUpload, Tooltip, Drawer, Popover, Skeleton, Img,
  InView, DatePicker, Chart, Editor, ThemeSwitch,
  AiChat, ToolCallCard, ApprovalCard,
} from 'weifuwu/components'
import type { ToastItem, ToastType } from 'weifuwu/components'

// ── 布局组件 ──────────────────────────────────────────

function Section(props: { title: string; children: any }) {
  return (_p: any) => (
    <section class="wf-stack wf-gap-lg">
      <h2 class="wf-text-2xl wf-m-0 wf-border-b wf-pb-sm">{props.title}</h2>
      <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(420px, 1fr))">{props.children}</div>
    </section>
  )
}

function DemoCard(props: { title: string; desc: string; code: string; children: any }) {
  return (_p: any) => (
    <div class="wf-surface wf-border wf-rounded-md wf-clip">
      <h3 class="wf-text-base wf-text-semibold wf-p-md wf-bg-secondary wf-border-b wf-m-0">{props.title}</h3>
      <div class="wf-p-md wf-row wf-gap-sm wf-cluster wf-border-b">{props.children}</div>
      <div class="wf-px-md wf-py-sm wf-text-xs wf-text-secondary">{props.desc}</div>
      <pre class="wf-bg-tertiary wf-p-md wf-text-xs wf-m-0 wf-scroll">{props.code}</pre>
    </div>
  )
}

// ── 交互型 Demo 组件 ──────────────────────────────────

const DemoButton: Component = (_props, ctx) => {
  let loading = false
  let count = 0
  return (_p: any) => (
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

const DemoInput: Component = (_props, ctx) => {
  let text = '可编辑'
  let email = ''
  let pwd = ''
  return (_p: any) => (
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

const DemoTextarea: Component = (_props, ctx) => {
  let bio = '可编辑文本'
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Textarea label="简介" value={bio} onInput={e => { bio = (e.target as HTMLTextAreaElement).value; ctx.ui.render() }} rows={3} />
      <Textarea label="错误状态" error="内容不能为空" rows={2} />
      <Textarea label="带提示" hint="最多 500 字" rows={2} />
    </div>
  )
}

const DemoSelect: Component = (_props, ctx) => {
  let role = ''
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Select label="原生 select" placeholder="请选择"
        value={role}
        onChange={v => { role = v; ctx.ui.render() }}
        options={[
          { value: 'admin', label: '管理员' },
          { value: 'user', label: '普通用户' },
          { value: 'guest', label: '访客' },
        ]} />
      <div class="wf-text-xs wf-text-secondary">当前值: {role || '(未选择)'}</div>
      <Select label="带错误" error="请选择角色" options={[{ value: 'a', label: '选项 A' }]} />
    </div>
  )
}

const DemoCheckbox: Component = (_props, ctx) => {
  let agree = false
  let remember = true
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <Checkbox label="已阅读并同意协议" checked={agree} onChange={v => { agree = v; ctx.ui.render() }} />
      <Checkbox label="记住登录状态" checked={remember} onChange={v => { remember = v; ctx.ui.render() }} />
      <Checkbox label="不可选 (disabled)" disabled />
      <div class="wf-text-xs wf-text-secondary">同意: {String(agree)}, 记住: {String(remember)}</div>
    </div>
  )
}

const DemoSwitch: Component = (_props, ctx) => {
  let notify = true
  let auto = false
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <Switch label="启用通知" checked={notify} onChange={v => { notify = v; ctx.ui.render() }} />
      <Switch label="自动更新" checked={auto} onChange={v => { auto = v; ctx.ui.render() }} />
      <Switch label="已禁用 (disabled)" disabled checked />
      <div class="wf-text-xs wf-text-secondary">通知: {notify ? '开' : '关'}, 自动更新: {auto ? '开' : '关'}</div>
    </div>
  )
}

const DemoRadio: Component = (_props, ctx) => {
  let gender = 'male'
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <RadioGroup name="gender" value={gender} onChange={v => { gender = v; ctx.ui.render() }}
        options={[
          { value: 'male', label: '男' },
          { value: 'female', label: '女' },
          { value: 'other', label: '其他' },
        ]} />
      <RadioGroup name="inline" value="a" inline
        options={[
          { value: 'a', label: '选项 A' },
          { value: 'b', label: '选项 B' },
        ]} />
      <div class="wf-text-xs wf-text-secondary">选择: {gender}</div>
    </div>
  )
}

const DemoSegmented: Component = (_props, ctx) => {
  let mode = 'ai'
  let size: 'sm' | 'md' = 'md'
  return (_p: any) => (
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

const DemoSlider: Component = (_props, ctx) => {
  let volume = 60
  let brightness = 30
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Slider label="音量" value={volume} onChange={v => { volume = v; ctx.ui.render() }} />
      <Slider label="亮度" value={brightness} min={0} max={100} onChange={v => { brightness = v; ctx.ui.render() }} />
    </div>
  )
}

const DemoForm: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  $.errors = {}
  $.submitted = false

  return (_p: any) => (
    <Form
      validation={{
        username: [{ required: true, message: '请输入用户名' }],
        email: [{ required: true, pattern: /@/, message: '请输入有效邮箱' }],
      }}
      onSubmit={() => { $.submitted = true }}
      onError={(errors) => { $.errors = errors }}>
      <Field label="用户名" error={$.errors.username}>
        <Input name="username" placeholder="输入用户名" />
      </Field>
      <Field label="邮箱" error={$.errors.email}>
        <Input name="email" type="email" placeholder="email@example.com" />
      </Field>
      {$.submitted && <Alert variant="success">表单已提交！</Alert>}
      <Button type="submit" variant="primary">提交表单</Button>
    </Form>
  )
}

const DemoField: Component = (_props, ctx) => {
  let name = ''
  let mail = 'bad-input'
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Field label="姓名" required><Input placeholder="输入姓名" value={name} onInput={e => { name = (e.target as HTMLInputElement).value; ctx.ui.render() }} /></Field>
      <Field label="邮箱" error="邮箱格式不正确"><Input type="email" value={mail} /></Field>
      <Field label="密码" hint="至少 6 位"><Input type="password" /></Field>
    </div>
  )
}

const DemoSearchInput: Component = (_props, ctx) => {
  let query = ''
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <SearchInput placeholder="搜索用户..." value={query} onInput={e => { query = (e.target as HTMLInputElement).value; ctx.ui.render() }} onClear={() => { query = ''; ctx.ui.render() }} />
      <div class="wf-text-xs wf-text-secondary">搜索词: {query || '(空)'}</div>
    </div>
  )
}

const DemoProgress: Component = (_props, ctx) => {
  let pct = 45
  let started = false
  return (_p: any) => {
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
    <div class="wf-stack wf-row wf-gap-md wf-w-full">
      <ProgressBar value={pct} label="模拟进度" showValue />
      <ProgressBar value={100} label="已完成" showValue />
    </div>
  )
  }
}

const DemoTable: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  $.sortKey = 'name'
  $.sortOrder = 'asc'
  const data = [
    { id: 1, name: '张三', role: '管理员', status: '活跃' },
    { id: 2, name: '李四', role: '编辑', status: '离线' },
    { id: 3, name: '王五', role: '访客', status: '活跃' },
  ]
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Table data={data} columns={[
        { key: 'id', label: 'ID', width: 60 },
        { key: 'name', label: '姓名', sortable: true },
        { key: 'role', label: '角色', sortable: true },
        { key: 'status', label: '状态', render: v => <Badge variant={v === '活跃' ? 'success' : 'default'}>{v}</Badge> },
      ]}
        sortKey={$.sortKey} sortOrder={$.sortOrder}
        onSort={(key, order) => { $.sortKey = key; $.sortOrder = order }} />
      <div class="wf-text-xs wf-text-secondary">点击列头排序（姓名 / 角色）</div>
    </div>
  )
}

const DemoModal: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  $.open = false
  $.width = '420px'
  $.closable = true
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row wf-gap-sm">
        <Button variant="primary" onClick={() => { $.open = true }}>打开弹窗</Button>
        <label class="wf-row wf-gap-xs wf-text-xs">
          <input type="checkbox" checked={$.closable} onChange={(e: any) => { $.closable = e.target.checked }} />
          显示关闭按钮
        </label>
        <select value={$.width} onChange={(e: any) => { $.width = e.target.value }} class="wf-text-xs" style="padding:2px 4px">
          <option value="360px">窄 (360px)</option>
          <option value="420px">中 (420px)</option>
          <option value="600px">宽 (600px)</option>
        </select>
      </div>
      <Modal open={$.open} title="确认操作" width={$.width} closable={$.closable}
        onClose={() => { $.open = false }}
        footer={<Button variant="primary" onClick={() => { $.open = false }}>确定</Button>}>
        <p>这是弹窗内容。试试切换右上角的设置。</p>
      </Modal>
    </div>
  )
}

const DemoToast: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  $.toasts = [] as ToastItem[]
  $.position = 'top-right'
  function add(type: ToastType) {
    const id = String(Date.now())
    const msgs: Record<ToastType, string> = { success: '操作成功完成', error: '发生了一个错误', warning: '请注意：此操作不可撤销', info: '这是一条提示信息' }
    $.toasts = [...$.toasts, { id, type, message: msgs[type] }]
    setTimeout(() => { $.toasts = $.toasts.filter((t: any) => t.id !== id) }, 3000)
  }
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        <Button variant="primary" onClick={() => add('success')}>成功</Button>
        <Button variant="danger" onClick={() => add('error')}>错误</Button>
        <Button variant="secondary" onClick={() => add('warning')}>警告</Button>
        <Button variant="ghost" onClick={() => add('info')}>信息</Button>
      </div>
      <div class="wf-row wf-gap-xs wf-text-xs wf-text-secondary">
        <span>位置:</span>
        <select value={$.position} onChange={(e: any) => { $.position = e.target.value }}>
          <option value="top-right">右上</option>
          <option value="top-left">左上</option>
          <option value="bottom-right">右下</option>
          <option value="bottom-left">左下</option>
          <option value="top-center">顶部居中</option>
        </select>
      </div>
      <Toast toasts={$.toasts} position={$.position} max={3}
        onRemove={id => { $.toasts = $.toasts.filter((t: any) => t.id !== id) }} />
    </div>
  )
}

const DemoAlert: Component = (_props, ctx) => {
  let showErr = true
  let showInfo = true
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      {showInfo && <Alert variant="info" closable onClose={() => { showInfo = false; ctx.ui.render() }}>这是一条提示信息（可关闭）</Alert>}
      <Alert variant="success">操作成功完成</Alert>
      <Alert variant="warning">请注意：此操作不可撤销</Alert>
      {showErr && <Alert variant="error" closable onClose={() => { showErr = false; ctx.ui.render() }}>发生了一个错误（可关闭）</Alert>}
    </div>
  )
}

const DemoLoading: Component = (_props, ctx) => {
  let loading = true
  let started = false
  return (_p: any) => {
    if (!started) {
      started = true
      setTimeout(() => { loading = false; ctx.ui.render() }, 3000)
    }
    return (
    <div class="wf-row wf-gap-lg">
      {loading ? <Loading text="加载中（3秒后消失）..." /> : <Alert variant="success">加载完成 ✅</Alert>}
    </div>
  )
  }
}

const DemoSkeleton: Component = () => () => (
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

const DemoEmptyState: Component = (_props, ctx) => {
  let hasData = false
  return (_p: any) => (
    <div class="wf-w-full">
      {hasData
        ? <div class="wf-stack wf-gap-sm wf-text-center wf-p-lg">
            <p>✅ 数据已添加</p>
            <Button variant="ghost" onClick={() => { hasData = false; ctx.ui.render() }}>清空</Button>
          </div>
        : <EmptyState icon="📦" text="暂无数据" hint="点击按钮创建第一个项目">
            <Button variant="primary" onClick={() => { hasData = true; ctx.ui.render() }}>创建项目</Button>
          </EmptyState>}
    </div>
  )
}

const DemoCardShowcase: Component = (_props, ctx) => {
  let clicked = false
  return (_p: any) => (
    <div class="wf-row wf-gap-md wf-cluster">
      <Card>默认卡片</Card>
      <Card variant="outlined">线框卡片</Card>
      <Card clickable onClick={() => { clicked = true; ctx.ui.render() }}>可点击卡片</Card>
      {clicked && <div class="wf-text-xs wf-w-full wf-text-secondary">卡片被点击了 ✅</div>}
    </div>
  )
}

const DemoBadge: Component = () => () => (
  <div class="wf-row wf-gap-sm wf-cluster">
    <Badge>默认</Badge>
    <Badge variant="primary">主要</Badge>
    <Badge variant="success">成功</Badge>
    <Badge variant="warning">警告</Badge>
    <Badge variant="danger">危险</Badge>
    <Badge variant="info">信息</Badge>
    <Badge dot variant="success" /> 在线
    <Badge dot variant="danger" />  离线
  </div>
)

const DemoTag: Component = (_props, ctx) => {
  let tags = ['可关闭标签', '删除我']
  return (_p: any) => (
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

const DemoAvatar: Component = () => () => (
  <div class="wf-row wf-gap-md wf-bottom">
    <Avatar name="张三" />
    <Avatar name="李四" size="sm" />
    <Avatar name="王五" size="lg" />
    <Avatar name="系统用户" />
  </div>
)

const DemoStatCard: Component = () => () => (
  <div class="wf-row wf-gap-md wf-cluster">
    <StatCard label="总用户" value="1,234" icon="👤" trend="up" trendLabel="12%" />
    <StatCard label="收入" value="¥89,000" icon="💰" trend="up" trendLabel="8%" />
    <StatCard label="退款" value="¥1,200" icon="⚠" trend="down" trendLabel="-3%" />
  </div>
)

const DemoSteps: Component = (_props, ctx) => {
  let step = 'info'
  return (_p: any) => (
    <div class="wf-w-full">
      <Steps items={[
        { key: 'info', label: '填写信息' },
        { key: 'pay', label: '支付' },
        { key: 'done', label: '完成' },
      ]} active={step} />
      <div class="wf-row wf-gap-sm wf-mt-sm" style="justify-content:center">
        <Button size="sm" onClick={() => { step = 'info'; ctx.ui.render() }}>第一步</Button>
        <Button size="sm" onClick={() => { step = 'pay'; ctx.ui.render() }}>第二步</Button>
        <Button size="sm" onClick={() => { step = 'done'; ctx.ui.render() }}>第三步</Button>
      </div>
    </div>
  )
}

const DemoTabs: Component = (_props, ctx) => {
  let tab = 'a'
  return (_p: any) => (
    <div class="wf-w-full">
      <Tabs items={[
        { key: 'a', label: '详情', content: <p class="wf-m-0">这是详情内容。点击其他标签切换。</p> },
        { key: 'b', label: '设置', content: <p class="wf-m-0">这是设置内容。可以在这里修改配置。</p> },
        { key: 'c', label: '日志', content: <p class="wf-m-0">这是日志内容。显示操作记录。</p> },
      ]} active={tab} onChange={v => { tab = v; ctx.ui.render() }} />
    </div>
  )
}

const DemoDropdown: Component = (_props, ctx) => {
  let open = false
  let lastAction = ''
  return (_p: any) => (
    <div class="wf-row wf-gap-md" style="min-height:120px">
      <Dropdown
        trigger={
          <Button variant="ghost" onClick={() => { open = !open; ctx.ui.render() }}>
            操作 ▾（点击切换）
          </Button>
        }
        open={open}
        items={[
          { label: '编辑', onClick: () => { lastAction = '编辑'; open = false; ctx.ui.render() } },
          { label: '复制', onClick: () => { lastAction = '复制'; open = false; ctx.ui.render() } },
          { label: '删除', variant: 'danger', onClick: () => { lastAction = '删除'; open = false; ctx.ui.render() } },
        ]} />
      {lastAction && <span class="wf-text-xs wf-text-secondary">上次: {lastAction}</span>}
    </div>
  )
}

const DemoPagination: Component = (_props, ctx) => {
  let page = 3
  return (_p: any) => (
    <div class="wf-center wf-gap-sm">
      <Pagination total={200} page={page} onChange={p => { page = p; ctx.ui.render() }} />
      <div class="wf-text-xs wf-text-secondary">当前页: {page}</div>
    </div>
  )
}

const DemoAccordion: Component = () => () => (
  <div class="wf-w-full">
    <Accordion items={[
      { key: 'a', title: '什么是 weifuwu？', content: <p class="wf-m-0">weifuwu 是一个全栈框架，一个包包含后端、前端和布局系统。</p> },
      { key: 'b', title: '如何安装？', content: <p class="wf-m-0">运行 <code>npm install weifuwu</code> 即可。</p> },
      { key: 'c', title: '组件库包含什么？', content: <p class="wf-m-0">28 个 HTML 原语，覆盖 90% 的 SaaS 页面需求。</p> },
    ]} />
  </div>
)

const DemoSearchableSelect: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  $.value = ''
  const options = [
    { value: 'zhang', label: '张三 (zhang@example.com)' },
    { value: 'li', label: '李四 (li@example.com)' },
    { value: 'wang', label: '王五 (wang@example.com)' },
    { value: 'zhao', label: '赵六 (zhao@example.com)' },
    { value: 'qian', label: '钱七 (qian@example.com)' },
  ]
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Select searchable label="搜索选择用户" placeholder="输入姓名或邮箱搜索..."
        value={$.value}
        onChange={v => { $.value = v }}
        options={options} />
      <div class="wf-text-xs wf-text-secondary">已选: {options.find(o => o.value === $.value)?.label || '(未选择)'}</div>
    </div>
  )
}

// ── 新增组件 Demo ────────────────────────────────────

const DemoBreadcrumb: Component = () => () => (
  <div class="wf-w-full">
    <Breadcrumb items={[
      { label: '首页', href: '/' },
      { label: '用户管理', href: '/users' },
      { label: '编辑' },
    ]} />
  </div>
)

const DemoDivider: Component = () => () => (
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

const DemoFileUpload: Component = (_props, ctx) => {
  let files: File[] = []
  return (_p: any) => (
    <div class="wf-w-full">
      <FileUpload
        accept="image/*,.pdf"
        multiple
        maxSize={5 * 1024 * 1024}
        value={files}
        onChange={f => { files = f; ctx.ui.render() }} />
    </div>
  )
}

const DemoTooltip: Component = () => () => (
  <div class="wf-row wf-gap-xl wf-py-lg">
    <Tooltip content="保存文件" position="top"><Button>上</Button></Tooltip>
    <Tooltip content="底部提示" position="bottom"><Button>下</Button></Tooltip>
    <Tooltip content="左侧提示" position="left"><Button>左</Button></Tooltip>
    <Tooltip content="右侧提示" position="right"><Button>右</Button></Tooltip>
  </div>
)

const DemoDrawer: Component = (_props, ctx) => {
  let rightOpen = false
  let leftOpen = false
  return (_p: any) => (
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

const DemoPopover: Component = (_props, ctx) => {
  let showBottom = false
  let showTop = false
  return (_p: any) => (
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

const DemoImage: Component = () => () => (
  <div class="wf-row wf-gap-lg wf-top">
    <Img src="https://picsum.photos/200/200?1" alt="示例图片" width={120} height={120} style={{ borderRadius: '8px', objectFit: 'cover' }} />
    <Img src="https://picsum.photos/200/200?2" alt="loading=lazy" width={120} height={120} style={{ borderRadius: '50%', objectFit: 'cover' }} />
    <Img src="/broken.jpg" fallback="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Crect width='120' height='120' fill='%23f3f4f6'/%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dy='.3em' fill='%239ca3af' font-size='14'%3E加载失败%3C/text%3E%3C/svg%3E" alt="fallback" width={120} height={120} style={{ objectFit: 'cover', borderRadius: '8px' }} />
  </div>
)

const DemoInView: Component = (_props, ctx) => {
  let log: string[] = []
  return (_p: any) => (
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

const DemoDatePicker: Component = (_props, ctx) => {
  let result = ''
  return (_p: any) => (
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


const DemoEditor: Component = (_props, ctx) => {
  let html = '<p>Hello <strong>weifuwu</strong>!</p><blockquote>引用块示例</blockquote><p class="wf-text-center">居中文字</p>'
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Editor value={html} onChange={v => { html = v; ctx.ui.render() }} placeholder="输入内容..." />
      <div class="wf-text-xs wf-text-secondary wf-py-xs wf-truncate wf-w-full">
        HTML 输出: {html?.substring(0, 150) || '(空)'}
      </div>
    </div>
  )
}

const DemoThemeSwitch: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  $.mode = 'auto'
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <div class="wf-row wf-gap-sm">
        <ThemeSwitch onChange={(m) => { $.mode = m }} />
      </div>
      <div class="wf-text-xs wf-text-secondary">
        当前模式: <code>{$.mode}</code> · 已持久化到 localStorage · 右上角也有一个可直接用
      </div>
    </div>
  )
}

const DemoChart: Component = () => () => {
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

const DemoConfirm: Component = (_props, ctx) => {
  let result = ''
  const handleDelete = async () => {
    const ok = await (ctx as any).confirm?.('确定要删除这条记录吗？', {
      title: '确认删除',
      confirmText: '删除',
      variant: 'danger',
    })
    result = ok ? '✅ 已删除' : '已取消'
    ctx.ui.render()
  }
  const handleSave = async () => {
    const ok = await (ctx as any).confirm?.('保存修改？')
    result = ok ? '✅ 已保存' : '已取消'
    ctx.ui.render()
  }
  return (_p: any) => (
    <div class="wf-row wf-gap-sm">
      <Button variant="danger" onClick={handleDelete}>删除</Button>
      <Button onClick={handleSave}>保存</Button>
      {result && <span class="wf-text-xs wf-text-secondary">{result}</span>}
    </div>
  )
}

// ── AI 对话组件演示 ────────────────────────────────────

/** ToolCallCard：running / ok / error 状态机（纯展示） */
const DemoToolCallCard: Component = () => () => (
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

/** ApprovalCard：pending / approved / rejected 终态 */
const DemoApprovalCard: Component = () => () => (
  <div class="wf-stack wf-gap-sm">
    <ApprovalCard
      request={{ id: 'ap1', toolCallId: 't1', name: 'place_order', args: { qty: 2 }, reason: '单笔超限，需人工确认' }}
      onApprove={() => {}}
      onReject={() => {}}
    />
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

/** AiChat：useChat + 标准对话界面（流式 / 工具 / 审批 / 自动滚动） */
const DemoAiChat: Component = (_props, ctx) => {
  const $ = ctx.ui.useChat({
    url: '/api/chat',
    approveUrl: '/api/approve',
    body: (messages) => ({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      mode: $.mode, // chat | agent
    }),
  })
  $.mode = 'chat'

  return () => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        {(['chat', 'agent'] as const).map((m) => (
          <button
            class={`wf-btn wf-btn--sm ${$.mode === m ? 'wf-btn--primary' : ''}`}
            type="button"
            onClick={() => { $.mode = m; $.clear() }}
          >
            {m === 'chat' ? '流式对话' : 'Agent（工具+审批）'}
          </button>
        ))}
      </div>
      <AiChat chat={$} maxHeight="300px" />
    </div>
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
  onChange={v => volume = v} />`,

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
<Img src="..." loading="lazy" width={200} />`,

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

  empty: `<EmptyState icon="📦"
  text="暂无数据"
  hint="提示信息" />`,

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
  value="1,234" icon="👤"
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

  aichat: `const $ = ctx.ui.useChat({ url: '/api/chat', approveUrl: '/api/approve' })
return () => <AiChat chat={$} />

// 状态：$.messages / $.input / $.streaming / $.error
// 操作：$.send() / $.stop() / $.retry() / $.approve(decision)
// agent 消息内嵌：msg.toolCalls / msg.approval`,

  toolcall: `<ToolCallCard call={{ id, name, args }} />
<ToolCallCard call={...} progress={{ toolCallId, step, total }} />
<ToolCallCard call={...} result={{ id, ok, output }} />

// 状态机：running → ok / error`,

  approval: `<ApprovalCard request={{ id, toolCallId, name, args }}
  onApprove={() => chat.approve('approved')}
  onReject={(note) => chat.approve('rejected', note)} />

// 终态：<ApprovalCard request={...} status="approved" />`,
}

// ── 主应用 ─────────────────────────────────────────────

const App: Component = (_props, ctx) => {
  return (_p: any) => {
    const cur = (ctx as any)?.i18n?.locale ?? 'zh-CN'
    return (
    <div class="wf-container wf-stack" style="--wf-max:960px;--wf-gap:32px">
      <div class="wf-text-center wf-py-xl">
        {/* 语言切换 + 主题切换 */}
        <div style="position:absolute;top:16px;right:16px;display:flex;gap:8px;align-items:center">
          <ThemeSwitch />
          <Button size="sm" variant={cur.startsWith('zh') ? 'primary' : 'ghost'} onClick={() => (ctx as any)?.i18n?.setLocale?.('zh-CN')}>中文</Button>
          <Button size="sm" variant={cur.startsWith('en') ? 'primary' : 'ghost'} onClick={() => (ctx as any)?.i18n?.setLocale?.('en')}>EN</Button>
        </div>
        <h1 class="wf-text-4xl wf-mb-sm wf-m-0">{(ctx as any)?.i18n?.t?.('app.title') ?? 'weifuwu/components'}</h1>
        <p class="wf-text-secondary">{(ctx as any)?.i18n?.t?.('app.desc') ?? '34 个 HTML 原语 · 纯函数 (props, ctx) → VNode · 即插即用'}</p>
        <div class="wf-row wf-gap-md wf-mt-md" style="justify-content:center">
          <Badge variant="primary">47 组件</Badge>
          <Badge variant="success">580 测试</Badge>
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
        <DemoCard title="Field" desc="label+error+hint 容器" code={CODE.field}><DemoField /></DemoCard>
        <DemoCard title="FileUpload" desc="文件上传，拖拽区 + 文件列表 + accept/maxSize" code={CODE.fileUpload}><DemoFileUpload /></DemoCard>
        <DemoCard title="SearchInput" desc="搜索输入框，带清除按钮" code={CODE.search}><DemoSearchInput /></DemoCard>
        <DemoCard title="ProgressBar" desc="进度条，支持 label/showValue" code={CODE.progress}><DemoProgress /></DemoCard>
      </Section>

      <Section title="数据展示">
        <DemoCard title="Table" desc="可排序 + 自定义 render + 空状态" code={CODE.table}><DemoTable /></DemoCard>
        <DemoCard title="Card" desc="容器，支持 default/outlined/clickable" code={CODE.card}><DemoCardShowcase /></DemoCard>
        <DemoCard title="Badge" desc="状态标签 + 圆点，6 种 variant" code={CODE.badge}><DemoBadge /></DemoCard>
        <DemoCard title="Tag" desc="标签，支持 closable/onClose" code={CODE.tag}><DemoTag /></DemoCard>
        <DemoCard title="Avatar" desc="头像（首字母/图片），3 种 size" code={CODE.avatar}><DemoAvatar /></DemoCard>
        <DemoCard title="Img" desc="图片 \<img\> 组件，支持 fallback/loading lazy" code={CODE.image}><DemoImage /></DemoCard>
        <DemoCard title="InView" desc="进入视窗后懒加载内容，支持 IntersectionObserver" code={CODE.inview}><DemoInView /></DemoCard>
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
        <DemoCard title="Tabs" desc="标签页切换，支持 active/onChange" code={CODE.tabs}><DemoTabs /></DemoCard>
        <DemoCard title="Dropdown" desc="下拉菜单，支持 danger variant" code={CODE.dropdown}><DemoDropdown /></DemoCard>
        <DemoCard title="Pagination" desc="分页器，自动计算页码范围" code={CODE.pagination}><DemoPagination /></DemoCard>
        <DemoCard title="Steps" desc="分步指示器，支持 active/current" code={CODE.steps}><DemoSteps /></DemoCard>
        <DemoCard title="Accordion" desc="折叠面板，支持多个 items" code={CODE.accordion}><DemoAccordion /></DemoCard>
      </Section>

      <Section title="AI 对话">
        <DemoCard title="AiChat" desc="useChat + 标准对话界面：流式 token / 工具卡 / 审批卡 / 自动滚动，协议对页面透明" code={CODE.aichat}><DemoAiChat /></DemoCard>
        <DemoCard title="ToolCallCard" desc="工具调用卡片：running / ok / error 状态机（call/progress/result 三字段驱动）" code={CODE.toolcall}><DemoToolCallCard /></DemoCard>
        <DemoCard title="ApprovalCard" desc="HITL 审批卡片：pending 可批/拒，approved/rejected/timeout 终态" code={CODE.approval}><DemoApprovalCard /></DemoCard>
      </Section>

      <Section title="其他">
        <DemoCard title="Divider" desc="分割线，支持 horizontal/vertical/带文字" code={CODE.divider}><DemoDivider /></DemoCard>
      </Section>

      <div class="wf-text-center wf-py-xl wf-text-tertiary wf-text-sm">
        {(ctx as any)?.i18n?.t?.('app.footer') ?? 'weifuwu/components · 全部 47 个组件 · 打开 devtools 查看代码'}
      </div>
    </div>
    )
  }
}

createApp()
  .use(confirm())
  .use(toast())
  .use(i18n({ locale: 'zh-CN', messages: {
    'app.title': 'weifuwu/components',
    'app.desc': '34 个 HTML 原语 · 纯函数 (props, ctx) → VNode · 即插即用',
    'app.footer': 'weifuwu/components · 全部 47 个组件 · 打开 devtools 查看代码',
  } }))
  .mount('#root', App)
