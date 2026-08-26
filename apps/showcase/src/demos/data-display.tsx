/**
 * data-display 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
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

import { h, createClientBrowser } from 'weifuwu/vdom'
import { FilePreview, FileTree, RelationGraph } from 'weifuwu/components'

import {
  SortableList, ExportCSV,
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

const DemoTable: Component = async (_props, ctx) => {
  let sortKey = 'name'
  let sortOrder: 'asc' | 'desc' = 'asc'
  let view = 'data' // 'data' | 'empty'
  const rerender = () => ctx.render()
  const data = [
    { id: 1, name: '张三', role: '管理员', status: '活跃', email: 'zhang@wf.dev', phone: '138-0000-0001', dept: '平台组' },
    { id: 2, name: '李四', role: '编辑', status: '离线', email: 'li@wf.dev', phone: '138-0000-0002', dept: '内容组' },
    { id: 3, name: '王五', role: '访客', status: '活跃', email: 'wang@wf.dev', phone: '138-0000-0003', dept: '设计组' },
  ]
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <div class="wf-row wf-gap-xs">
        <button class={`wf-btn wf-btn--sm ${view === 'data' ? 'wf-btn--primary' : 'wf-btn--secondary'}`} onClick={() => { view = 'data'; rerender() }}>有数据</button>
        <button class={`wf-btn wf-btn--sm ${view === 'empty' ? 'wf-btn--primary' : 'wf-btn--secondary'}`} onClick={() => { view = 'empty'; rerender() }}>空态</button>
      </div>
      <Table data={view === 'empty' ? [] : data} columns={[
        { key: 'id', label: 'ID', width: 60 },
        { key: 'name', label: '姓名', sortable: true, fixed: 'left', width: 120 },
        { key: 'role', label: '角色', sortable: true },
        { key: 'status', label: '状态', render: v => <Badge variant={v === '活跃' ? 'success' : 'default'}>{v}</Badge> },
        { key: 'email', label: '邮箱', render: v => <span class="wf-text-secondary">{v}</span> },
        { key: 'phone', label: '电话', render: v => <span class="wf-text-secondary">{v}</span> },
        { key: 'dept', label: '部门', render: v => <span class="wf-text-secondary">{v}</span> },
      ]}
        sortKey={sortKey} sortOrder={sortOrder}
        onSort={(key, order) => { sortKey = key; sortOrder = order; rerender() }} emptyText="暂无数据" minWidth="640px" />
      <div class="wf-text-xs wf-text-secondary">点击列头排序；姓名列固定（横向滚动时保持可见——sticky 首列）；切换查看空态</div>
    </div>
  )
}

const DemoCardShowcase: Component = async (_props, ctx) => {
  let clicked = false
  return async (_p: any) => (
    <div class="wf-row wf-gap-md wf-cluster">
      <Card>默认卡片</Card>
      <Card variant="outlined">线框卡片</Card>
      <Card clickable onClick={() => { clicked = true; ctx.render() }}>可点击卡片</Card>
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
        <Tag key={t} closable onClose={() => { tags = tags.filter((_: any, j: number) => j !== i); ctx.render() }}>{t}</Tag>
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
      <Button size="sm" variant="ghost" onClick={() => { logs = [...logs.slice(1), { key: String(Date.now()), title: '新事件', time: '现在', status: 'warning' as const, content: '点击追加' }]; ctx.render() }}>追加事件</Button>
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
      <MessageBubble role="assistant" status={st} content={st === 'error' ? '请求失败，请重试' : '北京 25°C，晴。'} actions={st === 'error' ? <Button size="sm" variant="ghost" onClick={() => { st = 'complete'; ctx.render() }}>🔄 重试</Button> : undefined} />
      <div class="wf-row wf-gap-xs">
        {(['complete', 'streaming', 'error'] as const).map(s => (
          <Button size="sm" variant={st === s ? 'primary' : 'ghost'} onClick={() => { st = s; ctx.render() }}>{s}</Button>
        ))}
      </div>
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
      <InView onEnter={() => { log = [...log, '已加载']; ctx.render() }}>
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

const DemoEditor: Component = async (_props, ctx) => {
  let html = '<p>Hello <strong>weifuwu</strong>!</p><blockquote>引用块示例</blockquote><p class="wf-text-center">居中文字</p>'
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <Editor value={html} onChange={v => { html = v; ctx.render() }} placeholder="输入内容..."
        ai={{ url: '/api/chat' }} draftKey="demo-editor-1" />
      <div class="wf-text-xs wf-text-secondary wf-py-xs wf-truncate wf-w-full">
        HTML 输出: {html?.substring(0, 150) || '(空)'}
      </div>
    </div>
  )
}

const DemoFilePreview: Component = async (_props, ctx) => {
  let md = '# 项目说明\n\n这是 **文件预览** 组件演示——Markdown 文档。\n\n代码示例：\n\n```js\nconst x = 1\n```\n\n表格：\n\n| 功能 | 状态 |\n|---|---|\n| 预览 | ✅ |\n| 编辑 | ✅ |\n\n\n> 支持预览与编辑（基于事件流）\n\n- 预览：复用 Markdown 安全渲染\n- 编辑：Editor 事件流事务层（撤销/时光机/AI）\n- 保存：序列化回 Markdown\n\n图片示例：![weifuwu](https://picsum.photos/200/100)\n\n---\n\n尾部段落。'
  let saved = ''
  return async (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <FilePreview type="md" url="/api/files/README.md" editable ai={{ url: '/api/chat' }} fileName="README.md"
        onSave={async (v: string) => {
          await fetch('/api/files/README.md', { method: 'PUT', body: v })
          saved = v; ctx.render()
        }} />
      {saved ? <div class="wf-text-xs wf-text-secondary wf-py-xs wf-truncate wf-w-full">已保存: {saved.substring(0, 80)}…</div> : null}
    </div>
  )
}

// office 前端导入/导出（零依赖转换——无需后端：自研 ZIP/XML + DecompressionStream）

const DemoFilePreviewOffice: Component = async (_props, ctx) => {
  return async () => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <FilePreview type="office" editable ai={{ url: '/api/chat' }} fileName="document.docx" />
      <div class="wf-text-xs wf-text-secondary wf-py-xs">
        点击「打开 docx/xlsx/pptx」选择本地文件 → 对应编辑器（Editor/SheetGrid/SlideCanvas）→ 下载导出——全程浏览器内转换（无后端）
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
  const rerender = () => ctx.render()
  const rootEl = () => (ctx.browser ?? createClientBrowser()).rootElement() as HTMLElement
  const applySeeds = (light: string, dark: string) => {
    rootEl().style.setProperty('--wf-brand-seed', light)
    rootEl().style.setProperty('--wf-dark-brand-seed', dark)
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
          rootEl().style.removeProperty('--wf-brand-seed')
          rootEl().style.removeProperty('--wf-dark-brand-seed')
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
    ctx.render()
  }
  const handleSave = async () => {
    const ok = await (ctx as any).confirm?.('保存修改？')
    result = ok ? '已保存' : '已取消'
    ctx.render()
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

const DemoAutoCompleteDis: Component = async (_p, ctx) => {
  let disabled = false
  return async () => (
    <div class="wf-stack wf-gap-sm wf-w-full">
      <AutoComplete options={[
        { value: 'pay-admin', label: '支付平台管理' },
        { value: 'order-center', label: '订单中心' },
      ]} disabled={disabled} placeholder="禁用时不可输入…" />
      <div><Button onClick={() => { disabled = !disabled; ctx.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}

const DemoTableRowSelect: Component = async (_props, ctx) => {
  let keys: (string | number)[] = [1]
  return async () => (
    <div class="wf-w-full wf-stack wf-gap-sm">
      <Table
        rowSelection={{ selectedRowKeys: keys, onChange: (k: (string | number)[]) => { keys = k; ctx.render() } }}
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
          ctx.render()
        }}>追加日志（模拟流）</Button>
        <Button size="sm" onClick={() => {
          lines = Array.from({ length: 10000 }, (_, i) => `[12:00:${String(i % 60).padStart(2, '0')}] 批量日志 ${i} 行`)
          ctx.render()
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
  const render = () => ctx.render()
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
  const render = () => ctx.render()
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
  const render = () => ctx.render()
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
      <LayoutSider collapsible collapsed={collapsed} onCollapse={(v) => { collapsed = v; ctx.render() }}>
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

const DemoPopconfirm: Component<any, UIContext & ToastInjected> = async (_p, ctx) => async () => (
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

const DemoFloatButton: Component<any, UIContext & ToastInjected> = async (_p, ctx) => async () => (
  <FloatButtonGroup>
    <FloatButton icon={<Icon name="edit" size={18} />} onClick={() => ctx.toast('编辑', 'info')} />
    <FloatButton icon={<Icon name="bar-chart" size={18} />} onClick={() => ctx.toast('报表', 'info')} />
    <FloatButton icon={<Icon name="settings" size={18} />} onClick={() => ctx.toast('设置', 'info')} />
  </FloatButtonGroup>
)

const DemoNavMenu: Component<any, UIContext & ToastInjected> = async (_p, ctx) => {
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
      onSelect={(k) => { active = k; ctx.toast(k, 'info'); ctx.render() }}
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


export const DemoSortableList: Component = async (_props, ctx) => {
  let items = [
    { id: 'a', name: '设计任务' }, { id: 'b', name: '开发任务' },
    { id: 'c', name: '测试任务' }, { id: 'd', name: '发布任务' },
  ]
  return async (_p: any) => (
    <div class="wf-w-full wf-stack wf-gap-xs">
      <div class="wf-text-xs wf-text-secondary">拖拽排序（keyed 身份——数据 id 驱动）</div>
      <SortableList
        items={items}
        keyField="id"
        onReorder={(next: any) => { items = next; ctx.render() }}
        renderItem={(it: any) => (
          <div class="wf-surface wf-surface--flat wf-border wf-rounded-sm wf-p-sm wf-row wf-between">
            <span class="wf-text-sm">≡ {it.name}</span>
            <span class="wf-text-xs wf-text-tertiary">{it.id}</span>
          </div>
        )}
      />
      <div class="wf-text-xs wf-text-tertiary">顺序：{items.map(i => i.name).join(' → ')}</div>
    </div>
  )
}

export const DemoExportCSV: Component = async (_props: any) => async (_p: any) => (
  <div class="wf-w-full wf-stack wf-gap-xs">
    <div class="wf-text-xs wf-text-secondary">表格数据一键导出 CSV（BOM + 引号转义——Excel 兼容）</div>
    <ExportCSV
      data={[{ id: 1, name: '张伟', amount: 1280 }, { id: 2, name: '李娜', amount: 560 }]}
      columns={[{ key: 'id', label: 'ID' }, { key: 'name', label: '客户' }, { key: 'amount', label: '金额' }]}
      filename="订单.csv"
    >导出 CSV</ExportCSV>
  </div>
)

/** FileTree（文件树浏览器——工作空间场景——受控：父层管理数据源） */
const DemoFileTree: Component = async (_props: any, ctx: any) => {
  // 模拟数据源（内存目录树——组件零 fetch 的诚实裁剪演示）
  const FS: Record<string, Array<{ name: string; type: 'dir' | 'file'; size?: number; mtime?: string }>> = {
    '/': [
      { name: 'docs', type: 'dir' },
      { name: 'src', type: 'dir' },
      { name: 'README.md', type: 'file', size: 2048, mtime: new Date(Date.now() - 3600e3).toISOString() },
    ],
    '/docs': [
      { name: 'api.md', type: 'file', size: 15360, mtime: new Date(Date.now() - 7200e3).toISOString() },
      { name: 'guide.md', type: 'file', size: 8192 },
    ],
    '/src': [
      { name: 'index.ts', type: 'file', size: 4096 },
      { name: 'components', type: 'dir' },
    ],
    '/src/components': [
      { name: 'App.tsx', type: 'file', size: 5120 },
      { name: 'ui.ts', type: 'file', size: 3072 },
    ],
  }
  let path = '/'
  let entries = FS['/']
  let openFile: { path: string; content: string } | null = null
  let editValue = ''
  let saving = false
  const contentOf = (p: string): string => `// ${p}
const answer = 42
export default answer
`
  const rerender = () => ctx.render()
  return async () => {
    return (
      <div class="wf-w-full wf-stack" style="--wf-gap:12px">
        <FileTree
          path={path}
          entries={entries}
          openFile={openFile}
          editValue={editValue}
          saving={saving}
          onOpenDir={(p) => { path = p; entries = FS[p.startsWith('/') ? p : '/' + p] ?? []; rerender() }}
          onOpenFile={(p) => { openFile = { path: p, content: contentOf(p) }; editValue = contentOf(p); rerender() }}
          onBack={() => { openFile = null; rerender() }}
          onEditChange={(v) => { editValue = v; rerender() }}
          onSave={(c) => { saving = true; rerender(); setTimeout(() => { saving = false; openFile = null; rerender() }, 400) }}
          onUpload={() => { }}
          onRefresh={() => rerender()}
        />
        <div class="wf-text-xs wf-text-secondary">受控组件：目录切换/文件编辑/保存由父层状态驱动——数据源可接任意 API（本地目录/沙盒卷/云端）。</div>
      </div>
    )
  }
}

