/**
 * new-batch 分类 demo（由 scripts/migrate-demos.mjs 从 components-demo 自动迁移——勿手改）
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

// 子应用组件（vdom——普通组件嵌入——应用实例状态闭包持有）
const MiniTodo = (_init: any, ctx: any) => {
    let items: string[] = ['子应用任务']
    let input = ''
    const rerender = () => ctx.render()
    return () => (
      <div class="wf-stack wf-gap-sm">
        <div class="wf-row wf-gap-sm">
          <input class="wf-input" style="flex:1" value={input}
            onInput={(e: any) => { input = e.target.value; rerender() }}
            placeholder="子应用输入…" />
          <Button size="sm" onClick={() => { if (input.trim()) { items.push(input.trim()); input = ''; rerender() } }}>添加</Button>
        </div>
        <ul style="margin:0;padding-left:16px">
          {items.map((it, i) => <li key={it + i} class="wf-font-sm">{it}</li>)}
        </ul>
      </div>
    )
}

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
        <h2 class="wf-font-2xl wf-margin-none wf-border-bottom wf-padding-bottom-sm">{props.title}</h2>
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 420px), 1fr))">{visible}</div>
      </section>
    )
  }
}

function DemoCard(initProps: { title: string; desc: string; code: string; children: any }, ctx: any) {
  let copied = false
  // §3.1 纪律：renderFn 用渲染期 props（最新）——mount 捕获的 initProps 不得用于渲染
  return (props: { title: string; desc: string; code: string; children: any }) => (
    <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-overflow-hidden" id={cardId(props.title)}>
      <h3 class="wf-font-base wf-semibold wf-padding-md wf-bg-secondary wf-border-bottom wf-margin-none">{props.title}</h3>
      <div class="wf-padding-md wf-row wf-gap-sm wf-cluster wf-border-bottom wf-overflow-auto">{props.children}</div>
      <div class="wf-padding-x-md wf-padding-y-sm wf-font-xs wf-text-secondary">{props.desc}</div>
      {/* S0：代码块默认收起（<details> 原生折叠——36% 页面高度退出渲染树）+ 复制按钮 */}
      <details>
        <summary class="wf-row wf-justify-between wf-gap-sm wf-padding-x-md wf-padding-y-sm wf-font-xs wf-text-secondary" style="cursor:pointer">
          <span>{copied ? '✓ 已复制' : '查看代码'}</span>
          <button
            type="button"
            class="wf-btn wf-btn--sm"
            onClick={(e: any) => { e.preventDefault(); e.stopPropagation(); void (ctx as any)?.browser?.copyText?.(props.code); copied = true; ctx.render() }}
          >复制</button>
        </summary>
        <pre class="wf-bg-tertiary wf-padding-md wf-font-xs wf-margin-none wf-overflow-auto">{props.code}</pre>
      </details>
    </div>
  )
}

// ── 交互型 Demo 组件 ──────────────────────────────────

const DemoRate: Component = (_props, ctx) => {
  let v = 3
  return () => (
    <div class="wf-stack wf-gap-sm">
      <Rate value={v} onChange={(n: number) => { v = n; ctx.render() }} />
      <Rate value={4} readOnly />
      <Rate value={v} allowHalf onChange={(n: number) => { v = n; ctx.render() }} />
      <div class="wf-font-xs wf-text-secondary">半星（与第一行同步）</div>
      <Rate size="lg" allowClear onChange={(n: number) => { v = n; ctx.render() }} />
      <div class="wf-font-sm wf-text-secondary">当前：{v} 星</div>
    </div>
  )
}

const DemoTypography: Component = () => () => (
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

const DemoLabel: Component = () => () => (
  <div class="wf-stack wf-gap-sm">
    <Label htmlFor="demo-name">用户名</Label>
    <Label required>必填项</Label>
  </div>
)

const DemoAspectRatio: Component = () => () => (
  <div class="wf-surface wf-surface--flat wf-border wf-radius-md">
    <AspectRatio ratio={16 / 9}>
      <div class="wf-center wf-text-secondary wf-bg-tertiary">16:9 容器</div>
    </AspectRatio>
  </div>
)

const DemoToggleGroup: Component = (_props, ctx) => {
  let single = 'bold'
  let multi: string[] = ['bold']
  let pressed = false
  return () => (
    <div class="wf-stack wf-gap-sm">
      <ToggleGroup type="single" options={[{ value: 'bold', label: 'B' }, { value: 'italic', label: 'I' }, { value: 'underline', label: 'U' }]} value={single} onChange={(v: any) => { single = v; ctx.render() }} />
      <ToggleGroup type="multiple" options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }]} value={multi} onChange={(v: any) => { multi = v; ctx.render() }} />
      <div class="wf-row wf-gap-sm">
        <Toggle pressed={pressed} onPressedChange={(p: boolean) => { pressed = p; ctx.render() }}>单个切换</Toggle>
        <span class="wf-font-sm wf-text-secondary">状态：{pressed ? '已按下' : '未按下'}</span>
      </div>
    </div>
  )
}

