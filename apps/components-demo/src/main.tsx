/**
 * weifuwu/components cheatsheet
 *
 * 每个 demo 组件都是 (props, ctx) => VNode，
 * 使用 ctx.ui.$ 做交互状态管理。
 *
 * 启动: node apps/components-demo/server.ts
 */

import { createApp, i18n } from 'weifuwu/client'
import type { WfuiContext, Component } from 'weifuwu/client'
import {
  Button, Input, Textarea, Select,
  Checkbox, Switch, RadioGroup, Slider,
  Form, Field, SearchInput, ProgressBar,
  Table, Modal, Toast, Alert, Loading, EmptyState,
  Card, Badge, Tag, Avatar, StatCard, Steps,
  Tabs, Dropdown, Pagination, Accordion,
  Breadcrumb, Divider, FileUpload, Tooltip, Drawer, Popover,
} from 'weifuwu/components'
import type { ToastItem, ToastType } from 'weifuwu/components'

// ── 布局组件 ──────────────────────────────────────────

function Section(props: { title: string; children: any }) {
  return <div class="cheat-section"><h2>{props.title}</h2><div class="cheat-grid">{props.children}</div></div>
}

function DemoCard(props: { title: string; desc: string; code: string; children: any }) {
  return (
    <div class="cheat-card">
      <h3>{props.title}</h3>
      <div class="cheat-demo">{props.children}</div>
      <div class="cheat-desc">{props.desc}</div>
      <div class="cheat-code">{props.code}</div>
    </div>
  )
}

// ── 交互型 Demo 组件 ──────────────────────────────────

const DemoButton: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.loading = false; $.count = 0 }

  return (
    <div class="wf-stack" style="gap:8px">
      <div class="wf-row">
        <Button variant="primary" onClick={() => $.count++}>点击 {$.count} 次</Button>
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
        <Button loading={$.loading} onClick={() => { $.loading = true; setTimeout(() => $.loading = false, 1500) }}>点我 Loading</Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" block>Block</Button>
      </div>
    </div>
  )
}

const DemoInput: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.text = '可编辑'; $.email = ''; $.pwd = '' }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <Input label="文本" value={$.text} onInput={e => $.text = (e.target as HTMLInputElement).value} />
      <Input label="邮箱" type="email" placeholder="name@example.com" required value={$.email} onInput={e => $.email = (e.target as HTMLInputElement).value} />
      <Input label="密码" type="password" placeholder="••••••••" value={$.pwd} onInput={e => $.pwd = (e.target as HTMLInputElement).value} />
      <Input label="错误状态" error="请输入有效内容" />
      <Input label="带提示" hint="只能包含字母和数字" />
    </div>
  )
}

const DemoTextarea: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.bio = '可编辑文本' }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <Textarea label="简介" value={$.bio} onInput={e => $.bio = (e.target as HTMLTextAreaElement).value} rows={3} />
      <Textarea label="错误状态" error="内容不能为空" rows={2} />
      <Textarea label="带提示" hint="最多 500 字" rows={2} />
    </div>
  )
}

const DemoSelect: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.role = '' }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <Select label="角色" placeholder="请选择（试试切换）"
        value={$.role}
        onChange={e => $.role = (e.target as HTMLSelectElement).value}
        options={[
          { value: 'admin', label: '管理员' },
          { value: 'user', label: '普通用户' },
          { value: 'guest', label: '访客' },
        ]} />
      <div style="font-size:12px;color:var(--wf-color-text-secondary)">当前值: {$.role || '(未选择)'}</div>
      <Select label="带错误" error="请选择角色" options={[{ value: 'a', label: '选项 A' }]} />
    </div>
  )
}

const DemoCheckbox: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.agree = false; $.remember = true }

  return (
    <div class="wf-stack" style="gap:8px">
      <Checkbox label="已阅读并同意协议" checked={$.agree} onChange={v => $.agree = v} />
      <Checkbox label="记住登录状态" checked={$.remember} onChange={v => $.remember = v} />
      <Checkbox label="不可选 (disabled)" disabled />
      <div style="font-size:12px;color:var(--wf-color-text-secondary)">同意: {String($.agree)}, 记住: {String($.remember)}</div>
    </div>
  )
}

