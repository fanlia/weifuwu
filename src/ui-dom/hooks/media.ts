/**
 * hooks/media — 响应式媒体/视口 hooks
 *
 * useMedia / useBreakpoint / useVisualViewport / useInView / useScrollPosition
 */

import type { HookEnv } from './types.ts'
import type {
  UseInViewOptions,
  UseInViewHandle,
  UseScrollPositionOptions,
  UseScrollPositionHandle,
  VisualViewportHandle,
} from '../types.ts'

/** 响应式媒体查询：注册监听，值变化时自动 dirty。callback 立即执行一次当前值。 */
export function useMedia(env: HookEnv, query: string, callback: (matches: boolean) => void): void {
  const selfId = env.selfId()
  const b = env.browser
  const key = `media:${selfId}:${query}`
  if (!env.mediaRegistry.has(key)) {
    const mql = b.matchMedia(query) as MediaQueryList
    callback(mql.matches)
    const handler = (e: MediaQueryListEvent) => callback(e.matches)
    mql.addEventListener('change', handler)
    env.mediaRegistry.set(key, { mql, handler })
    // 卸载清理 mql 监听（组件销毁后 media 变化不再回调已卸载组件——
    // 无此清理则重复 mount/unmount 累积监听）
    const unsub = env.onUnmount((id) => {
      if (id !== selfId) return
      const item = env.mediaRegistry.get(key)
      if (item?.mql && item.handler) {
        try { (item.mql as any).removeEventListener('change', item.handler) } catch (e) { /* 清理尽力而为 */ }
      }
      env.mediaRegistry.delete(key)
      unsub()
    })
  }
}

/** 响应式断点：注册命名断点监听，值变化时自动 dirty */
export function useBreakpoint(
  env: HookEnv,
  bpsOrCallback: Record<string, string> | ((vp: string) => void),
  callback?: (vp: string) => void,
): void {
  const b = env.browser
  const bps: Record<string, string> =
    typeof bpsOrCallback === 'function'
      ? { mobile: '(max-width: 639px)', tablet: '(min-width: 640px) and (max-width: 1023px)', desktop: '(min-width: 1024px)' }
      : bpsOrCallback
  const cb = typeof bpsOrCallback === 'function' ? bpsOrCallback : callback!
  const selfId = env.selfId()
  const key = `bp:${selfId}`

  function evaluate(): string {
    for (const [name, query] of Object.entries(bps)) {
      if ((b.matchMedia(query) as MediaQueryList).matches) return name
    }
    return Object.keys(bps)[0] ?? ''
  }

  if (!env.mediaRegistry.has(key)) {
    cb(evaluate())
    const mqls: Array<{ mql: MediaQueryList; handler: () => void }> = []
    for (const query of Object.values(bps)) {
      const mql = b.matchMedia(query) as MediaQueryList
      const handler = () => cb(evaluate())
      mql.addEventListener('change', handler)
      mqls.push({ mql, handler })
    }
    env.mediaRegistry.set(key, { mqls })
    // 卸载清理 mql 监听（同 useMedia）
    const unsub = env.onUnmount((id) => {
      if (id !== selfId) return
      const item = env.mediaRegistry.get(key)
      if (item?.mqls) {
        for (const m of item.mqls) {
          try { (m.mql as any).removeEventListener('change', m.handler) } catch (e) { /* 清理尽力而为 */ }
        }
      }
      env.mediaRegistry.delete(key)
      unsub()
    })
  }
}

/** 可视视口跟踪（visualViewport）：键盘弹起/缩放时自动更新 + dirty */
export function useVisualViewport(env: HookEnv): VisualViewportHandle {
  const selfId = env.selfId()
  const b = env.browser
  const handle: VisualViewportHandle = {
    height: b.viewportHeight(),
    offsetTop: 0,
    keyboardOpen: false,
  }
  const dirty = () => {
    if (selfId) env.render([selfId])
    else env.render()
  }
  const update = () => {
    const vv = b.visualViewport()
    handle.height = vv?.height ?? b.viewportHeight()
    handle.offsetTop = vv?.offsetTop ?? 0
    handle.keyboardOpen = handle.height < b.viewportHeight() * 0.9
    dirty()
  }
  const vv = b.visualViewport()
  if (vv?.addEventListener) {
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
  } else {
    b.addEventListener('resize', update)
  }
  if (selfId) {
    const unsub = env.onUnmount((id) => {
      if (id !== selfId) return
      if (vv?.removeEventListener) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      } else {
        b.removeEventListener('resize', update)
      }
      unsub()
    })
  }
  return handle
}

/** 可见性观察（IntersectionObserver 封装）：isIn 响应式——变化自动 dirty 当前组件 */
export function useInView(env: HookEnv, options: UseInViewOptions): UseInViewHandle {
  const selfId = env.selfId()
  const handle: UseInViewHandle = {
    isIn: false,
    ready: false,
    observe,
    refresh,
    disconnect,
  }

  let el: HTMLElement | null = null
  let io: IntersectionObserver | null = null

  const dirty = () => {
    if (selfId) env.render([selfId])
    else env.render()
  }

  function createIO() {
    io?.disconnect()
    io = null
    if (!el) return
    const rm = typeof options.rootMargin === 'function' ? options.rootMargin() : options.rootMargin
    const th = typeof options.threshold === 'function' ? options.threshold() : options.threshold
    io = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      const next = entry.isIntersecting
      const changed = next !== handle.isIn
      const wasFirst = !handle.ready
      handle.isIn = next
      handle.ready = true
      options.onChange?.(entry, next)
      if (changed || wasFirst) dirty()
    }, {
      root: options.root ? options.root() : null,
      rootMargin: rm ?? '0px',
      threshold: th ?? 0,
    })
    io.observe(el)
  }

  function observe(target: HTMLElement | null) {
    el = target
    if (target) {
      createIO()
    } else {
      io?.disconnect()
      io = null
      handle.isIn = false
    }
  }

  function refresh() {
    createIO()
  }

  function disconnect() {
    io?.disconnect()
    io = null
  }

  // 组件卸载时自动断开 IO（防御：组件若只用 observe(el) 未接 ref(null)，
  // 卸载后 IO 仍观察已移除元素——泄漏）
  if (selfId) {
    const unsub = env.onUnmount((id) => { if (id === selfId) { disconnect(); unsub() } })
  }

  return handle
}

/** 滚动位置跟踪（全局 scroll 监听 + rAF 节流）：返回响应式 y，变化自动 dirty */
export function useScrollPosition(env: HookEnv, options: UseScrollPositionOptions): UseScrollPositionHandle {
  const selfId = env.selfId()
  const b = env.browser
  const handle: UseScrollPositionHandle = {
    y: 0,
    refresh() {
      const scroller = tracker.getScroller()
      handle.y = scroller instanceof Window
        ? (b.scrollingElement()?.scrollTop ?? b.scrollTop())
        : (scroller as HTMLElement).scrollTop ?? 0
    },
  }
  const tracker = {
    handle,
    getScroller: options.getScroller ?? (() => window),
  }
  if (!selfId) {
    handle.refresh()
    return handle
  }
  env.scrollTrackers.set(selfId, tracker)
  env.ensurePopupListeners() // 复用全局 scroll/resize 监听（rAF 节流）
  handle.refresh() // 初始值
  // 卸载清理 tracker（组件销毁后 scroll 重算不再引用已卸载组件）
  const unsub = env.onUnmount((id) => {
    if (id === selfId) { env.scrollTrackers.delete(selfId); unsub() }
  })
  return handle
}