const DemoCheckboxGroup: Component = (_props, ctx) => {
  let v: string[] = ['a']
  return () => (
    <div class="wf-stack wf-gap-sm">
      <CheckboxGroup label="选择成员" options={[{ value: 'a', label: '张三' }, { value: 'b', label: '李四' }, { value: 'c', label: '王五' }]} value={v} onChange={(k: string[]) => { v = k; ctx.render() }} />
      <div class="wf-font-sm wf-text-secondary">已选：{v.join(', ') || '无'}</div>
    </div>
  )
}

const DemoPinInput: Component = (_props, ctx) => {
  let v = ''
  return () => (
    <div class="wf-stack wf-gap-sm">
      <PinInput length={6} value={v} onChange={(s: string) => { v = s; ctx.render() }} />
      <div class="wf-font-sm wf-text-secondary">验证码：{v || '等待输入'}</div>
    </div>
  )
}

const DemoCopyButton: Component = () => () => (
  <div class="wf-row wf-gap-sm">
    <CopyButton value="https://weifuwu.dev/docs" label="复制链接" />
    <CopyButton value="仅图标" iconOnly />
  </div>
)

const DemoColorPicker: Component = (_props, ctx) => {
  let c = '#4f6ef7'
  return () => (
    <div class="wf-stack wf-gap-sm">
      <ColorPicker value={c} showInput onChange={(v: string) => { c = v; ctx.render() }} />
      <div class="wf-row wf-gap-sm">
        <ColorPicker value={c} size="sm" onChange={(v: string) => { c = v; ctx.render() }} />
        <ColorPicker value={c} size="lg" onChange={(v: string) => { c = v; ctx.render() }} />
        <ColorPicker value={c} disabled onChange={() => {}} />
      </div>
      <div class="wf-font-sm wf-text-secondary">当前：{c}</div>
    </div>
  )
}

const DemoHoverCard: Component = () => () => (
  <HoverCard openDelay={0} content={
    <div class="wf-stack wf-gap-xs">
      <div class="wf-font-sm wf-semibold">用户详情</div>
      <div class="wf-font-xs wf-text-secondary">悬停卡片展示富内容，支持任意 VNode</div>
    </div>
  }>
    <Button variant="secondary">悬停查看用户</Button>
  </HoverCard>
)

const DemoNotification: Component = (_props, ctx) => {
  const show = () => {
    ;(ctx as any).notification?.success?.({ title: '部署成功', description: 'v0.63.0 已上线' })
  }
  return () => (
    <div class="wf-row wf-gap-sm">
      <Button variant="primary" onClick={show}>成功通知</Button>
      <Button variant="secondary" onClick={() => (ctx as any).notification?.warning?.({ title: '磁盘空间不足', description: '已使用 92%' })}>警告通知</Button>
    </div>
  )
}

const DemoBackTop: Component = () => () => (
  <div class="wf-stack wf-gap-sm">
    <div class="wf-font-sm wf-text-secondary">向下滚动页面超过 400px 后，右下角出现回到顶部按钮</div>
    <BackTop aria-label="回到顶部" />
  </div>
)

const DemoAffix: Component = () => () => (
  <div class="wf-stack wf-gap-sm">
    <div class="wf-font-sm wf-text-secondary">滚动页面：导航条滑出视窗顶部后固定（Affix，offsetTop=0）</div>
    {/* offsetTop=0：Affix 块滑出视窗顶部后才固定（scrollY >= 块文档位置）——
        offsetTop>0 则提前吸附（块距顶 offsetTop 时固定，antd 语义） */}
    <Affix offsetTop={0}>
      <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-x-md wf-padding-y-sm wf-row wf-gap-md wf-font-sm">
        <a href="#affix-demo" class="wf-text-primary">锚点一</a>
        <a href="#affix-demo" class="wf-text-secondary">锚点二</a>
        <a href="#affix-demo" class="wf-text-secondary">锚点三</a>
      </div>
    </Affix>
  </div>
)

