/**
 * showcase 结构化索引——运行时构建（registry 单一事实源）
 *
 * components-only 定稿（SHOWCASE-COMPONENTS-ONLY-PLAN）：组件表 + 标签体系 + 变体表
 * 三个数据面——其余域已移除。**一页一组件**（2026-09 收敛）：变体条目不再独立
 * 建页——变体元数据挂主组件（index.json components[].variants——页面章节渲染）。
 *
 * 消费方：server.ts `/index.json` 端点 → 组件目录/详情页 + audit-showcase-dev.mjs。
 */
import { components } from './components.ts'
import { componentTags } from './tags.ts'

/** 变体表：主组件 id → 变体数组（一页一组件——变体并入主页面章节） */
const VARIANTS_OF: Record<string, { id: string; name: string; desc: string }[]> = {
  select: [{ id: 'select-searchable', name: 'Select (searchable)', desc: '可搜索下拉——输入过滤选项' }],
  form: [{ id: 'form-v2', name: 'Form 提交', desc: '表单整体提交——校验/loading/成功态' }],
  fileupload: [{ id: 'fileupload-v2', name: 'FileUpload 禁用', desc: '上传禁用态' }],
  tagsinput: [{ id: 'tagsinput-v2', name: 'TagsInput 限制/错误', desc: '标签数量限制 + 错误态' }],
  table: [{ id: 'table-v2', name: 'Table 行选择', desc: '行选择 + 批量操作' }],
  descriptions: [{ id: 'descriptions-v2', name: 'Descriptions 紧凑', desc: '紧凑排布' }],
  logviewer: [{ id: 'logviewer-v2', name: 'LogViewer 自定义', desc: '自定义行渲染/日志级别过滤' }],
  jsonviewer: [{ id: 'jsonviewer-v2', name: 'JSONViewer 深展开', desc: '深层节点展开' }],
  diffview: [{ id: 'diffview-v2', name: 'DiffView 标题', desc: '对比面板标题/提示语' }],
  layout: [
    { id: 'layoutheader', name: 'LayoutHeader', desc: '顶栏区域' },
    { id: 'layoutsider', name: 'LayoutSider', desc: '侧栏区域' },
    { id: 'layoutcontent', name: 'LayoutContent', desc: '内容区域' },
  ],
  autocomplete: [{ id: 'autocomplete-v2', name: 'AutoComplete 禁用态', desc: '禁用态' }],
  statcard: [{ id: 'statcard-countdown', name: 'StatCard Countdown', desc: '倒计时 KPI' }],
  highlight: [{ id: 'highlight-v2', name: 'Highlight 多词', desc: '多关键词高亮' }],
  filepreview: [{ id: 'filepreview-office', name: 'FilePreview Office', desc: 'Office 文档预览' }],
  togglegroup: [{ id: 'toggle-togglegroup', name: 'Toggle / ToggleGroup', desc: '开关组' }],
  pininput: [{ id: 'pininput-v2', name: 'PinInput 禁用态', desc: '禁用态' }],
  mentions: [{ id: 'mentions-v2', name: 'Mentions 禁用态', desc: '禁用态' }],
  tree: [{ id: 'tree-v2', name: 'Tree 勾选', desc: '勾选模式' }],
  cascader: [{ id: 'cascader-v2', name: 'Cascader 禁用/错误', desc: '禁用/错误态' }],
  calendar: [{ id: 'calendar-v2', name: 'Calendar 事件', desc: '事件日期标记' }],
  virtualtable: [{ id: 'virtualtable-v2', name: 'VirtualTable 大数据', desc: '万行虚拟滚动' }],
  infinitescroll: [{ id: 'infinitescroll-v2', name: 'InfiniteScroll 失败重试', desc: '加载失败重试' }],
  typography: [
    { id: 'title', name: 'Title', desc: '标题级' },
    { id: 'text', name: 'Text', desc: '正文级' },
    { id: 'paragraph', name: 'Paragraph', desc: '段落级' },
  ],
}

const tagOf = (name: string): string[] =>
  Object.entries(componentTags).filter(([, comps]) => comps.includes(name)).map(([tag]) => tag)

export function buildIndexJson() {
  return {
    counts: { components: components.length },
    components: components.map((c) => ({
      id: c.id, name: c.name, desc: c.desc,
      family: c.family ?? null,
      variants: (VARIANTS_OF[c.id] ?? []).map((v) => ({ ...v })),
      tags: tagOf(c.name),
      sourceFile: c.sourceFile ?? null, cssFile: c.cssFile ?? null, testFile: c.testFile ?? null,
      gotchas: c.gotchas ?? [],
    })),
  }
}