/** RelationGraph（关系图谱——红楼人物关系/组织网络——确定性布局） */
const DemoRelationGraph: Component = async (_props: any, ctx: any) => {
  // 红楼前 80 回核心人物关系（示例数据）
  const NODES = [
    { id: '宝玉', label: '贾宝玉', kind: '主角', sublabel: '怡红公子' },
    { id: '黛玉', label: '林黛玉', kind: '主角', sublabel: '潇湘妃子', weight: 2 },
    { id: '宝钗', label: '薛宝钗', kind: '主角', sublabel: '蘅芜君' },
    { id: '贾母', label: '贾母', kind: '长辈', sublabel: '荣府老太君', weight: 3 },
    { id: '王熙凤', label: '王熙凤', kind: '管家', sublabel: '凤辣子' },
    { id: '袭人', label: '袭人', kind: '丫鬟', sublabel: '首席大丫鬟' },
    { id: '晴雯', label: '晴雯', kind: '丫鬟', sublabel: '芙蓉女儿' },
    { id: '贾政', label: '贾政', kind: '长辈', sublabel: '荣国府老爷' },
  ]
  const EDGES = [
    { from: '宝玉', to: '黛玉', type: '爱情', strength: 5 },
    { from: '宝玉', to: '宝钗', type: '爱情', strength: 3 },
    { from: '贾母', to: '宝玉', type: '亲情', strength: 4 },
    { from: '贾母', to: '黛玉', type: '亲情', strength: 3 },
    { from: '贾政', to: '宝玉', type: '亲情', strength: 2 },
    { from: '王熙凤', to: '贾母', type: '汇报', strength: 2, directed: true },
    { from: '袭人', to: '宝玉', type: '主仆', strength: 3 },
    { from: '晴雯', to: '宝玉', type: '主仆', strength: 2 },
    { from: '黛玉', to: '宝钗', type: '同盟', strength: 1 },
  ]
  let selected: string | null = null
  return async () => (
    <div class="wf-w-full wf-stack" style="--wf-gap:12px">
      <RelationGraph
        nodes={NODES}
        edges={EDGES}
        selectedId={selected}
        onSelect={(id) => { selected = id; ctx.render() }}
      />
      <div class="wf-text-xs wf-text-secondary">
        {selected
          ? `已选中：${selected}（点击其他节点切换——节点大小 = 权重，线宽 = 关系强度）`
          : '点击节点查看选中态（受控）——环形确定性布局——同数据每次渲染一致'}
      </div>
    </div>
  )
}