const DemoAnchor: Component = (_props, ctx) => {
  let active = '#anchor-a'
  const sections = [
    { id: 'anchor-a', title: '第一节', body: Array.from({ length: 8 }, (_, i) => `这是第一节的第 ${i + 1} 段内容。用于演示锚点滚动高亮跟随。`).join('') },
    { id: 'anchor-b', title: '第二节', body: Array.from({ length: 8 }, (_, i) => `这是第二节的第 ${i + 1} 段内容。滚动时右侧锚点自动高亮当前节。`).join('') },
    { id: 'anchor-c', title: '第三节', body: Array.from({ length: 8 }, (_, i) => `这是第三节的第 ${i + 1} 段内容。点击锚点平滑滚动到对应位置。`).join('') },
  ]
  return () => (
    <div class="wf-width-full wf-row wf-gap-lg" style="align-items: flex-start">
      <div class="wf-fill">
        {sections.map(s => (
          <div id={s.id} class="wf-border-bottom wf-padding-bottom-md wf-margin-bottom-md">
            <div class="wf-font-base wf-semibold wf-margin-bottom-sm">{s.title}</div>
            <div class="wf-font-sm wf-text-secondary">{s.body}</div>
          </div>
        ))}
      </div>
      <div class="wf-surface wf-surface--flat wf-border wf-radius wf-padding-md" style="width: 140px; position: sticky; top: 16px">
        <Anchor items={sections.map(s => ({ href: `#${s.id}`, title: s.title }))}
          activeKey={active} onAnchorChange={h => { active = h; ctx.render() }} />
        <div class="wf-font-xs wf-text-secondary wf-margin-top-sm">滚动页面跟随高亮</div>
      </div>
    </div>
  )
}

const DemoContextMenu: Component = () => () => (
  <ContextMenu items={[
    { key: 'edit', label: '编辑', onClick: () => alert('编辑') },
    { key: 'copy', label: '复制' },
    { key: 'delete', label: '删除', variant: 'danger', onClick: () => alert('删除') },
  ]}>
    <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-lg wf-text-center wf-text-secondary">右键点击此区域</div>
  </ContextMenu>
)

const DemoMentions: Component = (_props, ctx) => {
  let v = '输入 @ 提及成员：@ali'
  return () => (
    <div class="wf-stack wf-gap-sm">
      <Mentions options={[{ value: 'alice', label: 'Alice' }, { value: 'bob', label: 'Bob' }, { value: 'carol', label: 'Carol' }]} value={v} onChange={(s: string) => { v = s; ctx.render() }} />
      <div class="wf-font-sm wf-text-secondary">文本：{v}</div>
    </div>
  )
}

const DemoCollapse: Component = (_props, ctx) => {
  let active = ['1']
  return () => (
    <Collapse items={[
      { key: '1', title: '知识库文档', content: '文档分块内容展示（行内展开，区别于 Accordion 卡片面板）' },
      { key: '2', title: '异步加载示例', loading: true },
      { key: '3', title: '带操作区', extra: <Button size="sm" variant="ghost">操作</Button>, content: '标题右侧可放操作按钮' },
    ]} active={active} onChange={(keys: string[]) => { active = keys; ctx.render() }} />
  )
}

const DemoToggleTree: Component = (_props, ctx) => {
  let checked = ['fe']
  let expanded = ['root', 'tech']
  let search = ''
  const treeData = [
    { key: 'root', label: '总部', children: [
      { key: 'tech', label: '技术部', children: [{ key: 'fe', label: '前端组' }, { key: 'be', label: '后端组' }] },
      { key: 'mkt', label: '市场部' },
    ] },
  ]
  return () => (
    <div class="wf-stack wf-gap-sm">
      <input class="wf-input" placeholder="搜索节点…" value={search} onInput={(e: any) => { search = e.target.value; ctx.render() }} />
      <Tree data={treeData} expandedKeys={expanded} onExpand={(keys: string[]) => { expanded = keys; ctx.render() }}
        searchValue={search}
        checkable checkedKeys={checked} onCheck={(keys: string[]) => { checked = keys; ctx.render() }} />
    </div>
  )
}

