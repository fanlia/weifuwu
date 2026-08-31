/**
 * ImageCropper — 图片裁剪（canvas 原生 API + 拖拽裁剪框，零依赖）
 *
 * 用法：<ImageCropper src={url} aspect={1} onCrop={dataUrl => ...} />
 * 实现：图片绘制到 canvas → 裁剪框（pointer 事件拖动/右下柄等比缩放）→
 * onCrop 输出 dataURL。
 * 纪律：canvas 浏览器 API 经 ctx.browser（SSR 无害——null 检查）；
 * 拖拽重绘直调 draw()（canvas 内部状态——非渲染路径，不走 ctx.render——
 * 避免 vdom 全量 diff——2027-09 死交互实证修复：dragging/move/resize
 * 曾为死代码——注释声称拖拽但从未接线）。
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'

export interface ImageCropperProps {
  src: string
  /** 裁剪比例（宽/高——默认 1） */
  aspect?: number
  onCrop?: (dataUrl: string) => void
  onError?: (err: Error) => void
  className?: string
}

export const ImageCropper: Component<ImageCropperProps> = (_init, ctx) => {
  let canvasEl: HTMLCanvasElement | null = null
  let img: HTMLImageElement | null = null
  let box = { x: 0, y: 0, w: 100, h: 100 } // 裁剪框（相对显示区）
  let viewW = 320
  let viewH = 240
  let dragging: 'move' | 'se' | null = null
  let last = { x: 0, y: 0 } // 上一 pointer 位置（逻辑坐标）

  const loadImage = () => {
    const browser = ctx.browser ?? createClientBrowser()
    const image = browser.createElement('img') as HTMLImageElement
    image.onload = () => {
      img = image
      // 初始裁剪框（居中 80%）
      viewW = Math.min(image.naturalWidth, 480)
      viewH = viewW / (ctx2.aspect)
      box = { x: viewW * 0.1, y: viewH * 0.1, w: viewW * 0.8, h: viewH * 0.8 }
      draw()
      ctx.render()
    }
    image.onerror = () => ctx2.onError?.(new Error('图片加载失败'))
    image.src = ctx2.src
  }
  const ctx2: any = { aspect: 1, src: '', onError: undefined }

  const draw = () => {
    if (!canvasEl || !img) return
    const c = canvasEl
    const g = c.getContext('2d')
    if (!g) return
    c.width = viewW
    c.height = viewH
    g.drawImage(img, 0, 0, viewW, viewH)
    // 裁剪框：暗化外部 + 边框
    g.fillStyle = 'rgba(0,0,0,0.45)'
    g.fillRect(0, 0, viewW, viewH)
    g.clearRect(box.x, box.y, box.w, box.h)
    g.strokeStyle = '#fff'
    g.lineWidth = 2
    g.strokeRect(box.x, box.y, box.w, box.h)
    // 角柄
    g.fillStyle = '#fff'
    g.fillRect(box.x + box.w - 6, box.y + box.h - 6, 12, 12)
  }

  const crop = () => {
    if (!canvasEl || !img) return
    const g = canvasEl.getContext('2d')
    if (!g) return
    const out = (ctx.browser ?? createClientBrowser()).createElement('canvas') as HTMLCanvasElement
    out.width = box.w * 2
    out.height = box.h * 2
    const og = out.getContext('2d')
    if (!og) return
    og.drawImage(img, box.x / viewW * img.naturalWidth, box.y / viewH * img.naturalHeight,
      box.w / viewW * img.naturalWidth, box.h / viewH * img.naturalHeight, 0, 0, out.width, out.height)
    ctx2.onCrop?.(out.toDataURL('image/png'))
  }

  return (props) => {
    ctx2.aspect = props.aspect ?? 1
    ctx2.src = props.src
    ctx2.onError = props.onError
    const { onCrop, className = '' } = props
    // **最新回调写入 ctx2（2027-XX 实证修复）**：crop() 闭包走 ctx2.onCrop——
    // 原 onCrop 只解构为局部变量从未写入 ctx2——裁剪按钮点击 onCrop 永不触发（onError 有赋值 onCrop 断链）
    ctx2.onCrop = onCrop

    const move = (dx: number, dy: number) => {
      box.x = Math.max(0, Math.min(viewW - box.w, box.x + dx))
      box.y = Math.max(0, Math.min(viewH - box.h, box.y + dy))
      draw()
    }
    const resize = (dx: number, dy: number) => {
      box.w = Math.max(30, Math.min(viewW - box.x, box.w + dx))
      box.h = box.w / ctx2.aspect
      draw()
    }

    // 拖拽接线（2027-09 死交互修复）：pointerdown 命中判定（框内 = move /
    // 右下柄 = se）→ setPointerCapture 拖出 canvas 仍持续 → move/resize + draw。
    // 坐标映射：canvas 有 maxWidth:100% 缩放——逻辑坐标 = (client - rect) × (逻辑/显示)。
    const pointerPos = (e: PointerEvent) => {
      const r = canvasEl!.getBoundingClientRect()
      return { x: (e.clientX - r.left) * (canvasEl!.width / r.width), y: (e.clientY - r.top) * (canvasEl!.height / r.height) }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!canvasEl) return
      const p = pointerPos(e)
      const handleHit = p.x >= box.x + box.w - 8 && p.y >= box.y + box.h - 8
      const inBox = p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h
      if (!handleHit && !inBox) return
      dragging = handleHit ? 'se' : 'move'
      last = p
      canvasEl.setPointerCapture(e.pointerId)
      canvasEl.style.cursor = handleHit ? 'nwse-resize' : 'move'
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !canvasEl) return
      const p = pointerPos(e)
      if (dragging === 'move') move(p.x - last.x, p.y - last.y)
      else resize(p.x - last.x, p.y - last.y)
      last = p
    }
    const onPointerUp = () => {
      dragging = null
      if (canvasEl) canvasEl.style.cursor = 'crosshair'
    }

    const wrapRef = (el: HTMLElement | null) => {
      if (el && !canvasEl) {
        canvasEl = el.querySelector('canvas')
        loadImage()
      }
    }

    return h('div', { class: `wf-imagecropper wf-stack wf-gap-sm${className ? ` ${className}` : ''}` }, [
      h('div', { ref: wrapRef, style: { position: 'relative', display: 'inline-block', cursor: 'crosshair' } }, [
        h('canvas', { width: 320, height: 240, style: { maxWidth: '100%', borderRadius: 'var(--wf-radius-sm)', display: 'block' },
          onPointerDown, onPointerMove, onPointerUp }),
      ]),
      h('div', { class: 'wf-row wf-gap-xs' },
        h('button', { type: 'button', class: 'wf-btn wf-btn--sm wf-btn--primary', disabled: !img,
          onClick: () => crop() }, '裁剪'),
        h('button', { type: 'button', class: 'wf-btn wf-btn--sm', disabled: !img,
          onClick: () => { box = { x: viewW * 0.1, y: viewH * 0.1, w: viewW * 0.8, h: viewH * 0.8 }; draw(); ctx.render() } }, '重置'),
      ),
    ])
  }
}
