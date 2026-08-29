/**
 * ai-chat 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
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
  PromptTemplate,
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

const DemoJsonSchemaForm: Component = () => () => (
  <div class="wf-stack wf-gap-sm">
    <JsonSchemaForm schema={toolSchema} value={{ city: '北京', days: 3, with_weather: true }} submitLabel="执行工具" />
    <span class="wf-font-xs wf-text-secondary">↑ schema 驱动表单：必填校验（城市）拦截提交；单位/天数/开关即改即生效（onChange）</span>
  </div>
)

/** ReasoningBlock：CoT 推理过程折叠展示 */

const DemoReasoningBlock: Component = (_p, ctx) => {
  let streaming = false
  return () => (
    <div class="wf-stack wf-gap-sm">
      <ReasoningBlock
        content={'先分析用户意图：用户询问北京天气，需要调用 query_weather 工具。\n参数推导：city=北京，days=3（默认），单位取摄氏度。\n工具已就绪，开始执行。'}
        label="已思考"
        streaming={streaming}
      />
      <button class="wf-btn wf-btn--sm" onClick={() => { streaming = !streaming; ctx.render() }}>
        {streaming ? '停止模拟流式' : '模拟流式'}
      </button>
    </div>
  )
}

/** CitationCard：RAG 引用来源展示 */

const DemoCitationCard: Component = () => () => (
  <div class="wf-stack wf-gap-sm">
    <div class="wf-font-sm">根据以下资料回答：
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

const DemoSessionList: Component = (_p, ctx) => {
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
  return () => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        <div class="wf-col" style={{ width: '260px' }}>
          <SessionList
            sessions={sessions}
            activeId={active}
            searchable
            onSelect={(id) => { active = id; ctx.render() }}
            onNew={() => { sessions = [{ id: `s${idc++}`, title: '新会话', updatedAt: Date.now() }, ...sessions]; ctx.render() }}
            onRename={(id, title) => { sessions = sessions.map((s) => s.id === id ? { ...s, title } : s); ctx.render() }}
            onDelete={(id) => { sessions = sessions.filter((s) => s.id !== id); if (active === id) active = ''; ctx.render() }}
          />
        </div>
      </div>
      <span class="wf-font-xs wf-text-secondary">分组（今天/昨天/更早）+ 搜索 + 选中；悬停行内重命名/删除；+ 新建会话</span>
    </div>
  )
}

/** ApprovalCard：pending / approved / rejected 终态 */

const DemoApprovalCard: Component = (_p, ctx) => {
  let loading = false
  let modified: string | undefined
  return () => (
    <div class="wf-stack wf-gap-sm">
      <ApprovalCard
        request={{ id: 'ap1', toolCallId: 't1', name: 'place_order', args: { qty: 2 }, reason: '单笔超限，需人工确认' }}
        loading={loading}
        onApprove={() => { loading = true; ctx.render(); setTimeout(() => { loading = false; ctx.render() }, 1500) }}
        onReject={() => {}}
      />
      <div class="wf-font-xs wf-text-secondary">↑ 点「允许」看提交中状态（loading 防连点）</div>
      <ApprovalCard
        request={{ id: 'ap4', toolCallId: 't4', name: 'place_order', args: { qty: 2, note: '' }, reason: '单笔超限——可修改参数后批准（modified 决策）' }}
        argsSchema={{ type: 'object', properties: { qty: { type: 'integer', title: '数量', minimum: 1, maximum: 10 }, note: { type: 'string', title: '备注' } }, required: ['qty'] }}
        onApprove={(m) => { modified = m ? `qty=${m.qty}` : '原参数批准'; ctx.render() }}
        onReject={() => {}}
      />
      <div class="wf-font-xs wf-text-secondary">↑ 点「修改参数」改数量后批准：{modified ?? '（尚未操作）'}</div>
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

const DemoAiChat: Component = (_props, ctx) => {
  // vdom useChat：body 按协议固定（messages 数组）——工具调用/审批随事件处理
  const chat = ctx.ui.useChat({
    url: '/api/chat',
  })

  return () => (
    <div class="wf-stack wf-gap-sm">
      <AiChat chat={chat} maxHeight="300px" />
    </div>
  )
}

/** ChatInput：独立复用聊天输入条（单行/多行/流式——AiChat 抽取） */

const DemoChatInput: Component = (_props, ctx) => {
  let value = ''
  let streaming = false
  const sent: string[] = []
  const rerender = () => ctx.render()
  return () => (
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

const DemoAuthPage: Component = (_props, ctx) => {
  let mode: 'login' | 'register' = 'login'
  let loading = false
  let error = ''
  const rerender = () => ctx.render()
  return () => (
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



/** PromptTemplate：提示词模板编辑器（变量插入 + 预览填充） */
export const DemoPromptTemplate: Component = (_props: any, ctx: any) => {
  let value = '你是一位{{role}}，请用{{tone}}的语气介绍{{topic}}。'
  return () => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <PromptTemplate
        label="系统提示词模板"
        value={value}
        onChange={(v: string) => { value = v; ctx.render() }}
        variables={[
          { name: 'role', description: '角色' },
          { name: 'tone', description: '语气' },
          { name: 'topic', description: '主题' },
        ]}
        values={{ role: 'AI 助手', tone: '专业', topic: '组件库' }}
      />
    </div>
  )
}

export const DEMOS: Record<string, any> = {
  "AiChat": DemoAiChat,
  "ChatInput": DemoChatInput,
  "AuthPage": DemoAuthPage,
  "ToolCallCard": DemoToolCallCard,
  "JsonSchemaForm": DemoJsonSchemaForm,
  "ReasoningBlock": DemoReasoningBlock,
  "CitationCard": DemoCitationCard,
  "SessionList": DemoSessionList,
  "ApprovalCard": DemoApprovalCard,
  "PromptTemplate": DemoPromptTemplate,
}
