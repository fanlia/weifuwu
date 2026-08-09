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

  // 内置 DnD 原语：drop 侧（列 drop zone）+ drag 侧基础（draggable/onDragEnd）
  const { dropProps, dragProps } = ctx.ui.useDragDrop({
    onDragOver: () => { /* preventDefault 自动 */ },
    onDragEnd: () => {
      drag = null
      ctx.ui.render()
    },
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
      ctx.ui.render()
    }

    const cols = columns.map(col => {
      const colEl = h('div', {
        class: 'wf-kanban-col',
        'data-col': col.key,
        ...dropProps,
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          move(col.key, col.items.length)
        },
      }, [
        h('div', { class: 'wf-kanban-col-header' }, [
          h('span', { class: 'wf-kanban-col-title' }, col.title),
          h('span', { class: 'wf-kanban-col-count' }, String(col.items.length)),
        ]),
        h('div', { class: 'wf-kanban-col-body' }, col.items.map((item, idx) =>
          h('div', {
            class: 'wf-kanban-card',
            'data-item': item.id,
            // 内置 drag 侧基础（draggable + onDragEnd 清理）
            draggable: dragProps.draggable,
            onDragEnd: dragProps.onDragEnd,
            // 身份绑定在渲染期闭包（dragstart 用 dataTransfer + 闭包位置——
            // 拖拽进行中不渲染，位置信息必须 mount 时捕获）
            onDragStart: (e: DragEvent) => {
              e.dataTransfer?.setData('text/plain', item.id)
              if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
              drag = { itemId: item.id, fromColumn: col.key, fromIndex: idx }
            },
            // 卡片级 dragover 允许 drop（列 dropProps 只覆盖列容器）
            onDragOver: (e: DragEvent) => e.preventDefault(),
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