const DemoSwitch: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.notify = true; $.auto = false }

  return (
    <div class="wf-stack" style="gap:8px">
      <Switch label="启用通知" checked={$.notify} onChange={v => $.notify = v} />
      <Switch label="自动更新" checked={$.auto} onChange={v => $.auto = v} />
      <Switch label="已禁用 (disabled)" disabled checked />
      <div style="font-size:12px;color:var(--wf-color-text-secondary)">通知: {$.notify ? '开' : '关'}, 自动更新: {$.auto ? '开' : '关'}</div>
    </div>
  )
}

const DemoRadio: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.gender = 'male' }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <RadioGroup name="gender" value={$.gender} onChange={v => $.gender = v}
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
      <div style="font-size:12px;color:var(--wf-color-text-secondary)">选择: {$.gender}</div>
    </div>
  )
}

const DemoSlider: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.volume = 60; $.brightness = 30 }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <Slider label="音量" value={$.volume} onChange={v => $.volume = v} />
      <Slider label="亮度" value={$.brightness} min={0} max={100} onChange={v => $.brightness = v} />
    </div>
  )
}

const DemoForm: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.uname = ''; $.umail = ''; $.submitted = false }

  return (
    <Form onSubmit={() => { $.submitted = true; setTimeout(() => $.submitted = false, 2000) }}>
      <Input label="用户名" required placeholder="输入用户名" value={$.uname} onInput={e => $.uname = (e.target as HTMLInputElement).value} />
      <Input label="邮箱" type="email" required placeholder="email@example.com" value={$.umail} onInput={e => $.umail = (e.target as HTMLInputElement).value} />
      {$.submitted && <Alert variant="success">表单已提交！</Alert>}
      <Button type="submit" variant="primary">提交表单</Button>
    </Form>
  )
}

const DemoField: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.name = ''; $.mail = 'bad-input' }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <Field label="姓名" required><Input placeholder="输入姓名" value={$.name} onInput={e => $.name = (e.target as HTMLInputElement).value} /></Field>
      <Field label="邮箱" error="邮箱格式不正确"><Input type="email" value={$.mail} /></Field>
      <Field label="密码" hint="至少 6 位"><Input type="password" /></Field>
    </div>
  )
}

const DemoSearchInput: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.query = '' }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <SearchInput placeholder="搜索用户..." value={$.query} onInput={e => $.query = (e.target as HTMLInputElement).value} onClear={() => $.query = ''} />
      <div style="font-size:12px;color:var(--wf-color-text-secondary)">搜索词: {$.query || '(空)'}</div>
    </div>
  )
}

const DemoProgress: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.pct = 45 }
  // 模拟进度推进
  if ($.pct < 100) {
    setTimeout(() => { $.pct = Math.min(100, $.pct + 5) }, 800)
  }

  return (
    <div class="wf-stack" style="gap:12px;width:100%">
      <ProgressBar value={$.pct} label="模拟进度" showValue />
      <ProgressBar value={100} label="已完成" showValue />
    </div>
  )
}

const DemoTable: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.selected = null }

  const data = [
    { id: 1, name: '张三', role: '管理员', status: '活跃' },
    { id: 2, name: '李四', role: '编辑', status: '离线' },
    { id: 3, name: '王五', role: '访客', status: '活跃' },
  ]

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <Table data={data} columns={[
        { key: 'id', label: 'ID', width: 60 },
        { key: 'name', label: '姓名' },
        { key: 'role', label: '角色' },
        { key: 'status', label: '状态', render: v => <Badge variant={v === '活跃' ? 'success' : 'default'}>{v}</Badge> },
      ]} />
      {$.selected && <div style="font-size:12px;color:var(--wf-color-text-secondary)">已选: {$.selected}</div>}
    </div>
  )
}

const DemoModal: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.open = false }

  return (
    <div class="wf-row">
      <Button variant="primary" onClick={() => $.open = true}>打开弹窗</Button>
      <Modal open={$.open} title="确认操作" onClose={() => $.open = false}
        footer={<Button variant="primary" onClick={() => $.open = false}>确定</Button>}>
        <p>这是弹窗内容。点击遮罩、ESC 键或"确定"关闭。</p>
      </Modal>
    </div>
  )
}

