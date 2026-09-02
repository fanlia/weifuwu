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
  /** 加载占位（2026-09——未就绪渲染占位块；width/height 已知时布局恒定——
   * 零追滚零闪烁——聊天图片直接受益） */
  placeholder?: boolean
  /** 占位文案（加载中——默认「图片加载中…」；无 src 且失败时业务侧也可直接传失败文案） */
  placeholderText?: string
  /** 加载失败文案（有 src 但解码/请求失败——默认「图片加载失败」） */
  errorText?: string
}

export const Img: Component<ImgProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let previewOpen = false
  let scale = 1
  let triggerEl: HTMLElement | null = null
  // 加载状态（2026-09）：src 变化重置——placeholder 模式下的占位/失败展示
  let lastSrc = ''
  let loaded = false
  let failed = false

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
      alt = '', fallback, loading, width, height, className, style,
      preview, previewScale = 1,
      placeholder, placeholderText, errorText,
    } = props
    const src = props.src ?? ''

    // 受控重载：src 变化 → 状态重置（组件实例复用场景——切换图片）
    if (src !== lastSrc) { lastSrc = src; loaded = false; failed = false }

    const phCls = ['wf-image-placeholder', className].filter(Boolean).join(' ')
    const phText = placeholderText ?? '图片加载中…'
    const errText = errorText ?? '图片加载失败'

    /** 占位块（未就绪/失败——与最终 img 同尺寸（width/height 已知）——布局恒定） */
    const placeholderVNode = () => h('div', {
      class: phCls,
      style: { width: width as any, height: height as any, ...(style ?? {}) },
    }, [
      h('span', { class: 'wf-image-placeholder-text' },
        (src && failed) ? errText : phText),
    ])

    /** img（加载完成）——onLoad/onError 驱动状态翻转 → 占位/图片替换 */
    const imgVNode = (withPreview: boolean) => {
      const imgProps: Record<string, any> = {
        class: ['wf-image', className].filter(Boolean).join(' '),
        src: src ?? fallback ?? '',
        alt,
        loading: loading ?? 'lazy',
        onLoad: () => { if (!loaded) { loaded = true; failed = false; ctx.render() } },
        onError: (e: Event) => {
          const el = e.currentTarget as HTMLImageElement
          // fallback 语义（保留）：src 失败换 fallback（一次性——DOM 换 src）
          if (fallback && el.src !== fallback) { el.src = fallback; return }
          if (placeholder && !failed) { failed = true; ctx.render() }
        },
      }
      if (width !== undefined) imgProps.width = width
      if (height !== undefined) imgProps.height = height
      if (style) imgProps.style = style
      return imgProps
    }

    // placeholder 模式：占位 → 图（onLoad 后替换——布局恒定）——占位块也可用于
    // 无 src（业务先行挂载占位——fetch 完成后补 src——聊天流占位先行场景）
    if (placeholder && (!src || !loaded || failed)) {
      // **隐藏预载 img**：占位只显示 div——img 必须存在才会触发 onLoad/onError
      // （不渲染 img 则永远占位——死锁——实测 2026-09）
      const preload = src && !loaded
        ? h('img', { src, style: { display: 'none', width: 0, height: 0 },
            onLoad: () => { loaded = true; failed = false; ctx.render() },
            onError: () => { failed = true; ctx.render() } })
        : null
      return h('div', { style: { display: 'contents' } }, [placeholderVNode(), preload])
    }

    if (!preview) return h('img', imgVNode(false))

    // 预览模式：openPopup mask 遮罩 + 图片层（点击图片缩放，stopPropagation 不触发遮罩关闭）
    const previewLayer = h('img', {
      class: 'wf-img-preview-image',
      src,
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
      }, h('img', imgVNode(true))),
    ])
  }
}
