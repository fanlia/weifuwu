/**
 * weifuwu/components — Img
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'

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

  const close = () => {
    if (previewOpen) {
      previewOpen = false
      scale = 1
      ctx.ui.render()
    }
  }

  // Escape：经 ctx.ui.useGlobalKey（window keydown：mount 注册 + 卸载自动清理）——
  // 预览层经 portal 挂到独立容器，wrap 的 onKeyDown 收不到 overlay 内 keydown
  // （不同 DOM 子树，冒泡断裂），需全局级监听。
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && previewOpen) close()
  })

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

    // 预览模式：触发按钮 + 全屏预览层
    const previewLayer = previewOpen ? createPortal(
      h('div', {
        class: 'wf-img-preview-overlay',
        onClick: (e: Event) => { if (e.target === e.currentTarget) close() },
      }, h('img', {
        class: 'wf-img-preview-image',
        src: src ?? fallback ?? '',
        alt,
        style: { transform: `scale(${scale * previewScale})`, maxWidth: '90vw', maxHeight: '90vh' },
        onClick: (e: Event) => { e.stopPropagation(); scale = scale === 1 ? 2 : 1; ctx.ui.render() },
      })),
      'popover',
    ) : null

    return h('div', {
      class: 'wf-img-preview-wrap',
    }, [
      h('button', {
        type: 'button',
        class: 'wf-img-preview-trigger',
        'aria-label': '放大预览',
        onClick: () => { previewOpen = true; ctx.ui.render() },
      }, h('img', imgProps)),
      previewLayer,
    ].filter(Boolean))
  }
}