export const DEMOS: Record<string, any> = {
  SortableList: DemoSortableList,
  ExportCSV: DemoExportCSV,
  "Table": DemoTable,
  "Table 行选择": DemoTableRowSelect,
  "Card": DemoCardShowcase,
  "Badge": DemoBadge,
  "Tag": DemoTag,
  "Avatar": DemoAvatar,
  "Img": DemoImage,
  "InView": DemoInView,
  "Timeline": DemoTimeline,
  "Descriptions": DemoDescriptions,
  "Descriptions 紧凑": DemoDescriptionsSize,
  "AvatarGroup": DemoAvatarGroup,
  "Markdown": DemoMarkdown,
  "CodeBlock": DemoCodeBlock,
  "LogViewer": DemoLogViewer,
  "LogViewer 自定义": DemoLogViewerCustom,
  "JSONViewer": DemoJSONViewer,
  "JSONViewer 深展开": DemoJSONViewerDeep,
  "DiffView": DemoDiffView,
  "DiffView 标题": DemoDiffViewBig,
  "Sparkline": DemoSparkline,
  "Tour": DemoTour,
  "Kanban": DemoKanban,
  "Pipeline": DemoPipeline,
  "TreeSelect": DemoTreeSelect,
  "Layout": DemoLayout,
  "Popconfirm": DemoPopconfirm,
  "AutoComplete": DemoAutoComplete,
  "AutoComplete 禁用态": DemoAutoCompleteDis,
  "Link": DemoLink,
  "FloatButton": DemoFloatButton,
  "NavMenu": DemoNavMenu,
  "Space": DemoSpace,
  "Grid": DemoGrid,
  "Scrollbar": DemoScrollbar,
  "AlertGroup": DemoAlertGroup,
  "StatCard Countdown": DemoStatCountdown,
  "MessageBubble": DemoMessageBubble,
  "Highlight": DemoHighlight,
  "Highlight 多词": DemoHighlightMulti,
  "List": DemoList,
  "Result": DemoResult,
  "Confirm": DemoConfirm,
  "StatCard": DemoStatCard,
  "Chart": DemoChart,
  "Editor": DemoEditor,
  "FilePreview": DemoFilePreview,
  "FilePreview Office": DemoFilePreviewOffice,
  "ThemeSwitch": DemoThemeSwitch,
  "FileTree": DemoFileTree,
  "RelationGraph": DemoRelationGraph,
}
