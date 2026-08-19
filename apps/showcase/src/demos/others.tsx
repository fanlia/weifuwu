/**
 * others 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
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
  VideoPlayer, Math,
  MarkdownEditor, CodeEditor, ImageCropper,
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
  TabBar, ActionSheet,
} from 'weifuwu/components'
import type { ToastItem, ToastType, ToastPosition, ToastInjected, JsonSchema } from 'weifuwu/components'

const DemoPageHeader: Component = async (_props, ctx) => {
  let display = false
  return async (_p: any) => (
    <div class="wf-stack wf-gap-md wf-w-full">
      <PageHeader title="用户管理" sub="管理平台所有用户的账号、角色与权限">
        <Button size="sm" variant="primary">新建用户</Button>
        <Button size="sm">导出</Button>
      </PageHeader>
      <PageHeader display title="大标题模式" sub="display 档 30px 页面大标题" />
      <Button size="sm" variant="ghost" onClick={() => { display = !display; ctx.render() }}>切换: {display ? '普通' : 'display'}</Button>
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


export const DemoMarkdownEditor: Component = async (_props, ctx) => {
  let md = '# 标题\n\n支持 **加粗** 与 \\`code\\`——右侧实时预览'
  return async (_p: any) => (
    <div class="wf-w-full wf-stack wf-gap-xs">
      <div class="wf-text-xs wf-text-secondary">分屏编辑 + 实时预览（复用 Markdown parser——零漂移）</div>
      <MarkdownEditor value={md} onChange={(v: string) => { md = v; ctx.render() }} rows={6} />
    </div>
  )
}

export const DemoCodeEditor: Component = async (_props, ctx) => {
  let code = 'const greet = (name: string) => `你好, ${name}`\n\nconsole.log(greet(\'weifuwu\'))'
  return async (_p: any) => (
    <div class="wf-w-full wf-stack wf-gap-xs">
      <div class="wf-text-xs wf-text-secondary">轻量代码编辑——行号 + Tab 缩进（零依赖，不引 Monaco）</div>
      <CodeEditor value={code} lang="ts" onChange={(v: string) => { code = v; ctx.render() }} rows={6} />
    </div>
  )
}

export const DemoImageCropper: Component = async (_props: any) => async (_p: any) => (
  <div class="wf-w-full wf-stack wf-gap-xs">
    <div class="wf-text-xs wf-text-secondary">图片裁剪——canvas 原生 + 裁剪框（示例图用占位数据）</div>
    <ImageCropper src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0ODAiIGhlaWdodD0iMzYwIj48cmVjdCB3aWR0aD0iNDgwIiBoZWlnaHQ9IjM2MCIgZmlsbD0iI2UyZThmMCIvPjxjaXJjbGUgY3g9IjI0MCIgY3k9IjE4MCIgcj0iMTIwIiBmaWxsPSIjMjU2M2ViIi8+PC9zdmc+" aspect={4/3} onCrop={(dataUrl: string) => console.log('[crop]', dataUrl.slice(0, 30))} />
  </div>
)

export const DemoVideoPlayer: Component = async (_props: any) => async (_p: any) => (
  <div class="wf-w-full wf-stack wf-gap-xs">
    <div class="wf-text-xs wf-text-secondary">视频播放器——原生 video 封装（示例源为公共测试视频）</div>
    <VideoPlayer src="https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" poster="" aspect={16 / 9} />
  </div>
)

export const DemoMath: Component = async (_props: any) => async (_p: any) => (
  <div class="wf-w-full wf-stack wf-gap-xs">
    <div class="wf-text-xs wf-text-secondary">轻量公式渲染（零依赖 LaTeX 子集——教学/文档场景）</div>
    <div class="wf-stack wf-gap-sm wf-text-base">
      <div>勾股定理：<Math tex="a^2 + b^2 = c^2" /></div>
      <div>分数：<Math tex="x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}" /></div>
      <div>求和：<Math tex="\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}" /></div>
      <div>希腊字母：<Math tex="\\alpha + \\beta = \\gamma" /></div>
    </div>
  </div>
)

/** TabBar：底部标签栏（移动端导航——MUI BottomNavigation 对位） */
export const DemoTabBar: Component = async (_props: any, ctx: any) => {
  let tab = 'home'
  return async () => (
    <div class="wf-stack wf-gap-sm wf-border wf-rounded-md" style="position:relative;min-height:320px;overflow:hidden">
      <div class="wf-p-lg wf-fill wf-text-sm wf-text-secondary">
        {tab === 'home' && '🏠 首页——组件/页面/应用/后端/能力/指南 一站式'}
        {tab === 'message' && '💬 消息——会话列表 + 审批通知'}
        {tab === 'search' && '🔍 发现——文档与模板搜索'}
        {tab === 'me' && '👤 我的——主题/预设/设置'}
      </div>
      <TabBar
        items={[
          { key: 'home', label: '首页', icon: 'home' },
          { key: 'message', label: '消息', icon: 'message', badge: 3 },
          { key: 'search', label: '发现', icon: 'search' },
          { key: 'me', label: '我的', icon: 'user' },
        ]}
        activeKey={tab}
        onChange={(k: string) => { tab = k; ctx.render() }}
      />
    </div>
  )
}

/** ActionSheet：动作面板（移动端底部滑出——照片选择/更多操作） */
export const DemoActionSheet: Component = async (_props: any, ctx: any) => {
  let open = false
  let last = '未选择'
  return async () => (
    <div class="wf-stack wf-gap-sm wf-border wf-rounded-md" style="min-height:120px">
      <div class="wf-p-md wf-text-sm wf-text-secondary">选择结果：{last}</div>
      <div class="wf-p-md">
        <button class="wf-btn" type="button" onClick={() => { open = true; ctx.render() }}>选择操作</button>
      </div>
      <ActionSheet
        open={open}
        title="选择操作"
        items={[
          { key: 'camera', label: '拍照', icon: 'camera' },
          { key: 'album', label: '从相册选择', icon: 'image' },
          { key: 'share', label: '分享', icon: 'share' },
          { key: 'delete', label: '删除', icon: 'trash', danger: true },
        ]}
        onSelect={(k: string) => { last = k; ctx.render() }}
        onClose={() => { open = false; ctx.render() }}
      />
    </div>
  )
}

export const DEMOS: Record<string, any> = {
  VideoPlayer: DemoVideoPlayer,
  Math: DemoMath,
  MarkdownEditor: DemoMarkdownEditor,
  CodeEditor: DemoCodeEditor,
  ImageCropper: DemoImageCropper,
  "PageHeader": DemoPageHeader,
  "Icon": DemoIcon,
  "Divider": DemoDivider,
  "TabBar": DemoTabBar,
  "ActionSheet": DemoActionSheet,
}
