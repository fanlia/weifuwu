/**
 * showcase 结构化索引——运行时构建（registry 单一事实源）
 *
 * components-only 定稿（SHOWCASE-COMPONENTS-ONLY-PLAN）：组件表 + 标签体系
 * 两个数据面——其余域（布局原语/patterns/apps/backend/能力/指南/需求/案例/社区）
 * 已移除（git 历史可查）。变体继承主组件标签（tagOfAll）。
 *
 * 消费方：server.ts `/index.json` 端点 → 组件目录/详情页 + audit-showcase-dev.mjs。
 */
import { components } from './components.ts'
import { componentTags } from './tags.ts'

/** 变体卡片（Select (searchable) → Select）继承主组件标签 */
const VARIANT_PARENT: Record<string, string> = {
  'Select (searchable)': 'Select', 'Form 提交': 'Form', 'FileUpload 禁用': 'FileUpload',
  'TagsInput 限制/错误': 'TagsInput', 'Table 行选择': 'Table', 'Descriptions 紧凑': 'Descriptions',
  'LogViewer 自定义': 'LogViewer', 'JSONViewer 深展开': 'JSONViewer', 'DiffView 标题': 'DiffView',
  'AutoComplete 禁用态': 'AutoComplete', 'StatCard Countdown': 'StatCard', 'Highlight 多词': 'Highlight',
  'FilePreview Office': 'FilePreview', 'Toggle / ToggleGroup': 'ToggleGroup', 'PinInput 禁用态': 'PinInput',
  'Mentions 禁用态': 'Mentions', 'Tree 勾选': 'Tree', 'Cascader 禁用/错误': 'Cascader',
  'Calendar 事件': 'Calendar', 'VirtualTable 大数据': 'VirtualTable', 'InfiniteScroll 失败重试': 'InfiniteScroll',
}

/** 变体 id → 主组件 id（详情页 variantsOf 反查） */
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

/** 变体无自有标签 → 继承主组件标签 */
const tagOfAll = (name: string): string[] => {
  const t = tagOf(name)
  if (t.length) return t
  const parent = VARIANT_PARENT[name]
  return parent ? tagOf(parent) : []
}

export function buildIndexJson() {
  return {
    counts: { components: components.length },
    components: components.map((c) => ({
      id: c.id, name: c.name, desc: c.desc,
      family: c.family ?? null,
      variantOf: VARIANT_PARENT_ID[c.id] ?? null,
      tags: tagOfAll(c.name),
      sourceFile: c.sourceFile ?? null, cssFile: c.cssFile ?? null, testFile: c.testFile ?? null,
      gotchas: c.gotchas ?? [],
    })),
  }
}