const DemoToast: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.toasts = [] as ToastItem[] }

  function add(type: ToastType) {
    const id = String(Date.now())
    const msgs: Record<ToastType, string> = { success: '操作成功完成', error: '发生了一个错误', warning: '请注意：此操作不可撤销', info: '这是一条提示信息' }
    $.toasts = [...$.toasts, { id, type, message: msgs[type] }]
    setTimeout(() => { $.toasts = $.toasts.filter(t => t.id !== id) }, 3000)
  }

  return (
    <div class="wf-stack" style="gap:8px">
      <div class="wf-row">
        <Button variant="primary" onClick={() => add('success')}>成功</Button>
        <Button variant="danger" onClick={() => add('error')}>错误</Button>
        <Button variant="secondary" onClick={() => add('warning')}>警告</Button>
        <Button variant="ghost" onClick={() => add('info')}>信息</Button>
      </div>
      <Toast toasts={$.toasts} onRemove={id => $.toasts = $.toasts.filter(t => t.id !== id)} />
    </div>
  )
}

const DemoAlert: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.showErr = true; $.showInfo = true }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      {$.showInfo && <Alert variant="info" closable onClose={() => $.showInfo = false}>这是一条提示信息（可关闭）</Alert>}
      <Alert variant="success">操作成功完成</Alert>
      <Alert variant="warning">请注意：此操作不可撤销</Alert>
      {$.showErr && <Alert variant="error" closable onClose={() => $.showErr = false}>发生了一个错误（可关闭）</Alert>}
    </div>
  )
}

const DemoLoading: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.loading = true }
  // 3秒后自动消失
  if ($.loading) { setTimeout(() => $.loading = false, 3000) }

  return (
    <div class="wf-row" style="gap:16px">
      {$.loading ? <Loading text="加载中（3秒后消失）..." /> : <Alert variant="success">加载完成 ✅</Alert>}
    </div>
  )
}

const DemoEmptyState: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.hasData = false }

  return (
    <div style="width:100%">
      {$.hasData
        ? <div class="wf-stack" style="gap:8px;text-align:center;padding:24px">
            <p>✅ 数据已添加</p>
            <Button variant="ghost" onClick={() => $.hasData = false}>清空</Button>
          </div>
        : <EmptyState icon="📦" text="暂无数据" hint="点击按钮创建第一个项目">
            <Button variant="primary" onClick={() => $.hasData = true}>创建项目</Button>
          </EmptyState>}
    </div>
  )
}

const DemoCardShowcase: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.clicked = false }

  return (
    <div class="wf-row" style="gap:12px;flex-wrap:wrap">
      <Card>默认卡片</Card>
      <Card variant="outlined">线框卡片</Card>
      <Card clickable onClick={() => $.clicked = true}>可点击卡片</Card>
      {$.clicked && <div style="font-size:12px;width:100%;color:var(--wf-color-text-secondary)">卡片被点击了 ✅</div>}
    </div>
  )
}

const DemoBadge: Component = () => (
  <div class="wf-row" style="gap:8px;flex-wrap:wrap">
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
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.tags = ['可关闭标签', '删除我'] }

  return (
    <div class="wf-row" style="gap:8px;flex-wrap:wrap">
      <Tag>默认标签</Tag>
      <Tag variant="primary">主要标签</Tag>
      <Tag variant="success">完成</Tag>
      <Tag variant="danger">错误</Tag>
      {$.tags.map((t: string, i: number) => (
        <Tag key={t} closable onClose={() => $.tags = $.tags.filter((_: any, j: number) => j !== i)}>{t}</Tag>
      ))}
    </div>
  )
}

const DemoAvatar: Component = () => (
  <div class="wf-row" style="gap:12px;align-items:end">
    <Avatar name="张三" />
    <Avatar name="李四" size="sm" />
    <Avatar name="王五" size="lg" />
    <Avatar name="系统用户" />
  </div>
)

