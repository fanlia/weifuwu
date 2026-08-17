/**
 * SortableList — 拖拽排序列表（useDragDrop 原语 + keyed 复用）
 *
 * 用法：
 *   <SortableList items={items} keyField="id" renderItem={it => <span>{it.name}</span>}
 *     onReorder={newItems => setItems(newItems)} />
 *
 * 纪律：受控 items + 缺 onReorder → warn（防静默失效）；keyField 必须业务唯一
 */
import type { Component } from '../../ui-dom/vnode.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface SortableListProps<T extends Record<string, any>> {
  items: T[]
  /** 业务唯一 key 字段（身份跟随内容——keyed diff 正确性） */
  keyField: string
  /** 拖拽完成回调（新顺序）——受控，缺回调 = 静默失效 */
  onReorder?: (items: T[]) => void
  /** 渲染单项（拖拽柄由 dragProps 提供——见 demo） */
  renderItem: (item: T, index: number, dragProps: Record<string, any>) => any
  /** 拖拽中样式类（可选——悬停指示） */
  draggingClass?: string
  className?: string
}

export const SortableList: Component<SortableListProps<any>> = async (_init, ctx) => {
  let dragIndex: number | null = null
  let overIndex: number | null = null

  const { dragProps } = ctx.ui.useDragDrop({
    onDragEnd: () => {
      if (dragIndex != null && overIndex != null && dragIndex !== overIndex) {
        // 重排：把 dragIndex 项移到 overIndex 位置
        const items = [...propsRef.items]
        const [moved] = items.splice(dragIndex, 1)
        items.splice(overIndex, 0, moved)
        propsRef.onReorder?.(items)
      }
      dragIndex = null
      overIndex = null
      ctx.ui.render()
    },
  })

  // 渲染期 props 引用（事件回调读最新——render-only 纪律）
  const propsRef: { items: any[]; onReorder?: (i: any[]) => void } = { items: [], onReorder: undefined }

  return async (props) => {
    propsRef.items = props.items
    propsRef.onReorder = props.onReorder
    const { items, keyField, renderItem, draggingClass = 'wf-sortable-dragging', className = '' } = props

    if (!props.onReorder) {
      console.warn('[weifuwu] SortableList: 传入了受控 items 但缺少 onReorder 回调——拖拽将静默失效')
    }

    return h('div', { class: `wf-sortable wf-stack wf-gap-xs${className ? ` ${className}` : ''}` },
      items.map((item, i) => {
        const itemDragProps: Record<string, any> = {
          ...dragProps,
          'data-wf-key': String(item[keyField] ?? i),
          onDragStart: (e: DragEvent) => {
            dragIndex = i
            e.dataTransfer?.setData('text/plain', String(item[keyField] ?? i))
            e.dataTransfer!.effectAllowed = 'move'
            ctx.ui.render()
          },
          onDragOver: (e: DragEvent) => {
            e.preventDefault()
            if (overIndex !== i) {
              overIndex = i
              ctx.ui.render()
            }
          },
          onDragLeave: () => {
            // 悬停指示由 onDragOver 维护——离开不立即清除（避免抖动）
          },
        }
        const cls = `wf-sortable-item${dragIndex === i ? ` ${draggingClass}` : ''}${overIndex === i && dragIndex !== i ? ' wf-sortable-over' : ''}`
        return h('div', { key: String(item[keyField] ?? i), class: cls, ...itemDragProps }, renderItem(item, i, itemDragProps))
      }))
  }
}
