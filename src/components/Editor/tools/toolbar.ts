/**
 * weifuwu/components/Editor/tools — 工具栏渲染
 */

import type { VNode } from '../../../ui-dom/vnode.ts'
import { h } from '../../../ui-dom/vnode.ts'
import type { FormatState, ToolbarItem } from './types.ts'

// ── 默认工具栏配置 ────────────────────────────────────

export const DEFAULT_TOOLBAR: ToolbarItem[] = [
  'bold', 'italic', 'underline',
  'h1', 'h2', 'h3',
  'ul', 'ol',
  'blockquote',
  'alignLeft', 'alignCenter', 'alignRight',
  'hr',
  'image',
  'table',
  'link', 'clear',
  'source',
]

export const TOOLBAR_LABELS: Record<ToolbarItem, string> = {
  bold: 'B', italic: 'I', underline: 'U',
  h1: 'H1', h2: 'H2', h3: 'H3',
  ul: '□', ol: '1.',
  blockquote: '❝',
  alignLeft: '⇤', alignCenter: '⇔', alignRight: '⇥',
  hr: '—',
  image: '🖼',
  table: '⊞',
  link: '🔗', clear: '✕',
  source: '</>',
}

export const TOOLBAR_TITLES: Record<ToolbarItem, string> = {
  bold: '加粗 (Ctrl+B)',
  italic: '斜体 (Ctrl+I)',
  underline: '下划线 (Ctrl+U)',
  h1: '标题 1', h2: '标题 2', h3: '标题 3',
  ul: '无序列表', ol: '有序列表',
  blockquote: '引用',
  alignLeft: '左对齐', alignCenter: '居中', alignRight: '右对齐',
  hr: '分割线',
  image: '插入图片',
  table: '插入表格',
  link: '插入链接', clear: '清除格式',
  source: '源码',
}

// ── 分隔符分组 ────────────────────────────────────────

const GRP_FORMAT = ['bold', 'italic', 'underline']
const GRP_HEADING = ['h1', 'h2', 'h3']
const GRP_LIST = ['ul', 'ol']
const GRP_BLOCK = ['blockquote', 'alignLeft', 'alignCenter', 'alignRight', 'hr']
const GRP_INSERT = ['image', 'table', 'link', 'clear']

function needsSeparator(prev: ToolbarItem, item: ToolbarItem): boolean {
  return (
    (GRP_FORMAT.includes(prev) && GRP_HEADING.includes(item)) ||
    (GRP_HEADING.includes(prev) && GRP_LIST.includes(item)) ||
    (GRP_LIST.includes(prev) && GRP_BLOCK.includes(item)) ||
    (GRP_BLOCK.includes(prev) && GRP_INSERT.includes(item)) ||
    (['link', 'clear'].includes(prev) && item === 'source')
  )
}

// ── 渲染工具栏 ────────────────────────────────────────

export function renderToolbar(
  items: ToolbarItem[],
  active: FormatState,
  isSource: boolean,
  onItem: (item: ToolbarItem, anchor?: HTMLElement | null) => void,
  customRender?: Record<string, (item: ToolbarItem) => VNode>,
  extra?: VNode[],
): VNode {
  const buttons = items.map(item => {
    if (customRender?.[item]) return customRender[item](item)

    const isActive = item === 'source' ? isSource : !!active[item]
    const isLink = item === 'link'
    const cls = [
      'wf-editor-tb-btn',
      isActive && 'wf-editor-tb-btn--active',
      isLink && 'wf-editor-tb-btn--link',
    ].filter(Boolean).join(' ')

    return h('button', {
      key: item,
      class: cls,
      type: 'button',
      title: TOOLBAR_TITLES[item],
      'aria-label': TOOLBAR_TITLES[item],
      'data-item': item,
      onClick: (e: MouseEvent) => onItem(item, e.currentTarget as HTMLElement | null),
    }, TOOLBAR_LABELS[item])
  })

  const withSeparators: any[] = []
  items.forEach((item, i) => {
    if (i > 0 && needsSeparator(items[i - 1], item)) {
      withSeparators.push(h('span', { class: 'wf-editor-tb-sep', key: `sep-${i}` }))
    }
    withSeparators.push(buttons[i])
  })

  return h('div', { class: 'wf-editor-toolbar', role: 'toolbar', 'aria-label': '编辑格式' }, [...withSeparators, ...(extra ?? [])])
}