const DemoStatCard: Component = () => (
  <div class="wf-row" style="gap:12px;flex-wrap:wrap">
    <StatCard label="总用户" value="1,234" icon="👤" trend="up" trendLabel="12%" />
    <StatCard label="收入" value="¥89,000" icon="💰" trend="up" trendLabel="8%" />
    <StatCard label="退款" value="¥1,200" icon="⚠" trend="down" trendLabel="-3%" />
  </div>
)

const DemoSteps: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.step = 'info' }

  return (
    <div style="width:100%">
      <Steps items={[
        { key: 'info', label: '填写信息' },
        { key: 'pay', label: '支付' },
        { key: 'done', label: '完成' },
      ]} active={$.step} />
      <div class="wf-row" style="margin-top:8px;gap:8px;justify-content:center">
        <Button size="sm" onClick={() => $.step = 'info'}>第一步</Button>
        <Button size="sm" onClick={() => $.step = 'pay'}>第二步</Button>
        <Button size="sm" onClick={() => $.step = 'done'}>第三步</Button>
      </div>
    </div>
  )
}

const DemoTabs: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.tab = 'a' }

  return (
    <div style="width:100%">
      <Tabs items={[
        { key: 'a', label: '详情', content: <p style="margin:0">这是详情内容。点击其他标签切换。</p> },
        { key: 'b', label: '设置', content: <p style="margin:0">这是设置内容。可以在这里修改配置。</p> },
        { key: 'c', label: '日志', content: <p style="margin:0">这是日志内容。显示操作记录。</p> },
      ]} active={$.tab} onChange={v => $.tab = v} />
    </div>
  )
}

const DemoDropdown: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.open = false; $.lastAction = '' }

  return (
    <div class="wf-row" style="gap:12px;min-height:120px">
      <Dropdown
        trigger={
          <Button variant="ghost" onClick={() => $.open = !$.open}>
            操作 ▾（点击切换）
          </Button>
        }
        open={$.open}
        items={[
          { label: '编辑', onClick: () => { $.lastAction = '编辑'; $.open = false } },
          { label: '复制', onClick: () => { $.lastAction = '复制'; $.open = false } },
          { label: '删除', variant: 'danger', onClick: () => { $.lastAction = '删除'; $.open = false } },
        ]} />
      {$.lastAction && <span style="font-size:12px;color:var(--wf-color-text-secondary)">上次: {$.lastAction}</span>}
    </div>
  )
}

const DemoPagination: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.page = 3 }

  return (
    <div class="wf-stack" style="gap:8px;align-items:center">
      <Pagination total={200} page={$.page} onChange={p => $.page = p} />
      <div style="font-size:12px;color:var(--wf-color-text-secondary)">当前页: {$.page}</div>
    </div>
  )
}

const DemoAccordion: Component = () => (
  <div style="width:100%">
    <Accordion items={[
      { key: 'a', title: '什么是 weifuwu？', content: <p style="margin:0">weifuwu 是一个全栈框架，一个包包含后端、前端和布局系统。</p> },
      { key: 'b', title: '如何安装？', content: <p style="margin:0">运行 <code>npm install weifuwu</code> 即可。</p> },
      { key: 'c', title: '组件库包含什么？', content: <p style="margin:0">28 个 HTML 原语，覆盖 90% 的 SaaS 页面需求。</p> },
    ]} />
  </div>
)

// ── 新增组件 Demo ────────────────────────────────────

const DemoBreadcrumb: Component = () => (
  <div style="width:100%">
    <Breadcrumb items={[
      { label: '首页', href: '/' },
      { label: '用户管理', href: '/users' },
      { label: '编辑' },
    ]} />
  </div>
)

const DemoDivider: Component = () => (
  <div class="wf-stack" style="gap:8px;width:100%">
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

const DemoInputNumber: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.num = 42 }

  return (
    <div class="wf-stack" style="gap:8px;width:100%">
      <Input label="数字" type="number" showStepper value={String($.num)}
        onInput={e => $.num = parseInt((e.target as HTMLInputElement).value) || 0} />
      <Input label="数字（原生样式）" type="number" value={String($.num)}
        onInput={e => $.num = parseInt((e.target as HTMLInputElement).value) || 0} />
      <div style="font-size:12px;color:var(--wf-color-text-secondary)">值: {$.num}</div>
    </div>
  )
}

