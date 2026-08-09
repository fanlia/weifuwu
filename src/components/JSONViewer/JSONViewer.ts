/**
 * weifuwu/components — JSONViewer
 *
 * 结构化 JSON 浏览（工具调用 args / API 响应）：递归树 + 折叠 + 类型色 + 路径复制 + 懒展开。
 * 零依赖（无 raw JSON.parse 展示——VNode 渲染天然转义）。
 * 裁剪：JSON 编辑、超大对象流式渲染（懒展开覆盖 100 键级）。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface JSONViewerProps {
  data: unknown
  /** 默认展开深度（默认 2）——更深折叠为摘要 */
  defaultExpandDepth?: number
  /** 对象键数超过该值时懒展开（只渲染前 N 个 + "+N 项"，默认 100） */
  maxKeys?: number
  /** 根键名（默认 'root'）——复制路径前缀 */
  rootName?: string
  /** 复制路径回调（默认 navigator.clipboard 写入 JSON 路径） */
  onCopy?: (path: string, value: unknown) => void
  className?: string
}

function typeClass(v: unknown): string {
  if (v === null) return 'wf-json-null'
  if (typeof v === 'string') return 'wf-json-string'
  if (typeof v === 'number') return 'wf-json-number'
  if (typeof v === 'boolean') return 'wf-json-boolean'
  return ''
}

function formatValue(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  return String(v)
}

