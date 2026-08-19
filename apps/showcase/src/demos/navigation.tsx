/**
 * navigation 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
 */
/**
 * weifuwu/components cheatsheet
 *
 * 每个 demo 组件都是 (initProps, ctx) => (props) => VNode，
 * 使用闭包变量 + ctx.render() 管理交互状态。
 *
 * 启动: node apps/components-demo/server.ts
 */

import type { UIContext, Component } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'
import { FilePreview } from 'weifuwu/components'

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
        <Button size="sm" variant="secondary" onClick={() => { step = 'info'; ctx.render() }}>第一步</Button>
        <Button size="sm" variant="secondary" onClick={() => { step = 'pay'; ctx.render() }}>第二步</Button>
        <Button size="sm" variant="secondary" onClick={() => { step = 'done'; ctx.render() }}>第三步</Button>
      </div>
      <div class="wf-text-xs wf-text-secondary">三步流程 + 描述；aria-current="step" 标识当前步</div>
    </div>
  )
}

const DemoTabs: Component = async (_props, ctx) => {
  let tab = 'a'
  let items = [
    { key: 'a', label: '详情', content: <p class="wf-m-0">这是详情内容。点击其他标签切换。</p> },
    { key: 'b', label: '设置', content: <p class="wf-m-0">这是设置内容。可以在这里修改配置。</p> },
    { key: 'c', label: '日志', content: <p class="wf-m-0">这是日志内容。显示操作记录。</p> },
  ]
  let n = 0
  const rerender = () => ctx.render()
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Tabs items={items} active={tab} onChange={v => { tab = v; rerender() }}
        closable
        onClose={(k) => { items = items.filter(i => i.key !== k); rerender() }}
        addable
        onAdd={() => { n++; const key = `tab-${n}`; items = [...items, { key, label: `新标签 ${n}`, content: <p class="wf-m-0">标签 {n} 的内容——可关闭。</p> }]; tab = key; rerender() }} />
      <div class="wf-text-xs wf-text-secondary">可关闭（关闭激活 tab 自动激活邻居）+ 可新增——浏览器标签类应用</div>
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
          <Button variant="ghost" onClick={() => { open = !open; ctx.render() }}>
            操作 ▾（点击切换）
          </Button>
        }
        open={open}
        onOpenChange={(o: boolean) => { open = o; ctx.render() }}
        items={[
          { label: '编辑', onClick: () => { lastAction = '编辑'; open = false; ctx.render() } },
          { label: '复制', onClick: () => { lastAction = '复制'; open = false; ctx.render() } },
          { label: '删除', variant: 'danger', onClick: () => { lastAction = '删除'; open = false; ctx.render() } },
        ]} />
      {lastAction && <span class="wf-text-xs wf-text-secondary">上次: {lastAction}</span>}
    </div>
  )
}

const DemoPagination: Component = async (_props, ctx) => {
  let page = 3
  return async (_p: any) => (
    <div class="wf-center wf-gap-sm">
      <Pagination total={200} page={page} onChange={p => { page = p; ctx.render() }} />
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

const DemoBreadcrumb: Component = async () => async () => (
  <div class="wf-w-full">
    <Breadcrumb items={[
      { label: '首页', href: '/' },
      { label: '用户管理', href: '/users' },
      { label: '编辑' },
    ]} />
  </div>
)

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
        <Menu items={items} activeKey={active} onSelect={k => { active = k; ctx.render() }}
          collapsible collapsed={collapsed} onCollapseChange={c => { collapsed = c; ctx.render() }} />
      </div>
      <div class="wf-text-xs wf-text-secondary wf-mt-sm">当前: {active}（方向键导航；子菜单 Enter 展开 / Esc 收起；折叠态点图标弹出子菜单浮层；底部按钮折叠）</div>
    </div>
  )
}


export const DEMOS: Record<string, any> = {
  "Breadcrumb": DemoBreadcrumb,
  "Menu": DemoMenu,
  "Tabs": DemoTabs,
  "Dropdown": DemoDropdown,
  "Pagination": DemoPagination,
  "Steps": DemoSteps,
  "Accordion": DemoAccordion,
}