const DemoCascader: Component = (_props, ctx) => {
  let value: string[] = ['zj', 'hz']
  return () => (
    <Cascader options={[
      { value: 'zj', label: '浙江', children: [{ value: 'hz', label: '杭州' }, { value: 'nb', label: '宁波' }] },
      { value: 'gd', label: '广东', children: [{ value: 'sz', label: '深圳' }] },
    ]} value={value} onChange={(v: string[]) => { value = v; ctx.render() }} showSearch />
  )
}

const DemoCascaderDis: Component = (_p, ctx) => {
  let disabled = false
  let err = ''
  return () => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <Cascader options={[
        { value: 'zj', label: '浙江', children: [{ value: 'hz', label: '杭州' }] },
        { value: 'gd', label: '广东', children: [{ value: 'sz', label: '深圳' }] },
      ]} disabled={disabled} error={err} placeholder={disabled ? '禁用中' : '选择地区'} />
      <div class="wf-row wf-gap-sm">
        <Button onClick={() => { disabled = !disabled; err = ''; ctx.render() }}>{disabled ? '启用' : '禁用'}</Button>
        <Button variant="danger" onClick={() => { disabled = false; err = '地区必填（校验示例）'; ctx.render() }}>触发错误</Button>
      </div>
    </div>
  )
}