export const JSONViewer: Component<JSONViewerProps> = (_init, ctx) => {
  // ── mount（只一次）──
  // 手动展开状态（闭包 Map + render；path 为 key）
  const expandedSet = new Set<string>()

  const toggle = (path: string) => {
    if (expandedSet.has(path)) expandedSet.delete(path)
    else expandedSet.add(path)
    ctx.ui.render()
  }

  const copyPath = (path: string, value: unknown, onCopy?: (p: string, v: unknown) => void) => {
    if (onCopy) { onCopy(path, value); return }
    const text = `${path} = ${JSON.stringify(value)}`
    if (navigator?.clipboard?.writeText) {
      void navigator.clipboard.writeText(text)
    }
  }

  return (props: JSONViewerProps) => {
    const { data, defaultExpandDepth = 2, maxKeys = 100, rootName = 'root', onCopy, className } = props

    const renderLeaf = (v: unknown, path: string, depth: number): any => {
      // 折叠点：非标量且超深度（或手动折叠）
      const isCollapsed = depth >= defaultExpandDepth && !expandedSet.has(path)
      if (isCollapsed) {
        const summary = Array.isArray(v) ? `Array(${v.length})` : 'Object'
        return h('div', { class: 'wf-json-row wf-json-collapse', 'data-path': path }, [
          h('button', {
            class: 'wf-json-toggle',
            'aria-label': '展开',
            onClick: () => toggle(path),
          }, h(Icon, { name: 'chevron-right', size: 10 })),
          h('span', { class: 'wf-json-key' }, ''),
          h('span', { class: 'wf-json-summary' }, `${summary} {…}`),
          h('button', {
            class: 'wf-json-copy',
            'aria-label': `复制 ${path}`,
            onClick: () => copyPath(path, v, onCopy),
          }, h(Icon, { name: 'copy', size: 10 })),
        ])
      }

      if (Array.isArray(v)) {
        const rows = v.map((item, i) => renderValue(item, `${path}[${i}]`, depth + 1, String(i)))
        return h('div', { class: 'wf-json-node', 'data-path': path }, [
          h('div', { class: 'wf-json-row' }, [
            h('button', {
              class: 'wf-json-toggle',
              'aria-label': '收起',
              onClick: () => toggle(path),
            }, h(Icon, { name: 'chevron-down', size: 10 })),
            h('span', { class: 'wf-json-key' }, ''),
            h('span', { class: 'wf-json-node-summary' }, `Array(${v.length})`),
          ]),
          h('div', { class: 'wf-json-children' }, rows),
        ])
      }

      if (typeof v === 'object' && v !== null) {
        const entries = Object.entries(v as Record<string, unknown>)
        const tooMany = entries.length > maxKeys
        const shown = tooMany ? entries.slice(0, maxKeys) : entries
        const rows = shown.map(([k, val]) => renderValue(val, `${path}.${k}`, depth + 1, k))
        if (tooMany) {
          rows.push(h('div', { class: 'wf-json-more' }, `+${entries.length - maxKeys} 项（懒展开）`))
        }
        return h('div', { class: 'wf-json-node', 'data-path': path }, [
          h('div', { class: 'wf-json-row' }, [
            h('button', {
              class: 'wf-json-toggle',
              'aria-label': '收起',
              onClick: () => toggle(path),
            }, h(Icon, { name: 'chevron-down', size: 10 })),
            h('span', { class: 'wf-json-key' }, ''),
            h('span', { class: 'wf-json-node-summary' }, `Object(${entries.length})`),
          ]),
          h('div', { class: 'wf-json-children' }, rows),
        ])
      }

      // 标量
      return h('div', { class: 'wf-json-row', 'data-path': path }, [
        h('span', { class: 'wf-json-key' }, `${path.split('.').pop() ?? ''}:`),
        h('span', { class: `wf-json-value ${typeClass(v)}` }, formatValue(v)),
        h('button', {
          class: 'wf-json-copy',
          'aria-label': `复制 ${path}`,
          onClick: () => copyPath(path, v, onCopy),
        }, h(Icon, { name: 'copy', size: 10 })),
      ])
    }

    // 顶层：键行（depth=0）
    const renderValue = (v: unknown, path: string, depth: number, key: string): any => {
      if (typeof v === 'object' && v !== null) {
        // 对象/数组节点：始终渲染（含折叠摘要或展开体）
        const isCollapsed = depth >= defaultExpandDepth && !expandedSet.has(path)
        if (isCollapsed) {
          const summary = Array.isArray(v) ? `Array(${v.length})` : 'Object'
          return h('div', { class: 'wf-json-row wf-json-collapse', 'data-path': path }, [
            h('button', {
              class: 'wf-json-toggle',
              'aria-label': '展开',
              onClick: () => toggle(path),
            }, h(Icon, { name: 'chevron-right', size: 10 })),
            h('span', { class: 'wf-json-key' }, `${key}:`),
            h('span', { class: 'wf-json-summary' }, `${summary} {…}`),
            h('button', {
              class: 'wf-json-copy',
              'aria-label': `复制 ${path}`,
              onClick: () => copyPath(path, v, onCopy),
            }, h(Icon, { name: 'copy', size: 10 })),
          ])
        }
        if (Array.isArray(v)) {
          const rows = v.map((item, i) => renderValue(item, `${path}[${i}]`, depth + 1, String(i)))
          return h('div', { class: 'wf-json-node', 'data-path': path }, [
            h('div', { class: 'wf-json-row' }, [
              h('button', {
                class: 'wf-json-toggle',
                'aria-label': '收起',
                onClick: () => toggle(path),
              }, h(Icon, { name: 'chevron-down', size: 10 })),
              h('span', { class: 'wf-json-key' }, `${key}:`),
              h('span', { class: 'wf-json-node-summary' }, `Array(${v.length})`),
            ]),
            h('div', { class: 'wf-json-children' }, rows),
          ])
        }
        const entries = Object.entries(v as Record<string, unknown>)
        const tooMany = entries.length > maxKeys
        const shown = tooMany ? entries.slice(0, maxKeys) : entries
        const rows = shown.map(([k, val]) => renderValue(val, `${path}.${k}`, depth + 1, k))
        if (tooMany) {
          rows.push(h('div', { class: 'wf-json-more' }, `+${entries.length - maxKeys} 项（懒展开）`))
        }
        return h('div', { class: 'wf-json-node', 'data-path': path }, [
          h('div', { class: 'wf-json-row' }, [
            h('button', {
              class: 'wf-json-toggle',
              'aria-label': '收起',
              onClick: () => toggle(path),
            }, h(Icon, { name: 'chevron-down', size: 10 })),
            h('span', { class: 'wf-json-key' }, `${key}:`),
            h('span', { class: 'wf-json-node-summary' }, `Object(${entries.length})`),
          ]),
          h('div', { class: 'wf-json-children' }, rows),
        ])
      }
      // 标量（顶层键）
      return h('div', { class: 'wf-json-row', 'data-path': path }, [
        h('span', { class: 'wf-json-key' }, `${key}:`),
        h('span', { class: `wf-json-value ${typeClass(v)}` }, formatValue(v)),
        h('button', {
          class: 'wf-json-copy',
          'aria-label': `复制 ${path}`,
          onClick: () => copyPath(path, v, onCopy),
        }, h(Icon, { name: 'copy', size: 10 })),
      ])
    }

    // 根节点
    let root: any
    if (typeof data === 'object' && data !== null) {
      const isCollapsed = 0 >= defaultExpandDepth && !expandedSet.has(rootName)
      root = isCollapsed
        ? h('div', { class: 'wf-json-row wf-json-collapse', 'data-path': rootName }, [
            h('button', { class: 'wf-json-toggle', 'aria-label': '展开', onClick: () => toggle(rootName) }, h(Icon, { name: 'chevron-right', size: 10 })),
            h('span', { class: 'wf-json-summary' }, `Object {…}`),
          ])
        : (Array.isArray(data)
            ? h('div', { class: 'wf-json-node', 'data-path': rootName }, [
                h('div', { class: 'wf-json-row' }, [
                  h('button', { class: 'wf-json-toggle', 'aria-label': '收起', onClick: () => toggle(rootName) }, h(Icon, { name: 'chevron-down', size: 10 })),
                  h('span', { class: 'wf-json-node-summary' }, `Array(${data.length})`),
                ]),
                h('div', { class: 'wf-json-children' }, data.map((item, i) => renderValue(item, `${rootName}[${i}]`, 1, String(i)))),
              ])
            : h('div', { class: 'wf-json-node', 'data-path': rootName }, [
                h('div', { class: 'wf-json-row' }, [
                  h('button', { class: 'wf-json-toggle', 'aria-label': '收起', onClick: () => toggle(rootName) }, h(Icon, { name: 'chevron-down', size: 10 })),
                  h('span', { class: 'wf-json-key' }, `${rootName}:`),
                  h('span', { class: 'wf-json-node-summary' }, `Object(${Object.keys(data as object).length})`),
                ]),
                h('div', { class: 'wf-json-children' }, (() => {
                  const entries = Object.entries(data as Record<string, unknown>)
                  const tooMany = entries.length > maxKeys
                  const rows = (tooMany ? entries.slice(0, maxKeys) : entries).map(([k, val]) => renderValue(val, `${rootName}.${k}`, 1, k))
                  if (tooMany) rows.push(h('div', { class: 'wf-json-more' }, `+${entries.length - maxKeys} 项（懒展开）`))
                  return rows
                })()),
              ]))
    } else {
      root = h('div', { class: 'wf-json-row' }, [
        h('span', { class: `wf-json-value ${typeClass(data)}` }, formatValue(data)),
      ])
    }

    return h('div', {
      class: ['wf-json-viewer', className].filter(Boolean).join(' '),
    }, [root])
  }
}
