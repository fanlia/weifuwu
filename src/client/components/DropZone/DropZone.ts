/**
 * weifuwu/components — DropZone 全区域拖放区
 *
 * 整容器拖放目标：文件拖入指定区域任意位置（含悬停子元素）即高亮 + drop 回调
 * ——「现代 IM 标配」手搓实证 agent-platform Chat
 * （apps/agent-platform/ui/pages/Chat.tsx:749-790——dragenter/leave 深度计数 +
 * outline 高亮 + drop→addFiles）。
 *
 * 与 FileUpload 区分：FileUpload = 上传框组件（选择/列表/进度整体形态）；
 * DropZone = 任意内容的**拖放容器**（消息区/看板列/画布——内容自持）。
 *
 * 纪律：
 * - 零渲染高亮：dragenter/leave 回调直接 el.style.outline（不触发渲染周期——
 *   手搓实证纪律——拖拽高频不扰渲染管线）
 * - 深度计数（dragenter/leave 配对）——子元素边界穿越不闪烁（手搓 dragDepth 实证）
 * - 非文件拖入忽略（files 空不回调）；disabled 全路径拦截
 * - 事件经 useDragDrop 原语（dragover preventDefault 允许放置——vdom 事件表通道）
 */
import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface DropZoneProps {
  /** 拖放文件回调（file 数组——调用方负责后续链——与按钮链共享） */
  onFiles?: (files: File[]) => void
  disabled?: boolean
  className?: string
  children?: any
}

export const DropZone: Component<DropZoneProps> = (_init, ctx: UIContext) => {
  // ── mount（只一次）：ref 稳定（防 ref-diff churn——Watermark 纪律）──
  let rootEl: HTMLElement | null = null
  const propsRef: DropZoneProps = {}
  /** 深度计数（dragenter/leave 配对——子元素穿越不闪烁） */
  const depth = { n: 0 }

  const highlight = (on: boolean) => {
    if (rootEl) rootEl.style.outline = on ? '2px dashed var(--wf-color-primary)' : ''
  }

  const { dropProps } = ctx.ui.useDragDrop({
    onDragEnter: (e) => {
      if (propsRef.disabled) return
      e.preventDefault()
      depth.n++
      if (depth.n === 1) highlight(true)
    },
    onDragLeave: () => {
      if (propsRef.disabled) return
      depth.n = Math.max(0, depth.n - 1)
      if (depth.n === 0) highlight(false)
    },
    onDrop: (e) => {
      if (propsRef.disabled) return
      depth.n = 0
      highlight(false)
      const files = Array.from(e.dataTransfer?.files ?? [])
      if (files.length > 0) propsRef.onFiles?.(files)
    },
  })

  const rootRef = (node: HTMLElement | null) => { rootEl = node }

  return (props) => {
    Object.assign(propsRef, props)
    return h('div', {
      class: ['wf-drop-zone', props.disabled ? 'wf-drop-zone--disabled' : '', props.className ?? ''].filter(Boolean).join(' '),
      ref: rootRef,
      ...dropProps,
    }, props.children)
  }
}