const DemoFileUpload: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.files = [] as File[] }

  return (
    <div style="width:100%">
      <FileUpload
        accept="image/*,.pdf"
        multiple
        maxSize={5 * 1024 * 1024}
        value={$.files}
        onChange={f => $.files = f} />
    </div>
  )
}

const DemoTooltip: Component = () => (
  <div class="wf-row" style="gap:24px;padding:24px 0">
    <Tooltip content="保存文件" position="top"><Button>上</Button></Tooltip>
    <Tooltip content="底部提示" position="bottom"><Button>下</Button></Tooltip>
    <Tooltip content="左侧提示" position="left"><Button>左</Button></Tooltip>
    <Tooltip content="右侧提示" position="right"><Button>右</Button></Tooltip>
  </div>
)

const DemoDrawer: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.rightOpen = false; $.leftOpen = false }

  return (
    <div class="wf-row" style="gap:8px">
      <Button variant="primary" onClick={() => $.rightOpen = true}>右侧抽屉</Button>
      <Button onClick={() => $.leftOpen = true}>左侧抽屉</Button>
      <Drawer open={$.rightOpen} title="编辑用户" position="right" onClose={() => $.rightOpen = false}
        footer={<>
          <Button variant="ghost" onClick={() => $.rightOpen = false}>取消</Button>
          <Button variant="primary" onClick={() => $.rightOpen = false}>保存</Button>
        </>}>
        <Input label="姓名" placeholder="请输入姓名" />
        <Input label="邮箱" type="email" placeholder="email@example.com" />
      </Drawer>
      <Drawer open={$.leftOpen} title="导航菜单" position="left" onClose={() => $.leftOpen = false}>
        <p>左侧面板内容</p>
      </Drawer>
    </div>
  )
}

