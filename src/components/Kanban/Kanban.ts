import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface KanbanItem {
  id: string
  title: string
  /** 可选标签色 */
  tag?: string
}

export interface KanbanColumn {
  key: string
  title: string
  items: KanbanItem[]
}

export interface KanbanMove {
  columnKey: string
  index: number
}

export interface KanbanProps {
  columns: KanbanColumn[]
  /** 受控：移动回调（from → to）。缺回调交互静默失效——受控纪律 warn */
  onMove?: (from: KanbanMove, to: KanbanMove) => void
  className?: string
}

interface DragState {
  itemId: string
  fromColumn: string
  fromIndex: number
}

/**
 * Kanban — 看板（原生 HTML5 DnD，零依赖）。
 * 卡片拖拽：dragstart 记录源 → 卡片/列 drop 触发 onMove（跨列 + 同列重排）。
 * 受控纪律：columns 受控 prop——无 onMove 时 warn（交互静默失效防护）。
 */
export const Kanban: Component<KanbanProps> = (_init, ctx) => {
  let drag: DragState | null = null
  let overCol: string | null = null // 拖拽悬停高亮
  let overItem: string | null = null

  const { dropProps } = ctx.ui.useDragDrop({
    onDragOver: () => { /* preventDefault 自动 */ },
  })

  return (props) => {
    const { columns, onMove, className = '' } = props

    // 受控纪律：columns 受控 + 无 onMove → warn（防静默不可用）
    if (!onMove) {
      console.warn('[weifuwu] Kanban: 传入了受控 columns 但缺少 onMove 回调——拖拽将静默失效')
    }

    const move = (toColumn: string, toIndex: number) => {
      if (!drag || !onMove) return
      onMove(
        { columnKey: drag.fromColumn, index: drag.fromIndex },
        { columnKey: toColumn, index: toIndex },
      )
      drag = null
      overCol = null
      overItem = null
      ctx.ui.render()
    }

    const cols = columns.map(col => {
      const colEl = h('div', {
        class: `wf-kanban-col${overCol === col.key ? ' wf-kanban-col--over' : ''}`,
        'data-col': col.key,
        ...dropProps,
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          // 列尾追加（若未落到具体卡片上）
          const targetIdx = col.items.length
          if (!(overItem && col.items.some(i => i.id === overItem))) {
            move(col.key, targetIdx)
          }
        },
      }, [
        h('div', { class: 'wf-kanban-col-header' }, [
          h('span', { class: 'wf-kanban-col-title' }, col.title),
          h('span', { class: 'wf-kanban-col-count' }, String(col.items.length)),
        ]),
        h('div', { class: 'wf-kanban-col-body' }, col.items.map((item, idx) =>
          h('div', {
            class: `wf-kanban-card${overItem === item.id ? ' wf-kanban-card--over' : ''}`,
            draggable: true,
            'data-item': item.id,
            onDragStart: (e: DragEvent) => {
              e.dataTransfer?.setData('text/plain', item.id)
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
              drag = { itemId: item.id, fromColumn: col.key, fromIndex: idx }
              overCol = col.key
              ctx.ui.render()
            },
            onDragEnd: () => {
              drag = null
              overCol = null
              overItem = null
              ctx.ui.render()
            },
            onDragEnter: () => {
              overItem = item.id
              ctx.ui.render()
            },
            onDragLeave: () => {
              if (overItem === item.id) { overItem = null; ctx.ui.render() }
            },
            onDrop: (e: DragEvent) => {
              e.preventDefault()
              e.stopPropagation()
              move(col.key, idx)
            },
          }, [
            item.tag && h('span', { class: 'wf-kanban-tag' }, item.tag),
            h('span', { class: 'wf-kanban-card-title' }, item.title),
          ].filter(Boolean)),
        )),
      ])
      return colEl
    })

    return h('div', { class: `wf-kanban${className ? ` ${className}` : ''}` }, cols)
  }
}
