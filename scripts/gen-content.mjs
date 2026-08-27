#!/usr/bin/env node
/**
 * content/ 文档生成器——从 registry（单一数据源）生成全站文档。
 *
 * 输出（根级 content/——随包发布 + 平台 serve + LLM 直读三处同源）：
 *   index.md           文档库入口（= 平台 /llms.txt 内容源）
 *   index.json         全量结构化索引（六表 + 关系推导字段）
 *   components/:id.md  组件文档（七节模板：概述/API/示例/纪律/关系/文件位置/验证）
 *   layout|patterns|apps|backend|capabilities|guides/:id.md
 *
 * 关系推导（单向声明 → 反链自动生成，禁止手维护）：
 *   patterns[].uses → 组件 usedInPatterns
 *   apps[].uses     → 组件 usedInApps
 *   apps[].usesPatterns → patterns usedInApps
 *   backend[].relatedComponents → 组件 relatedBackend
 *
 * 用法：node scripts/gen-content.mjs [--check]
 *   --check：校验模式（不写文件——防漂移测试用）
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractProps } from './extract-props.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const REG = join(root, 'apps/showcase/src/registry')
const OUT = join(root, 'content')
const CHECK = process.argv.includes('--check')

// ── registry 加载 ──
const { components } = await import(`${REG}/components.ts`)
const { primitives } = await import(`${REG}/primitives.ts`)
const { patterns } = await import(`${REG}/patterns.ts`)
const { apps } = await import(`${REG}/apps.ts`)
const { backend } = await import(`${REG}/backend.ts`)
const { capabilities } = await import(`${REG}/capabilities.ts`)
const { guides } = await import(`${REG}/guides.ts`)
const { needs } = await import(`${REG}/needs.ts`)
const { cases } = await import(`${REG}/cases.ts`)
const { community } = await import(`${REG}/community.ts`)
const { componentTags } = await import(`${REG}/tags.ts`)

// 功能标签反查（组件名 → tags）
const tagOf = (name) =>
  Object.entries(componentTags).filter(([, comps]) => comps.includes(name)).map(([tag]) => tag)
// 变体卡片（Select (searchable) → Select）继承主组件标签
const VARIANT_PARENT = {
  'Select (searchable)': 'Select', 'Form 提交': 'Form', 'FileUpload 禁用': 'FileUpload',
  'TagsInput 限制/错误': 'TagsInput', 'Table 行选择': 'Table', 'Descriptions 紧凑': 'Descriptions',
  'LogViewer 自定义': 'LogViewer', 'JSONViewer 深展开': 'JSONViewer', 'DiffView 标题': 'DiffView',
  'AutoComplete 禁用态': 'AutoComplete', 'StatCard Countdown': 'StatCard', 'Highlight 多词': 'Highlight',
  'FilePreview Office': 'FilePreview', 'Toggle / ToggleGroup': 'ToggleGroup', 'PinInput 禁用态': 'PinInput',
  'Mentions 禁用态': 'Mentions', 'Tree 勾选': 'Tree', 'Cascader 禁用/错误': 'Cascader',
  'Calendar 事件': 'Calendar', 'VirtualTable 大数据': 'VirtualTable', 'InfiniteScroll 失败重试': 'InfiniteScroll',
}
const tagOfAll = (name) => {
  const t = tagOf(name)
  if (t.length) return t
  const parent = VARIANT_PARENT[name]
  return parent ? tagOf(parent) : []
}

// ── 代码示例：apps/showcase/src/demos/code.ts（从 components-demo 迁移——勿手改） ──
const { CODE: codeObj } = await import('../apps/showcase/src/demos/code.ts')
const codeOf = (e) => (e.codeKey ? codeObj[e.codeKey] ?? null : null)

// ── 关系推导（反向） ──
const usedInPatterns = new Map() // componentName → pattern ids
const usedInApps = new Map()
const relatedBackend = new Map()
const patternUsedInApps = new Map()
for (const p of patterns) for (const c of p.uses) {
  if (!usedInPatterns.has(c)) usedInPatterns.set(c, [])
  usedInPatterns.get(c).push(p.id)
}
for (const a of apps) for (const c of a.uses) {
  if (!usedInApps.has(c)) usedInApps.set(c, [])
  usedInApps.get(c).push(a.id)
}
for (const a of apps) for (const p of a.usesPatterns) {
  if (!patternUsedInApps.has(p)) patternUsedInApps.set(p, [])
  patternUsedInApps.get(p).push(a.id)
}
for (const b of backend) for (const c of b.relatedComponents ?? []) {
  if (!relatedBackend.has(c)) relatedBackend.set(c, [])
  relatedBackend.get(c).push(b.id)
}

// ── 输出写入（统一） ──
let changed = 0
function write(outPath, content) {
  const abs = join(root, outPath)
  if (CHECK) {
    if (!existsSync(abs) || readFileSync(abs, 'utf-8') !== content) {
      console.error(`[gen-content] 漂移: ${outPath} 缺失或过期——运行 node scripts/gen-content.mjs`)
      process.exitCode = 1
    }
    return
  }
  mkdirSync(join(dirname(abs)), { recursive: true })
  writeFileSync(abs, content)
  changed++
}

// ── 分类通用纪律兜底（02 P2：AGENTS.md 事故按分类归类——组件级事故优先登记 registry gotchas） ──
const CATEGORY_GOTCHA = {
  form: '> 受控纪律（§5.2）：受控 props 必须配回调——缺回调静默不可点；受控输入（§5.3）输入态不依赖 value 回流（焦点丢失）',
  input: '> 受控输入纪律（§5.3）：输入期间 value 走内部态（useControlledInput）——依赖回流会重挂 input 丢焦点；IME composition 门控',
  overlay: '> 弹窗纪律（§5.4）：浮层必须 createPortal 渲染（#__wf_portal）——禁 absolute 相对父容器（overflow/transform 裁剪）；统一走 ctx.ui.usePopup',
  navigation: '> 键盘可达（P1）：方向键导航焦点跟随（roving tabindex）；受控 props 配回调',
  display: '> 三层一致（§6.3）：条件渲染 false 是空洞占位——数组项 key 由业务声明',
  feedback: '> 退场动画（§8）：exit 类必须挂载（animationend 驱动）+ reduced-motion 降级',
  ai: '> AI 协议纪律：消息流事件驱动（useChat 订阅）——高频 notify 由写者控制频率',
  virtual: '> 大数据渲染：固定行高 + 窗口化（VirtualList）——动态高度裁剪登记',
  editor: '> 内容编辑：textarea value 走 property（attribute 只是 defaultValue）；受控输入纪律',
  viz: '> 图表自研 SVG：数据点 label 为轴名；交互 tooltip 经 usePopup（视口夹紧）',
  core: '> 浏览器纪律（§5.5）：组件能力经 ctx.browser / ctx.ui.useXXX——禁裸 window/document',
}

// ── 典型场景推导（02 计划：组件"活在哪里"可见——分类场景模板 + 共现关系） ──
const CATEGORY_SCENE = {
  core: '基础元素（按钮/图标/文本/卡片/标签）——任意页面的构成单元',
  input: '表单输入/搜索/筛选——查询区、编辑表单、设置页',
  form: '创建/编辑表单页——提交、校验、字段编排',
  display: '数据展示——列表页、详情页、信息呈现',
  viz: '数据看板/统计报表——指标卡、图表、趋势',
  feedback: '操作反馈/结果页/确认——保存成功、删除确认、空态/加载态',
  navigation: '页面导航——侧栏、页头、标签页、步骤、分页',
  overlay: '浮层交互——弹窗、下拉、气泡、抽屉、命令面板',
  advanced: '复杂数据交互——穿梭、树、级联、看板、流水线',
  virtual: '大数据列表/表格/树——千级+数据量的性能场景',
  editor: 'office 文档/代码/内容编辑——xlsx/pptx/代码/公式/裁剪',
  ai: 'AI 对话/工具调用/审批/提示词——agent 场景全链路',
}
const sceneOf = (e) => {
  const scenes = []
  const ups = usedInPatterns.get(e.name) ?? []
  const upa = usedInApps.get(e.name) ?? []
  if (ups.length) scenes.push(`页面模式：${ups.join('、')}（复制即用蓝本——examples/patterns/）`)
  if (upa.length) scenes.push(`应用模板：${upa.join('、')}（examples/apps/ 完整可跑）`)
  scenes.push(CATEGORY_SCENE[e.category] ?? '通用交互元素')
  return scenes
}

// ── 组件文档（七节模板） ──
function compDoc(e) {
  const code = codeOf(e)
  const api = e.sourceFile ? extractProps(join(root, e.sourceFile)) : null
  const lines = []
  lines.push(`# ${e.name} · components`)
  lines.push('', `## 概述`, '', `${e.desc}`)
  lines.push('', `## 典型场景`)
  const scene = sceneOf(e)
  if (scene) lines.push('', ...scene.map((x) => `- ${x}`))
  lines.push('', `## API`)
  if (api && api.length) {
    lines.push('', '| prop | 类型 | 必填 | 说明 |', '|------|------|------|------|')
    for (const p of api) {
      const t = p.type.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      lines.push(`| \`${p.name}\` | \`${t}\` | ${p.optional ? '否' : '是'} | ${p.comment ?? ''} |`)
    }
  } else {
    lines.push('', `> props 提取降级（接口格式特殊）——见源码：\`${e.sourceFile ?? '—'}\``)
  }
  lines.push('', `## 用法示例`)
  if (code) lines.push('', '```tsx', code, '```')
  else lines.push('', '> （P1 迁移 CODE 字符串）')
  lines.push('', `## 纪律/坑`)
  if (e.gotchas?.length) lines.push('', ...e.gotchas.map((g) => `- ${g}`))
  else lines.push('', CATEGORY_GOTCHA[e.category] ?? '> （该分类暂无通用纪律——组件级事故见源码注释）')
  const ups = usedInPatterns.get(e.name) ?? []
  const upa = usedInApps.get(e.name) ?? []
  const rb = relatedBackend.get(e.name) ?? []
  lines.push('', `## 关系`)
  lines.push('', ups.length ? `- ↑ 用于页面模式：${ups.map((x) => `[${x}](../patterns/${x}.md)`).join(' · ')}` : '- ↑ 用于页面模式：（暂无）')
  lines.push(upa.length ? `- ↑ 用于应用：${upa.map((x) => `[${x}](../apps/${x}.md)`).join(' · ')}` : '- ↑ 用于应用：（暂无）')
  lines.push(rb.length ? `- → 后端能力：${rb.map((x) => `[${x}](../backend/${x}.md)`).join(' · ')}` : '- → 后端能力：（暂无）')
  lines.push('', `## 文件位置`)
  lines.push('', '| 文件 | 路径 |', '|------|------|')
  if (e.sourceFile) lines.push(`| 源码 | \`${e.sourceFile}\` |`)
  if (e.cssFile) lines.push(`| 样式 | \`${e.cssFile}\` |`)
  if (e.testFile) lines.push(`| 测试 | \`${e.testFile}\` |`)
  if (e.demo) lines.push(`| demo | \`apps/showcase/src/demos/${e.demo}.tsx\`（P1 拆分） |`)
  lines.push('', `## 验证`)
  lines.push('', `> agent-browser 走查：打开 \`/components/${e.category}/${e.id}\` ——（P1 填充具体步骤）`)
  return lines.join('\n') + '\n'
}

// ── 各域文档 ──
function patternDoc(p) {
  const upa = patternUsedInApps.get(p.id) ?? []
  return [
    `# ${p.name} · patterns`, '',
    `## 概述`, '', p.desc, '',
    `## 构成组件`,
    ...(p.uses.length ? p.uses.map((c) => `- [${c}](../components/${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md)`) : ['- （无）']),
    '', `## 关系`, '',
    upa.length ? `- ↑ 用于应用：${upa.map((x) => `[${x}](../apps/${x}.md)`).join(' · ')}` : '- ↑ 用于应用：（暂无）', '',
    `## 源码`, '', `\`examples/${p.file}\` ——复制即用（随 npm 包发布）`, '',
    '```text', `（源码见 examples/${p.file}——平台页 /patterns/${p.id} 内嵌预览）`, '```', '',
    `## 验证`, '', `> agent-browser 走查：打开 \`/patterns/${p.id}\` ——（P1 填充）`, '',
  ].join('\n')
}

function appDoc(a) {
  return [
    `# ${a.name} · apps${a.production ? '（生产级）' : ''}`, '',
    `## 概述`, '', a.desc, '',
    a.production ? '> **生产级参考**：目录独立于 showcase（apps/agent-platform/），此处为展示层纳入——架构文档 + 源码索引 + 启动方式。' : '',
    `## 用到的页面模式`,
    ...(a.usesPatterns.length ? a.usesPatterns.map((p) => `- [${p}](../patterns/${p}.md)`) : ['- （无）']),
    '', `## 用到的组件`,
    ...(a.uses.length ? a.uses.map((c) => `- [${c}](../components/${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md)`) : ['- （无）']),
    '', `## 源码`, '', a.production ? '> 源码见 `apps/agent-platform/`（独立仓库结构——不随包）' : `> \`examples/${a.dir}/\` ——完整可运行（随 npm 包发布）`,
    ...(a.files?.length ? ['', `## 目录结构`, '', '| 文件 | 职责 |', '|------|------|', ...a.files.map((f) => `| \`${f.name}\` | ${f.role} |`)] : []),
    ...(a.guide?.length ? ['', `## 改造指南（新手从跑起来到改成自己的）`, '', ...a.guide.map((g) => `- ${g}`)] : []),
    ...(a.quality ? ['', `## 质量标准`, '', ...a.quality.map((q) => `- [x] ${q}`)] : []),
    '', `## 验证`, '', a.production
      ? '> 独立部署验证（docker + 真实库）——见 apps/agent-platform/README.md'
      : `> agent-browser 走查：打开 showcase \`/apps/${a.id}\`（活体嵌入）——列表/新建/保存/删除全流程 + 控制台零错误`, '',
  ].join('\n')
}

function backendDoc(b) {
  return [
    `# ${b.name} · backend`, '',
    `## 概述`, '', b.desc, '',
    `## 装配`, '', `中间件注入键：\`${b.middleware}\``,
    ...(b.endpoint ? ['', `## 活体端点`, '', `\`\`\`bash`, `curl ${b.endpoint}`, `\`\`\``] : []),
    ...(b.relatedComponents?.length ? ['', `## 关联组件`, ...b.relatedComponents.map((c) => `- [${c}](../components/${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md)`) ] : []),
    ...(b.docsSource ? ['', `## 文档素材`, '', `来源：\`${b.docsSource}\`（迁移至本节——P3）`] : []),
    '', `## 验证`, '', `> curl 活体端点断言响应（P2 填充具体断言）`, '',
  ].join('\n')
}

function capDoc(c) {
  return [
    `# ${c.name} · capabilities`, '',
    `## 概述`, '', c.desc, '',
    `## 框架源码`, '', `\`${c.srcFile}\``, '',
    `## 平台自证`, '', ...c.selfUsedIn.map((s) => `- ${s}`), '',
    ...(c.discipline ? [`## 相关纪律`, '', `\`${c.discipline}\``, ''] : []),
    `## 验证`, '', `> agent-browser 走查：打开 \`/capabilities/${c.id}\` ——（P1 填充）`, '',
  ].join('\n')
}

function primDoc(f) {
  return [
    `# ${f.name} · layout（${f.kind === 'utility' ? '工具类' : '原语'}）`, '',
    `## 概述`, '', f.desc, '',
    `## 代表类`, '', '```css', ...f.classes.map((c) => `.${c}`), '```', '',
    `## 源码`, '', `\`src/client/layout/${f.cssFile}\``, '',
    `## 验证`, '', `> showcase 活体演示页：\`/layout/${f.id}\`（族示例 + 代表类）`, '',
  ].join('\n')
}

// ── 主流程 ──
for (const e of components) write(`content/components/${e.id}.md`, compDoc(e))
for (const f of primitives) write(`content/layout/${f.id}.md`, primDoc(f))
for (const p of patterns) write(`content/patterns/${p.id}.md`, patternDoc(p))
for (const a of apps) write(`content/apps/${a.id}.md`, appDoc(a))
for (const b of backend) write(`content/backend/${b.id}.md`, backendDoc(b))
for (const c of capabilities) write(`content/capabilities/${c.id}.md`, capDoc(c))
for (const g of guides) {
  // guides 正文文件优先（手写/迁移的完整文档——registry body 仅为骨架占位）
  const existing = join(OUT, 'guides', `${g.id}.md`)
  if (existsSync(existing)) continue
  write(`content/guides/${g.id}.md`, g.body + '\n')
}

// ── index.md（文档库入口） ──
write('content/index.md', [
  '# weifuwu 文档库（content/）', '',
  '> weifuwu 全栈能力参考——随 npm 包发布（`node_modules/weifuwu/content/`）。',
  '> LLM 开发路径：先读本文件 → 按域打开目标 `.md` → 复制 examples/ 源码。', '',
  '## 域索引', '',
  `- **组件**（${components.length}）：逐一组件文档（API 表/纪律/关系/验证）——[components/](components/)`,
  `- **布局原语**（${primitives.length} 族）：wf-* 原语与工具类——[layout/](layout/)`,
  `- **页面模式**（${patterns.length}）：复制即用的完整页面——[patterns/](patterns/)`,
  `- **应用模板**（${apps.length}）：完整可运行应用（含 agent-platform 生产级案例）——[apps/](apps/)`,
  `- **后端能力**（${backend.length}）：ctx 注入链/数据/实时/AI/SaaS——[backend/](backend/)`,
  `- **框架能力**（${capabilities.length}）：框架怎么工作（平台自证）——[capabilities/](capabilities/)`,
  `- **指南**（${guides.length}）：学习路径/选型/质量标准——[guides/](guides/)`, '',
  '## 结构化索引', '',
  '- `index.json`：六表全量 + 关系推导字段（uses/usedIn/usesPatterns——机器可遍历）', '',
  '## 组件速查', '',
  ...components.map((e) => `- [${e.name}](components/${e.id}.md) — ${e.desc}`),
  '',
].join('\n'))

// ── index.json（全量结构化 + 关系） ──
const VARIANT_PARENT_ID = {
  'select-searchable': 'select', 'form-v2': 'form', 'fileupload-v2': 'fileupload',
  'tagsinput-v2': 'tagsinput', 'table-v2': 'table', 'descriptions-v2': 'descriptions',
  'logviewer-v2': 'logviewer', 'jsonviewer-v2': 'jsonviewer', 'diffview-v2': 'diffview',
  'autocomplete-v2': 'autocomplete', 'statcard-countdown': 'statcard', 'highlight-v2': 'highlight',
  'filepreview-office': 'filepreview', 'toggle-togglegroup': 'togglegroup', 'pininput-v2': 'pininput',
  'mentions-v2': 'mentions', 'tree-v2': 'tree', 'cascader-v2': 'cascader',
  'calendar-v2': 'calendar', 'virtualtable-v2': 'virtualtable', 'infinitescroll-v2': 'infinitescroll',
}

const relComp = (c) => ({
  id: c.id, name: c.name, category: c.category, desc: c.desc,
  family: c.family ?? null,
  variantOf: VARIANT_PARENT_ID[c.id] ?? null,
  tags: tagOfAll(c.name),
  sourceFile: c.sourceFile ?? null, cssFile: c.cssFile ?? null, testFile: c.testFile ?? null,
  gotchas: c.gotchas ?? [],
  usedInPatterns: usedInPatterns.get(c.name) ?? [],
  usedInApps: usedInApps.get(c.name) ?? [],
  relatedBackend: relatedBackend.get(c.name) ?? [],
})
write('content/index.json', JSON.stringify({
  counts: { components: components.length, primitives: primitives.length, patterns: patterns.length, apps: apps.length, backend: backend.length, capabilities: capabilities.length, guides: guides.length, community: community.length },
  components: components.map(relComp),
  primitives,
  patterns: patterns.map((p) => ({ id: p.id, name: p.name, group: p.group, desc: p.desc, file: p.file, uses: p.uses, usedInApps: patternUsedInApps.get(p.id) ?? [] })),
  apps: apps.map((a) => ({ id: a.id, name: a.name, desc: a.desc, dir: a.dir, usesPatterns: a.usesPatterns, uses: a.uses, production: !!a.production, quality: a.quality ?? [] })),
  backend: backend.map((b) => ({ id: b.id, name: b.name, group: b.group, desc: b.desc, middleware: b.middleware, endpoint: b.endpoint ?? null, relatedComponents: b.relatedComponents ?? [] })),
  capabilities: capabilities.map((c) => ({ id: c.id, name: c.name, desc: c.desc, srcFile: c.srcFile, selfUsedIn: c.selfUsedIn })),
  community,
  guides: guides.map((g) => ({ id: g.id, name: g.name, desc: g.desc })),
  needs,
  cases,
}, null, 2) + '\n')

console.log(CHECK
  ? (process.exitCode ? '✗ content/ 漂移检测失败（运行 node scripts/gen-content.mjs 重新生成）' : '✓ content/ 与 registry 同步')
  : `✓ 生成 content/（${components.length} 组件 · ${patterns.length} 模式 · ${apps.length} 应用 · ${backend.length} 后端 · ${capabilities.length} 能力 · ${guides.length} 指南 · ${primitives.length} 原语族）`)
