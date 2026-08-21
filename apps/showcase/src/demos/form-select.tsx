/**
 * form-select 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
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

const DemoCheckbox: Component = async (_props, ctx) => {
  let agree = false
  let remember = true
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <Checkbox label="已阅读并同意协议" checked={agree} onChange={v => { agree = v; ctx.render() }} />
      <Checkbox label="记住登录状态" checked={remember} onChange={v => { remember = v; ctx.render() }} />
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
      <Switch label="启用通知" checked={notify} onChange={v => { notify = v; ctx.render() }} />
      <Switch label="自动更新" checked={auto} onChange={v => { auto = v; ctx.render() }} />
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
      <RadioGroup name="gender" value={gender} onChange={v => { gender = v; ctx.render() }}
        options={[
          { value: 'male', label: '男' },
          { value: 'female', label: '女' },
          { value: 'other', label: '其他' },
        ]} />
      <RadioGroup name="inline" value={inline} inline onChange={v => { inline = v; ctx.render() }}
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
        onChange={v => { mode = v; ctx.render() }}
        options={[
          { value: 'ai', label: '🤖 AI 生成' },
          { value: 'manual', label: '手动编写' },
          { value: 'template', label: '模板' },
        ]} />
      <SegmentedControl size="sm" ariaLabel="尺寸"
        value={size}
        onChange={v => { size = v as any; ctx.render() }}
        options={[{ value: 'sm', label: '小' }, { value: 'md', label: '中' }]} />
      <div class="wf-text-xs wf-text-secondary">当前模式: {mode}</div>
    </div>
  )
}

const DemoSlider: Component = async (_props, ctx) => {
  let volume = 60
  let brightness = 30
  let price = 800
  let rangeV: [number, number] = [300, 1500]
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Slider label="音量" value={volume} onChange={v => { volume = v; ctx.render() }} />
      <Slider label="亮度" value={brightness} min={0} max={100} onChange={v => { brightness = v; ctx.render() }} />
      <Slider label="价格" value={price} min={0} max={2000} step={50}
        marks={[{ value: 0, label: '0' }, { value: 500 }, { value: 1000 }, { value: 1500 }, { value: 2000, label: '2000' }]}
        onChange={v => { price = v; ctx.render() }}
        onChangeEnd={v => console.log('价格调整完成:', v)} />
      <Slider label="价格区间" range value={rangeV} min={0} max={2000} step={50}
        onChange={v => { rangeV = v as [number, number]; ctx.render() }}
        onRangeChange={v => { rangeV = v as [number, number]; ctx.render() }} />
    </div>
  )
}


export const DEMOS: Record<string, any> = {
  "Checkbox": DemoCheckbox,
  "Switch": DemoSwitch,
  "RadioGroup": DemoRadio,
  "SegmentedControl": DemoSegmented,
  "Slider": DemoSlider,
}
