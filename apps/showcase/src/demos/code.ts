/**
 * CODE 代码示例字符串（从 components-demo 迁移——括号配对提取，勿手改）
 * 组件「用法示例」代码数据源
 */
export const CODE = {
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
