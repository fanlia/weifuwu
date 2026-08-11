/**
 * weifuwu/components — JSONViewer
 *
 * 结构化 JSON 浏览（工具调用 args / API 响应）：递归树 + 折叠 + 类型色 + 路径复制 + 懒展开。
 * 零依赖（无 raw JSON.parse 展示——VNode 渲染天然转义）。
 * 裁剪：JSON 编辑、超大对象流式渲染（懒展开覆盖 100 键级）。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
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

export const JSONViewer: Component<JSONViewerProps> = async (_init, ctx) => {
  // render-only：内部状态 let + 显式 render（闭包绑定——§4.5 selfId 错位陷阱
  // 根治：事件回调里的 ctx.ui.render() 永远渲染本组件，无 this/重挂载错位）
  let expanded = {} as Record<string, boolean>
  let copiedPath = undefined as string | undefined

  // collapsed = 当前折叠态（render 层传入）：折叠中点击 → 展开（false）；
  // 展开中点击 → 收起（true）
  const toggle = (path: string, collapsed?: boolean) => {
    expanded[path] = collapsed === undefined ? !expanded[path] : (collapsed ? false : true)
    ctx.ui.render()
  }

  // 复制：clipboard API + execCommand 降级（非 secure context 下 clipboard 不可用——
  // 无降级会静默失败，用户以为按钮无效）
  // 复制统一经 ctx.browser（clipboard + execCommand 降级）——组件不直接碰 window/document
  const copyPath = (path: string, value: unknown, onCopy?: (p: string, v: unknown) => void) => {
    if (onCopy) { onCopy(path, value); return }
    void ctx.browser?.copyText(`${path} = ${JSON.stringify(value)}`)
  }

  return (props: JSONViewerProps) => {
    const { data, defaultExpandDepth = 2, maxKeys = 100, rootName = 'root', onCopy, className } = props

    // 复制 + 反馈：DOM 级图标切换（check 1s）——不依赖渲染管线
    const copyHere = (path: string, value: unknown, e: Event) => {
      copyPath(path, value, onCopy)
      const btn = (e as any).currentTarget as HTMLElement | undefined
      const pathEl = btn?.querySelector('path')
      const oldD = pathEl?.getAttribute('d')
      if (pathEl && oldD) {
        pathEl.setAttribute('d', 'M20 6 9 17l-5-5') // check
        ctx.browser?.timeout(() => pathEl.setAttribute('d', oldD), 1000)
      }
    }

    // 顶层：键行（depth=0）
    const renderValue = (v: unknown, path: string, depth: number, key: string): any => {
      if (typeof v === 'object' && v !== null) {
        // 对象/数组节点：始终渲染（含折叠摘要或展开体）
        const isCollapsed = expanded[path] === true
          || (depth >= defaultExpandDepth && expanded[path] !== false)
        if (isCollapsed) {
          const summary = Array.isArray(v) ? `Array(${v.length})` : 'Object'
          return h('div', {
            class: 'wf-json-row wf-json-collapse',
            'data-path': path,
            role: 'button',
            tabIndex: 0,
            onClick: () => toggle(path, isCollapsed),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(path, isCollapsed) }
            },
          }, [
            h('button', {
              class: 'wf-json-toggle',
              'aria-label': '展开',
              tabIndex: -1,
              onClick: (e: Event) => { e.stopPropagation(); toggle(path, isCollapsed) },
            }, h(Icon, { name: 'chevron-right', size: 10 })),
            h('span', { class: 'wf-json-key' }, `${key}:`),
            h('span', { class: 'wf-json-summary' }, `${summary} {…}`),
            h('button', {
              class: 'wf-json-copy',
              'aria-label': `复制 ${path}`,
              tabIndex: -1,
              onClick: (e: Event) => { e.stopPropagation(); copyHere(path, v, e) },
            }, h(Icon, { name: (copiedPath === path ? 'check' : 'copy'), size: 10 })),
          ])
        }
        if (Array.isArray(v)) {
          const rows = v.map((item, i) => renderValue(item, `${path}[${i}]`, depth + 1, String(i)))
          return h('div', { class: 'wf-json-node', 'data-path': path }, [
            h('div', {
              class: 'wf-json-row wf-json-row--header',
              role: 'button',
              tabIndex: 0,
              onClick: () => toggle(path, isCollapsed),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(path, isCollapsed) }
              },
            }, [
              h('button', {
                class: 'wf-json-toggle',
                'aria-label': '收起',
                tabIndex: -1,
                onClick: (e: Event) => { e.stopPropagation(); toggle(path, isCollapsed) },
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
          h('div', {
              class: 'wf-json-row wf-json-row--header',
              role: 'button',
              tabIndex: 0,
              onClick: () => toggle(path, isCollapsed),
              onKeyDown: (e: KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(path, isCollapsed) }
              },
            }, [
            h('button', {
              class: 'wf-json-toggle',
              'aria-label': '收起',
              tabIndex: -1,
              onClick: (e: Event) => { e.stopPropagation(); toggle(path, isCollapsed) },
            }, h(Icon, { name: 'chevron-down', size: 10 })),
            h('span', { class: 'wf-json-key' }, `${key}:`),
            h('span', { class: 'wf-json-node-summary' }, `Object(${entries.length})`),
          ]),
          h('div', { class: 'wf-json-children' }, rows),
        ])
      }
      // 标量（顶层键）——补 toggle 占位（与对象/数组行的 chevron 同宽），
      // 保证同层 key 文本起始位置对齐（active: 与 model: 同一 x）
      return h('div', { class: 'wf-json-row', 'data-path': path }, [
        h('span', { class: 'wf-json-toggle-placeholder' }),
        h('span', { class: 'wf-json-key' }, `${key}:`),
        h('span', { class: `wf-json-value ${typeClass(v)}` }, formatValue(v)),
        h('button', {
          class: 'wf-json-copy',
          'aria-label': `复制 ${path}`,
          tabIndex: -1,
          onClick: (ev: Event) => copyHere(path, v, ev),
        }, h(Icon, { name: 'copy', size: 10 })),
      ])
    }

    // 根节点：初始展开（depth 0 无条件展开），手动点击可收起
    // （0 >= defaultExpandDepth 恒 false 会导致 root 永不折叠——改用 $ 手动状态）
    let root: any
    if (typeof data === 'object' && data !== null) {
      const isCollapsed = expanded[rootName] === true
      root = isCollapsed
        ? h('div', {
            class: 'wf-json-row wf-json-collapse',
            'data-path': rootName,
            role: 'button',
            tabIndex: 0,
            onClick: () => toggle(rootName, isCollapsed),
            onKeyDown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(rootName, isCollapsed) }
            },
          }, [
            h('button', { class: 'wf-json-toggle', 'aria-label': '展开', tabIndex: -1, onClick: (e: Event) => { e.stopPropagation(); toggle(rootName, isCollapsed) } }, h(Icon, { name: 'chevron-right', size: 10 })),
            h('span', { class: 'wf-json-summary' }, `Object {…}`),
          ])
        : (Array.isArray(data)
            ? h('div', { class: 'wf-json-node', 'data-path': rootName }, [
                h('div', {
                  class: 'wf-json-row wf-json-row--header',
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => toggle(rootName, isCollapsed),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(rootName, isCollapsed) }
                  },
                }, [
                  h('button', { class: 'wf-json-toggle', 'aria-label': '收起', tabIndex: -1, onClick: (e: Event) => { e.stopPropagation(); toggle(rootName, isCollapsed) } }, h(Icon, { name: 'chevron-down', size: 10 })),
                  h('span', { class: 'wf-json-node-summary' }, `Array(${data.length})`),
                ]),
                h('div', { class: 'wf-json-children' }, data.map((item, i) => renderValue(item, `${rootName}[${i}]`, 1, String(i)))),
              ])
            : h('div', { class: 'wf-json-node', 'data-path': rootName }, [
                h('div', {
                  class: 'wf-json-row wf-json-row--header',
                  role: 'button',
                  tabIndex: 0,
                  onClick: () => toggle(rootName, isCollapsed),
                  onKeyDown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(rootName, isCollapsed) }
                  },
                }, [
                  h('button', { class: 'wf-json-toggle', 'aria-label': '收起', tabIndex: -1, onClick: (e: Event) => { e.stopPropagation(); toggle(rootName, isCollapsed) } }, h(Icon, { name: 'chevron-down', size: 10 })),
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
