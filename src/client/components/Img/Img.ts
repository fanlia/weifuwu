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

export const Img: Component<ImgProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let previewOpen = false
  let scale = 1
  let triggerEl: HTMLElement | null = null

  // 预览层经 usePopup mask 模式统一（§5.4）：全屏遮罩（--wf-overlay + 点击关闭）+
  // Escape 关闭 + portal——不再手写 createPortal/overlay/Escape（统一遮罩处理）
  const popup = ctx.ui.usePopup?.({
    trigger: 'click',
    placement: 'bottom',
    el: () => triggerEl,
    isOpen: () => previewOpen,
    setOpen: (v) => { previewOpen = v; scale = v ? scale : 1; ctx.render() },
    mask: true, // 全屏遮罩：模态预览（点击遮罩关闭，maskClosable 默认 true）
    maskCentered: true, // 图片预览居中显示（覆盖 trigger 定位）
  }) ?? {
    open: false, setOpen: () => {}, wrapProps: {},
    portal: () => null, refresh: () => {},
  }

  const triggerRef = (el: any) => { triggerEl = el as HTMLElement | null }

  return async (props) => {
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

    // 预览模式：usePopup mask 遮罩 + 图片层（点击图片缩放，stopPropagation 不触发遮罩关闭）
    const previewLayer = popup.portal(
      h('img', {
        class: 'wf-img-preview-image',
        src: src ?? fallback ?? '',
        alt,
        style: { transform: `scale(${scale * previewScale})`, maxWidth: '90vw', maxHeight: '90vh' },
        onClick: (e: Event) => { e.stopPropagation(); scale = scale === 1 ? 2 : 1; ctx.render() },
      }),
      'img-preview',
    )

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
      previewLayer,
    ].filter(Boolean))
  }
}
