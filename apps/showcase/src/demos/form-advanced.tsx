/**
 * form-advanced 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
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

const DemoForm: Component = (_props, ctx) => {
  let errors = {} as Record<string, string>
  let submitted = false
  const rerender = () => ctx.render()

  return (_p: any) => (
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

const DemoFormSubmit: Component = (_props, ctx) => {
  let loading = false
  let done = false
  return (_p: any) => (
    <Form
      validation={{
        name: [{ required: true, minLength: 2, message: '名称至少 2 字符' }],
      }}
      onSubmit={() => {
        if (loading) return
        loading = true; done = false; ctx.render()
        setTimeout(() => { loading = false; done = true; ctx.render() }, 1200)
      }}>
      <Field label="项目名称" required>
        <Input name="name" placeholder="输入项目名称" disabled={loading} />
      </Field>
      {done && <Alert variant="success">提交成功（模拟 1.2s）</Alert>}
      <Button type="submit" variant="primary" loading={loading}>{loading ? '提交中…' : '提交'}</Button>
    </Form>
  )
}

const DemoField: Component = (_props, ctx) => {
  let name = ''
  let mail = 'bad-input'
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <Field label="姓名" required><Input placeholder="输入姓名" value={name} onInput={e => { name = (e.target as HTMLInputElement).value; ctx.render() }} /></Field>
      <Field label="邮箱" error="邮箱格式不正确"><Input type="email" value={mail} /></Field>
      <Field label="密码" hint="至少 6 位"><Input type="password" /></Field>
    </div>
  )
}

const DemoSearchInput: Component = (_props, ctx) => {
  let query = ''
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <SearchInput placeholder="搜索用户..." value={query} onInput={e => { query = (e.target as HTMLInputElement).value; ctx.render() }} onClear={() => { query = ''; ctx.render() }} />
      <div class="wf-font-xs wf-text-secondary">搜索词: {query || '(空)'}</div>
    </div>
  )
}

const DemoProgress: Component = (_props, ctx) => {
  let pct = 45
  // **tick 启动在工厂（mount）期（2026-08——effect guard 实证——渲染
  // 路径副作用纪律）**：renderFn 只输出 vnode——定时器在 mount 期启动 +
  // hold 注册清理——SSR 端不启动（typeof window 守卫——服务器零污染）
  if (typeof window !== 'undefined') {
    let timer: ReturnType<typeof setTimeout> | undefined
    ctx.ui.hold(() => { if (timer !== undefined) clearTimeout(timer) })
    const tick = () => {
      if (pct >= 100) return
      pct = Math.min(100, pct + 5)
      ctx.render()
      if (pct < 100) timer = setTimeout(tick, 800)
    }
    timer = setTimeout(tick, 800)
  }
  return (_p: any) => {
    return (
    <div class="wf-stack wf-gap-md wf-width-full">
      <ProgressBar value={pct} label="模拟进度" showValue />
      <ProgressBar value={100} label="已完成" showValue status="success" />
      <ProgressBar label="不确定态" /> {/* indeterminate */}
      <ProgressBar value={60} size="sm" label="小尺寸" showValue />
      <ProgressBar value={40} status="warning" showValue label="警告" />
    </div>
  )
  }
}

const DemoInputNumber: Component = (_props, ctx) => {
  let temp = 0.7
  let tokens: number | null = 2048
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <div class="wf-row wf-gap-md">
        <div style="max-width:160px">
          <InputNumber label="temperature" value={temp} min={0} max={1} step={0.1} precision={1} onChange={v => { temp = v ?? 0; ctx.render() }} />
        </div>
        <div style="max-width:160px">
          <InputNumber label="max_tokens" value={tokens} min={1} max={8192} step={256} onChange={v => { tokens = v; ctx.render() }} />
        </div>
      </div>
      <div class="wf-font-xs wf-text-secondary">temperature: {temp} · max_tokens: {tokens}</div>
    </div>
  )
}

const DemoPasswordInput: Component = (_props, ctx) => {
  let pwd = 'secret123'
  return (_p: any) => (
    <div class="wf-width-full wf-stack wf-gap-sm" style="max-width:320px">
      <PasswordInput label="登录密码" value={pwd} placeholder="••••••••" onInput={(e: any) => { pwd = e.target.value; ctx.render() }} hint="点击右侧眼睛切换可见性" />
    </div>
  )
}

const DemoTagsInput: Component = (_props, ctx) => {
  let tags = ['typescript', 'weifuwu']
  return (_p: any) => (
    <div class="wf-width-full wf-stack wf-gap-sm" style="max-width:360px">
      <TagsInput label="技能标签" value={tags} placeholder="输入后回车添加，支持中文输入法" onChange={v => { tags = v; ctx.render() }} hint={`当前 ${tags.length} 个标签`} />
    </div>
  )
}

const DemoFileUpload: Component = (_props, ctx) => {
  let files: File[] = []
  let uploading = false
  let progress = 0
  // 模拟上传（父层驱动进度——组件不做 xhr，诚实裁剪）
  const simulateUpload = () => {
    if (files.length === 0) return
    uploading = true; progress = 0; ctx.render()
    const timer = setInterval(() => {
      progress += 20
      if (progress >= 100) { clearInterval(timer); uploading = false }
      ctx.render()
    }, 300)
  }
  return (_p: any) => (
    <div class="wf-width-full wf-stack wf-gap-sm">
      <FileUpload
        accept="image/*,.pdf"
        multiple
        maxSize={5 * 1024 * 1024}
        value={files}
        uploading={uploading}
        progress={progress}
        onChange={f => { files = f; ctx.render() }} />
      <div class="wf-row wf-gap-sm">
        <Button variant="primary" size="sm" onClick={simulateUpload} disabled={!files.length}>模拟上传（进度）</Button>
        <span class="wf-font-xs wf-text-secondary">选择图片文件可预览缩略图</span>
      </div>
    </div>
  )
}

const DemoTagsInputErr: Component = (_p, ctx) => {
  let tags = ['前端']
  let err = ''
  return () => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <TagsInput value={tags} onChange={(t) => { tags = t; if (t.length >= 3) err = ''; ctx.render() }} maxTags={3} error={err} placeholder="最多 3 个标签（回车添加）" />
      {err && <div class="wf-font-sm wf-text-error">{err}</div>}
      <div class="wf-row wf-gap-sm">
        <Button variant="danger" onClick={() => { err = '标签数量超限（示例）'; ctx.render() }}>触发错误</Button>
      </div>
    </div>
  )
}

const DemoFileUploadDis: Component = (_p, ctx) => {
  let files: File[] = []
  let disabled = false
  return () => (
    <div class="wf-width-full wf-stack wf-gap-sm">
      <FileUpload accept="image/*" multiple value={files} disabled={disabled} error={disabled ? '' : undefined}
        onChange={f => { files = f; ctx.render() }} />
      <div><Button onClick={() => { disabled = !disabled; ctx.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}


export const DEMOS: Record<string, any> = {
  "Form": DemoForm,
  "Form 提交": DemoFormSubmit,
  "Field": DemoField,
  "FileUpload": DemoFileUpload,
  "FileUpload 禁用": DemoFileUploadDis,
  "SearchInput": DemoSearchInput,
  "ProgressBar": DemoProgress,
  "InputNumber": DemoInputNumber,
  "PasswordInput": DemoPasswordInput,
  "TagsInput": DemoTagsInput,
  "TagsInput 限制/错误": DemoTagsInputErr,
}
