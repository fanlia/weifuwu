/**
 * data-feedback 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
 */
/**
 * weifuwu/components cheatsheet
 *
 * 每个 demo 组件都是 (initProps, ctx) => (props) => VNode，
 * 使用闭包变量 + ctx.ui.render() 管理交互状态。
 *
 * 启动: node apps/components-demo/server.ts
 */

import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { createRouter, h, stream, evKey, App as AppNode, registerApp } from 'weifuwu/ui-dom'
import { FilePreview } from 'weifuwu/components'
import { v3Toast, v3Confirm, v3Notification } from 'weifuwu/ui-dom'
import {
  Wave, Button, Input, Textarea, Select,
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


export const DemoWave: Component = async (_props: any) => async (_p: any) => (
  <div class="wf-w-full wf-stack wf-gap-xs">
    <div class="wf-text-xs wf-text-secondary">点击水波纹——包装任意可点击元素（纯 CSS，reduced-motion 自动降级）</div>
    <div class="wf-row wf-gap-sm">
      <Wave><Button variant="primary">点我有波纹</Button></Wave>
      <Wave><Button variant="secondary">按钮也有</Button></Wave>
      <Wave><span class="wf-tag wf-tag--primary" style="cursor:pointer">标签也能有</span></Wave>
    </div>
  </div>
)

export const DEMOS: Record<string, any> = {
  Wave: DemoWave,
  "DatePicker": DemoDatePicker,
  "Modal": DemoModal,
  "Drawer": DemoDrawer,
  "Popover": DemoPopover,
  "Tooltip": DemoTooltip,
  "Toast": DemoToast,
  "Alert": DemoAlert,
  "Loading": DemoLoading,
  "Skeleton": DemoSkeleton,
  "EmptyState": DemoEmptyState,
}
