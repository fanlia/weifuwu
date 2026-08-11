/**
 * weifuwu/ui-dom 弹层/滚动位置跟踪系统（实例化——serve 每实例一个）
 *
 * 复制自 client/app.ts 闭包逻辑（createUi 依赖）：scroll/resize 时重算弹层
 * fixed 坐标（rAF 节流）+ 滚动位置跟踪。createApp 与 uiServe 各自持有实例。
 */

import { clampToViewport } from './popup.ts'
import { createClientBrowser } from './browser.ts'
import type { PopupPosition } from './types.ts'
const browser = createClientBrowser()

export interface PopupTrackerEntry {
  pos: PopupPosition
  getEl: () => HTMLElement | null
  isOpen: () => boolean
  compute: (rect: DOMRect) => { top: number; left: number; width?: number }
  panel?: () => HTMLElement | null
  margin: number
}

export interface ScrollTrackerEntry {
  handle: { y: number }
  getScroller: () => HTMLElement | Window
}

export interface PopupTrackerSystem {
  popupTrackers: Map<string, PopupTrackerEntry>
  scrollTrackers: Map<string, ScrollTrackerEntry>
  schedulePopupRecompute: () => void
  ensurePopupListeners: () => void
  destroyPopupListeners: () => void
  cleanupTrackers: (id: string) => void
  destroy: () => void
}

/** 创建跟踪系统实例（renderByIds 用于滚动/resize 后精准刷新目标组件） */
export function createPopupTrackerSystem(renderByIds: (ids: string[]) => void): PopupTrackerSystem {
  const popupTrackers = new Map<string, PopupTrackerEntry>()
  const scrollTrackers = new Map<string, ScrollTrackerEntry>()
  let popupListenersReady = false
  let popupRaf = 0

  function schedulePopupRecompute() {
    if (popupRaf) return
    popupRaf = requestAnimationFrame(() => {
      popupRaf = 0
      const ids: string[] = []
      for (const [id, t] of popupTrackers) {
        if (!t.isOpen()) continue
        const el = t.getEl()
        if (!el) continue
        const r = el.getBoundingClientRect()
        // 0 rect 防护：元素替换中/未布局时跳过刷新（弹层飞到左上角 bug）
        if (r.width === 0 && r.height === 0) continue
        const p = t.compute(r)
        Object.assign(t.pos, clampToViewport(p, t.panel?.(), t.margin))
        ids.push(id)
      }
      for (const [id, st] of scrollTrackers) {
        const scroller = st.getScroller()
        const y = scroller instanceof Window
          ? (browser.scrollingElement()?.scrollTop ?? browser.scrollTop())
          : (scroller as HTMLElement).scrollTop ?? 0
        if (y !== st.handle.y) {
          st.handle.y = y
          ids.push(id)
        }
      }
      if (ids.length > 0) renderByIds(ids)
    })
  }

  /** 惰性挂载全局 scroll/resize 监听（幂等） */
  function ensurePopupListeners() {
    if (popupListenersReady) return
    popupListenersReady = true
    // capture 捕获所有嵌套容器的 scroll（scroll 不冒泡）
    browser.addEventListener('scroll', schedulePopupRecompute, { capture: true, passive: true })
    browser.addEventListener('resize', schedulePopupRecompute)
  }

  function destroyPopupListeners() {
    if (popupListenersReady) {
      browser.removeEventListener('scroll', schedulePopupRecompute, { capture: true })
      browser.removeEventListener('resize', schedulePopupRecompute)
      popupListenersReady = false
    }
  }

  /** 卸载组件时清理其跟踪条目（卸载钩子调用） */
  function cleanupTrackers(id: string) {
    for (const key of [...popupTrackers.keys()]) {
      if (key.startsWith(`popup:${id}:`) || key === `popup:${id}` || key === id) popupTrackers.delete(key)
    }
    scrollTrackers.delete(id)
  }

  function destroy() {
    destroyPopupListeners()
    if (popupRaf) { cancelAnimationFrame(popupRaf); popupRaf = 0 }
    popupTrackers.clear()
    scrollTrackers.clear()
  }

  return {
    popupTrackers,
    scrollTrackers,
    schedulePopupRecompute,
    ensurePopupListeners,
    destroyPopupListeners,
    cleanupTrackers,
    destroy,
  }
}