const DemoPopover: Component = (_props, ctx) => {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.showBottom = false; $.showTop = false }

  return (
    <div class="wf-row" style="gap:8px;align-items:center">
      <Popover content={<div style="padding:4px 0"><p style="margin:0 0 8px">自定义面板内容</p><Button size="sm">操作</Button></div>}>
        <Button variant="secondary">点击弹出</Button>
      </Popover>
      <Popover content={<span>顶部提示</span>} position="top">
        <Button variant="ghost">顶部</Button>
      </Popover>
      <Popover trigger="hover" content={<span>悬停出现的面板</span>}>
        <span style="color:var(--wf-color-secondary);cursor:pointer">悬停查看</span>
      </Popover>
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

  input: `<Input label="文本" value={$.text}
  onInput={e => $.text = e.target.value} />
<Input label="邮箱" type="email" required />
<Input error="错误提示" />
<Input hint="辅助文字" />`,

  textarea: `<Textarea label="简介" rows={3}
  value={$.bio}
  onInput={e => $.bio = e.target.value} />
<Textarea error="错误" />`,

  select: `<Select label="角色" value={$.role}
  onChange={e => $.role = e.target.value}
  options={[
    {value:'admin',label:'管理员'},
  ]} />`,

  checkbox: `<Checkbox label="同意"
  checked={$.agree}
  onChange={v => $.agree = v} />`,

  switch: `<Switch label="启用"
  checked={$.notify}
  onChange={v => $.notify = v} />`,

  radio: `<RadioGroup name="gender"
  value={$.gender}
  onChange={v => $.gender = v}
  options={[
    {value:'male',label:'男'},
  ]} />`,

  slider: `<Slider label="音量" value={$.volume}
  onChange={v => $.volume = v} />`,

  form: `<Form onSubmit={handleSubmit}>
  <Input label="用户名" required />
  <Button type="submit">提交</Button>
</Form>`,

  field: `<Field label="姓名" required>
  <Input />
</Field>
<Field error="错误信息">
  <Input />
</Field>`,

  search: `<SearchInput value={$.query}
  onInput={e => $.query = e.target.value}
  onClear={() => $.query = ''} />`,

  progress: `<ProgressBar value={75} label="进度" showValue />`,

  table: `<Table data={items} columns={[
  {key:'id', label:'ID'},
  {key:'status', label:'状态',
    render: v => <Badge>{v}</Badge>},
]} />`,

  modal: `<Modal open={$.open}
  title="标题"
  onClose={() => $.open = false}>
  <p>内容</p>
</Modal>`,

  toast: `// toasts: [{id, type, message}]
<Toast toasts={$.toasts}
  onRemove={id => ...} />`,

  alert: `<Alert variant="info">提示</Alert>
<Alert variant="success">成功</Alert>
<Alert variant="warning">警告</Alert>
<Alert variant="error" closable>错误</Alert>`,

  loading: `<Loading />
<Loading text="提交中..." />`,

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
  open={$.open}
  items={[
    {label:'编辑', onClick},
    {label:'删除', variant:'danger'},
  ]} />`,

  pagination: `<Pagination total={200}
  page={$.page} onChange={fn} />`,

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

  inputNumber: `<Input type="number" showStepper
  value={$.num}
  onInput={e => ...} />`,

  fileUpload: `<FileUpload accept="image/*,.pdf"
  multiple maxSize={5242880}
  value={$.files}
  onChange={f => $.files = f} />`,

  tooltip: `<Tooltip content="保存"
  position="top">
  <Button>保存</Button>
</Tooltip>`,

  drawer: `<Drawer open={$.open}
  title="编辑" position="right"
  onClose={() => $.open = false}>
  <p>内容</p>
</Drawer>`,

  popover: `<Popover content={<div>面板内容</div>}>
  <Button>点击弹出</Button>
</Popover>

<Popover position="top" content=...>
  <Button>顶部</Button>
</Popover>

<Popover trigger="hover" content=...>
  <span>悬停查看</span>
</Popover>`,
}

// ── 主应用 ─────────────────────────────────────────────

const App: Component = (_props, ctx) => {
  const cur = (ctx as any)?.i18n?.locale ?? 'zh-CN'

  return (
    <div class="wf-stack" style="gap:32px">
      <div style="text-align:center;padding:var(--wf-space-xl) 0">
        {/* 语言切换 */}
        <div style="position:absolute;top:16px;right:16px;display:flex;gap:8px">
          <Button size="sm" variant={cur.startsWith('zh') ? 'primary' : 'ghost'} onClick={() => (ctx as any)?.i18n?.setLocale?.('zh-CN')}>中文</Button>
          <Button size="sm" variant={cur.startsWith('en') ? 'primary' : 'ghost'} onClick={() => (ctx as any)?.i18n?.setLocale?.('en')}>EN</Button>
        </div>
        <h1 style="font-size:var(--wf-font-size-4xl);margin-bottom:8px">{(ctx as any)?.i18n?.t?.('app.title') ?? 'weifuwu/components'}</h1>
        <p style="color:var(--wf-color-text-secondary)">{(ctx as any)?.i18n?.t?.('app.desc') ?? '34 个 HTML 原语 · 纯函数 (props, ctx) → VNode · 即插即用'}</p>
        <div class="wf-row" style="justify-content:center;gap:12px;margin-top:16px">
          <Badge variant="primary">34 组件</Badge>
          <Badge variant="success">178 测试</Badge>
          <Badge variant="info">零依赖</Badge>
        </div>
      </div>

      <Section title="表单核心">
        <DemoCard title="Button" desc="4 variants × 3 sizes + loading + block + disabled" code={CODE.button}><DemoButton /></DemoCard>
        <DemoCard title="Input" desc="text/email/password，支持 label/error/hint/required" code={CODE.input}><DemoInput /></DemoCard>
        <DemoCard title="InputNumber" desc="数字输入，showStepper 显示自定义步进按钮" code={CODE.inputNumber}><DemoInputNumber /></DemoCard>
        <DemoCard title="Textarea" desc="多行文本，支持 rows/label/error/hint" code={CODE.textarea}><DemoTextarea /></DemoCard>
        <DemoCard title="Select" desc="下拉选择器，options/placeholder/label/error" code={CODE.select}><DemoSelect /></DemoCard>
      </Section>

      <Section title="表单选择">
        <DemoCard title="Checkbox" desc="带 label 的复选框，支持 checked/disabled" code={CODE.checkbox}><DemoCheckbox /></DemoCard>
        <DemoCard title="Switch" desc="开关切换，视觉替代 checkbox" code={CODE.switch}><DemoSwitch /></DemoCard>
        <DemoCard title="RadioGroup" desc="单选组，支持 inline/options/value" code={CODE.radio}><DemoRadio /></DemoCard>
        <DemoCard title="Slider" desc="范围滑块，支持 min/max/step/label" code={CODE.slider}><DemoSlider /></DemoCard>
      </Section>

      <Section title="表单增强">
        <DemoCard title="Form" desc="自动 preventDefault，提供 onSubmit 回调" code={CODE.form}><DemoForm /></DemoCard>
        <DemoCard title="Field" desc="label+error+hint 容器" code={CODE.field}><DemoField /></DemoCard>
        <DemoCard title="FileUpload" desc="文件上传，拖拽区 + 文件列表 + accept/maxSize" code={CODE.fileUpload}><DemoFileUpload /></DemoCard>
        <DemoCard title="SearchInput" desc="搜索输入框，带清除按钮" code={CODE.search}><DemoSearchInput /></DemoCard>
        <DemoCard title="ProgressBar" desc="进度条，支持 label/showValue" code={CODE.progress}><DemoProgress /></DemoCard>
      </Section>

      <Section title="数据展示">
        <DemoCard title="Table" desc="动态表格，columns 支持 render 自定义" code={CODE.table}><DemoTable /></DemoCard>
        <DemoCard title="Card" desc="容器，支持 default/outlined/clickable" code={CODE.card}><DemoCardShowcase /></DemoCard>
        <DemoCard title="Badge" desc="状态标签 + 圆点，6 种 variant" code={CODE.badge}><DemoBadge /></DemoCard>
        <DemoCard title="Tag" desc="标签，支持 closable/onClose" code={CODE.tag}><DemoTag /></DemoCard>
        <DemoCard title="Avatar" desc="头像（首字母/图片），3 种 size" code={CODE.avatar}><DemoAvatar /></DemoCard>
        <DemoCard title="StatCard" desc="KPI 指标卡，支持 trend/icon" code={CODE.stat}><DemoStatCard /></DemoCard>
      </Section>

      <Section title="数据反馈">
        <DemoCard title="Modal" desc="弹窗，ESC + overlay 关闭" code={CODE.modal}><DemoModal /></DemoCard>
        <DemoCard title="Drawer" desc="侧边面板，左右滑入 + ESC 关闭" code={CODE.drawer}><DemoDrawer /></DemoCard>
        <DemoCard title="Popover" desc="通用弹出层，click/hover 触发，4 方向" code={CODE.popover}><DemoPopover /></DemoCard>
        <DemoCard title="Tooltip" desc="hover 浮动提示，4 方向" code={CODE.tooltip}><DemoTooltip /></DemoCard>
        <DemoCard title="Toast" desc="提示消息 success/error/warning/info" code={CODE.toast}><DemoToast /></DemoCard>
        <DemoCard title="Alert" desc="信息提示条，4 种 variant + closable" code={CODE.alert}><DemoAlert /></DemoCard>
        <DemoCard title="Loading" desc="加载状态，支持自定义文字" code={CODE.loading}><DemoLoading /></DemoCard>
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

      <Section title="其他">
        <DemoCard title="Divider" desc="分割线，支持 horizontal/vertical/带文字" code={CODE.divider}><DemoDivider /></DemoCard>
      </Section>

      <div style="text-align:center;padding:var(--wf-space-xl) 0;color:var(--wf-color-text-tertiary);font-size:var(--wf-font-size-sm)">
        {(ctx as any)?.i18n?.t?.('app.footer') ?? 'weifuwu/components · 全部 34 个组件 · 打开 devtools 查看代码'}
      </div>
    </div>
  )
}

createApp()
  .use(i18n({ locale: 'zh-CN', messages: {
    'app.title': 'weifuwu/components',
    'app.desc': '34 个 HTML 原语 · 纯函数 (props, ctx) → VNode · 即插即用',
    'app.footer': 'weifuwu/components · 全部 34 个组件 · 打开 devtools 查看代码',
  } }))
  .mount('#root', App)
