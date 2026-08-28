/**
 * showcase 结构化索引——运行时构建(替代 content/index.json 静态文件)
 *
 * 数据源:registry/*.ts 单一事实源——关系推导(单向声明 → 反链自动生成):
 *   patterns[].uses → 组件 usedInPatterns
 *   apps[].uses     → 组件 usedInApps
 *   apps[].usesPatterns → patterns usedInApps
 *   backend[].relatedComponents → 组件 relatedBackend
 *
 * 消费方:server.ts `/index.json` 端点 → /components 与 /layout 页面 + 审计脚本。
 */
import { components } from './components.ts'
import { primitives } from './primitives.ts'
import { patterns } from './patterns.ts'
import { apps } from './apps.ts'
import { backend } from './backend.ts'
import { capabilities } from './capabilities.ts'
import { guides } from './guides.ts'
import { needs } from './needs.ts'
import { cases } from './cases.ts'
import { community } from './community.ts'
import { componentTags } from './tags.ts'

/** 变体卡片(Select (searchable) → Select)继承主组件标签 */
const VARIANT_PARENT: Record<string, string> = {
  'Select (searchable)': 'Select', 'Form 提交': 'Form', 'FileUpload 禁用': 'FileUpload',
  'TagsInput 限制/错误': 'TagsInput', 'Table 行选择': 'Table', 'Descriptions 紧凑': 'Descriptions',
  'LogViewer 自定义': 'LogViewer', 'JSONViewer 深展开': 'JSONViewer', 'DiffView 标题': 'DiffView',
  'AutoComplete 禁用态': 'AutoComplete', 'StatCard Countdown': 'StatCard', 'Highlight 多词': 'Highlight',
  'FilePreview Office': 'FilePreview', 'Toggle / ToggleGroup': 'ToggleGroup', 'PinInput 禁用态': 'PinInput',
  'Mentions 禁用态': 'Mentions', 'Tree 勾选': 'Tree', 'Cascader 禁用/错误': 'Cascader',
  'Calendar 事件': 'Calendar', 'VirtualTable 大数据': 'VirtualTable', 'InfiniteScroll 失败重试': 'InfiniteScroll',
}

/** 变体 id → 主组件 id(详情页 variantsOf 反查) */
const VARIANT_PARENT_ID: Record<string, string> = {
  'select-searchable': 'select', 'form-v2': 'form', 'fileupload-v2': 'fileupload',
  'tagsinput-v2': 'tagsinput', 'table-v2': 'table', 'descriptions-v2': 'descriptions',
  'logviewer-v2': 'logviewer', 'jsonviewer-v2': 'jsonviewer', 'diffview-v2': 'diffview',
  'autocomplete-v2': 'autocomplete', 'statcard-countdown': 'statcard', 'highlight-v2': 'highlight',
  'filepreview-office': 'filepreview', 'toggle-togglegroup': 'togglegroup', 'pininput-v2': 'pininput',
  'mentions-v2': 'mentions', 'tree-v2': 'tree', 'cascader-v2': 'cascader',
  'calendar-v2': 'calendar', 'virtualtable-v2': 'virtualtable', 'infinitescroll-v2': 'infinitescroll',
}

const tagOf = (name: string): string[] =>
  Object.entries(componentTags).filter(([, comps]) => comps.includes(name)).map(([tag]) => tag)
const tagOfAll = (name: string): string[] => {
  const t = tagOf(name)
  if (t.length) return t
  const parent = VARIANT_PARENT[name]
  return parent ? tagOf(parent) : []
}

export function buildIndexJson() {
  // ── 关系推导(反向) ──
  const usedInPatterns = new Map<string, string[]>()
  const usedInApps = new Map<string, string[]>()
  const relatedBackend = new Map<string, string[]>()
  const patternUsedInApps = new Map<string, string[]>()
  for (const p of patterns) for (const c of p.uses) {
    if (!usedInPatterns.has(c)) usedInPatterns.set(c, [])
    usedInPatterns.get(c)!.push(p.id)
  }
  for (const a of apps) for (const c of a.uses) {
    if (!usedInApps.has(c)) usedInApps.set(c, [])
    usedInApps.get(c)!.push(a.id)
  }
  for (const a of apps) for (const p of a.usesPatterns ?? []) {
    if (!patternUsedInApps.has(p)) patternUsedInApps.set(p, [])
    patternUsedInApps.get(p)!.push(a.id)
  }
  for (const b of backend) for (const c of b.relatedComponents ?? []) {
    if (!relatedBackend.has(c)) relatedBackend.set(c, [])
    relatedBackend.get(c)!.push(b.id)
  }

  return {
    counts: {
      components: components.length, primitives: primitives.length, patterns: patterns.length,
      apps: apps.length, backend: backend.length, capabilities: capabilities.length,
      guides: guides.length, community: community.length,
    },
    components: components.map((c: any) => ({
      id: c.id, name: c.name, category: c.category, desc: c.desc,
      family: c.family ?? null,
      variantOf: VARIANT_PARENT_ID[c.id] ?? null,
      tags: tagOfAll(c.name),
      sourceFile: c.sourceFile ?? null, cssFile: c.cssFile ?? null, testFile: c.testFile ?? null,
      gotchas: c.gotchas ?? [],
      usedInPatterns: usedInPatterns.get(c.name) ?? [],
      usedInApps: usedInApps.get(c.name) ?? [],
      relatedBackend: relatedBackend.get(c.name) ?? [],
    })),
    primitives,
    patterns: patterns.map((p) => ({
      id: p.id, name: p.name, group: p.group, desc: p.desc, file: p.file, uses: p.uses,
      usedInApps: patternUsedInApps.get(p.id) ?? [],
    })),
    apps: apps.map((a) => ({
      id: a.id, name: a.name, desc: a.desc, dir: a.dir, usesPatterns: a.usesPatterns, uses: a.uses,
      production: !!a.production, quality: a.quality ?? [],
    })),
    backend: backend.map((b) => ({
      id: b.id, name: b.name, group: b.group, desc: b.desc, middleware: b.middleware,
      endpoint: b.endpoint ?? null, relatedComponents: b.relatedComponents ?? [],
    })),
    capabilities: capabilities.map((c) => ({
      id: c.id, name: c.name, desc: c.desc, srcFile: c.srcFile, selfUsedIn: c.selfUsedIn,
    })),
    community,
    guides: guides.map((g) => ({ id: g.id, name: g.name, desc: g.desc })),
    needs,
    cases,
  }
}