const DemoMentionsDis: Component = (_p, ctx) => {
  let disabled = false
  return () => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <Mentions options={[{ value: 'alice', label: 'Alice' }, { value: 'bob', label: 'Bob' }]} disabled={disabled} rows={2} placeholder={disabled ? '禁用中' : '输入 @ 提及成员…'} />
      <div><Button onClick={() => { disabled = !disabled; ctx.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}

const DemoPinInputDis: Component = (_p, ctx) => {
  let disabled = false
  return () => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <PinInput length={6} disabled={disabled} />
      <div><Button onClick={() => { disabled = !disabled; ctx.render() }}>{disabled ? '启用' : '禁用'}</Button></div>
    </div>
  )
}

const DemoVirtualTableBig: Component = (_props, ctx) => {
  // 10 万行大数据（虚拟滚动只渲染可见窗口）
  const big = Array.from({ length: 100000 }, (_, i) => ({ id: i, name: `条目-${i}`, value: i * 7 }))
  return () => (
    <VirtualTable height={280} data={big}
      columns={[{ key: 'id', label: 'ID', width: 80 }, { key: 'name', label: '名称' }, { key: 'value', label: '值', sortable: true }]} />
  )
}

const DemoToggleTreeCheck: Component = (_props, ctx) => {
  let checked: string[] = ['a1']
  const treeData = [
    { key: 'a', label: '前端组', children: [{ key: 'a1', label: 'React' }, { key: 'a2', label: 'Vue' }] },
    { key: 'b', label: '后端组', children: [{ key: 'b1', label: 'Node' }, { key: 'b2', label: 'Go' }] },
  ]
  return () => (
    <div class="wf-width-full wf-stack wf-gap-sm">
      <Tree data={treeData} checkable checkedKeys={checked}
        onCheck={(k: string[]) => { checked = k; ctx.render() }} />
      <div class="wf-font-xs wf-text-secondary">勾选：{checked.join(' / ') || '（无）'}——父子联动</div>
    </div>
  )
}

const DemoInfiniteScrollRetry: Component = (_props, ctx) => {
  let items = Array.from({ length: 8 }, (_, i) => `条目 ${i + 1}`)
  let loading = false
  let failed = false
  let page = 1
  return () => (
    <div class="wf-width-full wf-stack wf-gap-sm">
      <InfiniteScroll
        hasMore={items.length < 32}
        loading={loading}
        loadMoreText="加载中…"
        endText="已全部加载"
        onLoadMore={() => {
          if (loading) return
          loading = true; ctx.render()
          setTimeout(() => {
            page++
            // 第 2 页模拟失败（重试演示）
            if (page === 2) { failed = true; loading = false; ctx.render(); return }
            failed = false
            items = [...items, ...Array.from({ length: 8 }, (_, i) => `条目 ${items.length + i + 1}`)]
            loading = false; ctx.render()
          }, 800)
        }}>
        {items.map(it => <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-sm wf-margin-bottom-xs">{it}</div>)}
        {failed && <div class="wf-font-sm wf-text-error wf-margin-bottom-xs">加载失败——再次滚动重试</div>}
      </InfiniteScroll>
    </div>
  )
}

const DemoTransfer: Component = (_props, ctx) => {
  let target = ['a']
  return () => (
    <Transfer data={[{ key: 'a', label: '成员A' }, { key: 'b', label: '成员B' }, { key: 'c', label: '成员C' }, { key: 'd', label: '成员D' }]}
      targetKeys={target} onChange={(k: string[]) => { target = k; ctx.render() }} titles={['可选成员', '已选成员']} showSearch />
  )
}

const DemoCalendarEvents: Component = (_props, ctx) => {
  let view = { month: 5, year: 2025 }
  let selected = '2025-06-10'
  return () => (
    <div class="wf-width-full wf-flex wf-center">
      <Calendar
        month={view.month} year={view.year}
        selectedDate={selected}
        events={[
          { key: 'e1', date: '2025-06-10', title: '需求评审', color: 'var(--wf-color-brand)' },
          { key: 'e2', date: '2025-06-18', title: '发布 v0.78', color: 'var(--wf-color-success)' },
          { key: 'e3', date: '2025-06-25', title: '代码评审', color: 'var(--wf-color-warning)' },
        ]}
        onMonthChange={(m, y) => { view = { month: m, year: y }; ctx.render() }}
        onSelectDate={(d) => { selected = d; ctx.render() }} />
    </div>
  )
}

const DemoCommand: Component = (_props, ctx) => {
  let open = false
  const items = [
    { key: 'new', label: '新建聊天', shortcut: 'N', onSelect: () => { open = false; ctx.render() } },
    { key: 'search', label: '搜索', shortcut: 'S' },
    { key: 'settings', label: '设置', shortcut: 'G S' },
  ]
  return () => (
    <div class="wf-stack wf-gap-sm">
      <Button variant="secondary" onClick={() => { open = true; ctx.render() }}>打开命令面板（⌘K）</Button>
      <Command items={items} open={open} onOpenChange={(o: boolean) => { open = o; ctx.render() }} />
    </div>
  )
}

const DemoMenubar: Component = () => () => (
  <Menubar menus={[
    { key: 'file', label: '文件', items: [{ key: 'new', label: '新建', shortcut: 'Ctrl+N' }, { key: 'save', label: '保存', shortcut: 'Ctrl+S' }] },
    { key: 'edit', label: '编辑', items: [{ key: 'undo', label: '撤销', shortcut: 'Ctrl+Z' }] },
  ]} />
)

const DemoCarousel: Component = () => () => (
  <div class="wf-width-sm">
    <Carousel autoplay interval={2500}>
      {['🟥 第一张', '🟦 第二张', '🟩 第三张'].map((t, i) => (
        <div key={i} class="wf-bg-tertiary wf-padding-xl wf-text-center wf-radius-md">{t}</div>
      ))}
    </Carousel>
    <div class="wf-font-xs wf-text-secondary wf-margin-top-xs">autoplay：每 2.5s 自动切换</div>
  </div>
)

const DemoResizable: Component = () => () => (
  <div class="wf-surface wf-surface--flat wf-border wf-radius-md" style="height: 160px">
    <Resizable defaultSize={180}>
      {[<div class="wf-padding-md wf-font-sm wf-text-secondary">左面板（拖拽分隔条）</div>, <div class="wf-padding-md wf-font-sm wf-text-secondary">右面板</div>] as any}
    </Resizable>
  </div>
)

const DemoCalendar: Component = (_props, ctx) => {
  let view = { month: 5, year: 2025 }
  return () => (
    <Calendar month={view.month} year={view.year} selectedDate="2025-06-10"
      onMonthChange={(m: number, y: number) => { view = { month: m, year: y }; ctx.render() }}
      events={[
        { key: 'e1', date: '2025-06-10', title: '产品评审' },
        { key: 'e2', date: '2025-06-15', title: '团队周会' },
      ]} />
  )
}

const DemoWatermark: Component = () => () => (
  <Watermark text="weifuwu 内部资料">
    <div class="wf-surface wf-surface--flat wf-border wf-radius-md wf-padding-xl wf-text-center wf-text-secondary">水印覆盖内容区</div>
  </Watermark>
)

const DemoVirtualList: Component = () => () => (
  <VirtualList height={240} itemHeight={36} items={Array.from({ length: 200 }, (_, i) => ({ id: i, label: `第 ${i} 行` }))}
    renderItem={(item: any) => <div class="wf-font-sm wf-border-bottom wf-padding-y-xs wf-padding-x-sm">{item.label}</div>} />
)

const DemoApp: Component = (_init, ctx) => {
  let appProps = { title: '独立子应用' }
  const render = () => ctx.render()
  return () => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-font-sm wf-text-secondary">父应用嵌入子应用（app 节点——独立状态/事件可区分——同流全链路）</div>
      <Button size="sm" onClick={() => { appProps = { title: '更新: ' + Date.now() % 1000 }; render() }}>更新子应用 props</Button>
      <div class="wf-padding-sm wf-border wf-radius-md" style="--wf-border: var(--wf-color-border)">
        <h4 class="wf-font-sm" style="margin:0 0 8px">{appProps.title}</h4>
        {h(MiniTodo, { title: appProps.title })}
      </div>
    </div>
  )
}

const DemoVirtualTable: Component = (_props, ctx) => {
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
  return () => (
    <div class="wf-width-full">
      <VirtualTable columns={cols} data={data} height={320} rowHeight={40}
        sortKey={sortKey} sortOrder={sortOrder}
        onSort={(k: string, o: 'asc' | 'desc') => { sortKey = k; sortOrder = o; ctx.render() }}
        rowSelection={{ selectedRowKeys: selectedKeys, onChange: (k: (string|number)[]) => { selectedKeys = k; ctx.render() } }} />
      <div class="wf-font-xs wf-text-secondary wf-margin-top-sm">10,000 行仅渲染可见窗口（滚动流畅）；表头可排序 + 行选择（已选 {selectedKeys.length}）</div>
    </div>
  )
}

const DemoQRCode: Component = () => () => (
  <div class="wf-row wf-gap-md">
    <QRCode value="https://weifuwu.dev" size={96} />
    <QRCode value="https://weifuwu.dev/docs" size={96} color="#4f6ef7" />
  </div>
)

const DemoInfiniteScroll: Component = (_props, ctx) => {
  let items: string[] = Array.from({ length: 10 }, (_, i) => `条目 ${i + 1}`)
  let loading = false
  let hasMore = true
  return () => (
    <InfiniteScroll
      loading={loading}
      hasMore={hasMore}
      onLoadMore={() => {
        loading = true; ctx.render()
        setTimeout(() => {
          const next = Array.from({ length: 5 }, (_, i) => `条目 ${items.length + i + 1}`)
          items = [...items, ...next]
          loading = false
          if (items.length >= 30) hasMore = false
          ctx.render()
        }, 600)
      }}>
      <div class="wf-stack wf-gap-xs">
        {items.map(t => <div key={t} class="wf-font-sm wf-border-bottom wf-padding-y-xs">{t}</div>)}
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


export const DEMOS: Record<string, any> = {
  "多应用（app 节点）": DemoApp,
  "Rate": DemoRate,
  "Typography": DemoTypography,
  "Label": DemoLabel,
  "AspectRatio": DemoAspectRatio,
  "Toggle / ToggleGroup": DemoToggleGroup,
  "CheckboxGroup": DemoCheckboxGroup,
  "PinInput": DemoPinInput,
  "PinInput 禁用态": DemoPinInputDis,
  "CopyButton": DemoCopyButton,
  "ColorPicker": DemoColorPicker,
  "HoverCard": DemoHoverCard,
  "Notification": DemoNotification,
  "BackTop": DemoBackTop,
  "Affix": DemoAffix,
  "Anchor": DemoAnchor,
  "ContextMenu": DemoContextMenu,
  "Mentions": DemoMentions,
  "Mentions 禁用态": DemoMentionsDis,
  "Collapse": DemoCollapse,
  "Tree": DemoToggleTree,
  "Tree 勾选": DemoToggleTreeCheck,
  "Cascader": DemoCascader,
  "Cascader 禁用/错误": DemoCascaderDis,
  "Transfer": DemoTransfer,
  "Command": DemoCommand,
  "Menubar": DemoMenubar,
  "Carousel": DemoCarousel,
  "Resizable": DemoResizable,
  "Calendar": DemoCalendar,
  "Calendar 事件": DemoCalendarEvents,
  "Watermark": DemoWatermark,
  "VirtualList": DemoVirtualList,
  "VirtualTable": DemoVirtualTable,
  "VirtualTable 大数据": DemoVirtualTableBig,
  "InfiniteScroll": DemoInfiniteScroll,
  "InfiniteScroll 失败重试": DemoInfiniteScrollRetry,
  "QRCode": DemoQRCode,
}
