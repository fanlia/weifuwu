/**
 * weifuwu/components — Img
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface ImgProps {
  src?: string
  alt?: string
  fallback?: string
  loading?: 'lazy' | 'eager'
  width?: number | string
  height?: number | string
  className?: string
  style?: Record<string, string>
  /** 点击放大预览（对应 antd/EP Image preview） */
  preview?: boolean
  /** 预览缩放倍率，默认 1 */
  previewScale?: number
}

export const Img: Component<ImgProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let previewOpen = false
  let scale = 1
  let triggerEl: HTMLElement | null = null

  // 预览层经命令式弹窗 mask 模式统一（§5.4——唯一形态 openPopup）：全屏遮罩
  // （--wf-overlay + 点击关闭）+ Escape 关闭——不再手写 createPortal/overlay/Escape
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncPreview = (previewLayer: import('../../vdom/index.ts').VNode | null): void => {
    if (previewOpen && !handle)
      handle = ctx.ui.openPopup({
        key: 'img-preview',
        mask: true, // 全屏遮罩：模态预览（点击遮罩关闭，maskClosable 默认 true）
        maskCentered: true, // 图片预览居中显示
        content: () => previewLayer,
        onClose: () => { handle = null; if (previewOpen) { previewOpen = false; scale = 1; ctx.render() } },
      })
    else if (!previewOpen && handle) { handle.close(); handle = null }
    else if (handle) handle.update(previewLayer)
  }

  const triggerRef = (el: any) => { triggerEl = el as HTMLElement | null }

  return (props) => {
    const {
      src, alt = '', fallback, loading, width, height, className, style,
      preview, previewScale = 1,
    } = props

    const imgProps: Record<string, any> = {
      class: ['wf-image', className].filter(Boolean).join(' '),
      src: src ?? fallback ?? '',
      alt,
      loading: loading ?? 'lazy',
    }

    if (width !== undefined) imgProps.width = width
    if (height !== undefined) imgProps.height = height
    if (style) imgProps.style = style

    if (fallback) {
      imgProps.onError = (e: Event) => {
        const el = e.currentTarget as HTMLImageElement
        if (el.src !== fallback) el.src = fallback
      }
    }

    if (!preview) return h('img', imgProps)

    // 预览模式：openPopup mask 遮罩 + 图片层（点击图片缩放，stopPropagation 不触发遮罩关闭）
    const previewLayer = h('img', {
      class: 'wf-img-preview-image',
      src: src ?? fallback ?? '',
      alt,
      style: { transform: `scale(${scale * previewScale})`, maxWidth: '90vw', maxHeight: '90vh' },
      onClick: (e: Event) => { e.stopPropagation(); scale = scale === 1 ? 2 : 1; ctx.render() },
    })
    syncPreview(previewLayer)

    return h('div', {
      class: 'wf-img-preview-wrap',
    }, [
      h('button', {
        type: 'button',
        class: 'wf-img-preview-trigger',
        'aria-label': '放大预览',
        ref: triggerRef,
        onClick: () => { previewOpen = true; ctx.render() },
      }, h('img', imgProps)),
    ])
  }
}
