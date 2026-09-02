/**
 * weifuwu/components — Anchor
 *
 * 锚点导航（长文页）：items 列表 + 滚动高亮跟随 + 点击平滑滚动。
 * 滚动侦听：ctx.ui.useScrollPosition（全局/容器 scroll 监听 + rAF 节流，内置方案）。
 * 裁剪（CS-05，见 docs/client.md）：嵌套滚动容器、滚动容器非视口（container 未提供时仅视口）、自动生成标题锚点。
 */

import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface AnchorItem {
  href: string
  title: any
}

export interface AnchorProps {
  items: AnchorItem[]
  /** 当前激活锚点（受控可选；省略时滚动自动跟随） */
  activeKey?: string
  /** 激活锚点变化回调（受控或观察） */
  onAnchorChange?: (href: string) => void
  /** 点击是否更新 location.hash（默认 false——回调 + 滚动） */
  useHash?: boolean
  /** 滚动容器（默认 window） */
  container?: () => HTMLElement | Window
  /** 高亮阈值：锚点进入视口该偏移内视为激活（px），默认 80 */
  offsetTop?: number
  className?: string
}

export const Anchor: Component<AnchorProps> = (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback createClientBrowser——自研惰性防御）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let navEl: HTMLElement | null = null
  let internalActive: string | undefined
  let lastNotified: string | undefined
  const navRef = (el: HTMLElement | null) => { if (el) navEl = el }
  const propsRef: any = { ..._init }

  const getScroller = () => propsRef.container ? propsRef.container() : window
  const scroll = ctx.ui.useScrollPosition({ getScroller })

  // 滚动高亮：最后一个顶部 <= 阈值的锚点（render 时读 scroll.y——y 响应式自动 dirty）
  const computeActive = (items: AnchorItem[], threshold: number): string | undefined => {
    let active: string | undefined
    for (const it of items) {
      const el = it.href.startsWith('#') ? ctx.browser?.byId(it.href.slice(1)) ?? null : null
      if (!el) continue
      if (el.getBoundingClientRect().top <= threshold) active = it.href
    }
    return active ?? items[0]?.href
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const links = navEl ? Array.from(navEl.querySelectorAll<HTMLElement>('.wf-anchor-link')) : []
    const idx = links.indexOf((_browser?.activeElement() ?? null) as HTMLElement)
    if (idx < 0) return
    e.preventDefault()
    let next = idx
    if (e.key === 'ArrowDown') next = (idx + 1) % links.length
    else if (e.key === 'ArrowUp') next = (idx - 1 + links.length) % links.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = links.length - 1
    links[next].focus()
  }

  return (props: AnchorProps) => {
    Object.assign(propsRef, props)
    const { items, activeKey, onAnchorChange, useHash, offsetTop = 80, className } = props

    // 受控：显示 activeKey；滚动计算始终进行（onAnchorChange 通知父层——antd onChange 语义）
    // 回调推迟到微任务：渲染期调用 onAnchorChange 触发父层 render——renderer 直接执行
    // （render-only：render() 是 fire-and-forget async，渲染期调用会排入队列后执行，无嵌套渲染）
    const computed = computeActive(items, offsetTop)
    if (internalActive !== computed) {
      internalActive = computed
      // 渲染期调 onAnchorChange → 父层 render 由框架自动推迟到微任务
      // （ui.ts render 渲染期推迟——无需组件手动 queueMicrotask）
      if (computed !== undefined && computed !== lastNotified) {
        lastNotified = computed
        onAnchorChange?.(computed)
      }
    }
    const active = activeKey !== undefined ? activeKey : (internalActive ?? computed)

    const handleClick = (href: string) => (e: Event) => {
      e.preventDefault()
      if (useHash) ctx.browser?.setHash(href)
      onAnchorChange?.(href)
      if (!useHash && activeKey === undefined) internalActive = href
      const el = href.startsWith('#') ? ctx.browser?.byId(href.slice(1)) ?? null : null
      if (el && typeof (el as any).scrollIntoView === 'function') {
        (el as any).scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    const links = items.map(it => {
      const isActive = active === it.href
      return h('a', {
        key: it.href,
        class: `wf-anchor-link${isActive ? ' wf-anchor-link--active' : ''}`,
        href: it.href,
        role: 'link',
        tabIndex: 0,
        'aria-current': isActive ? 'true' : undefined,
        onClick: handleClick(it.href),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick(it.href)(e as any) }
        },
      }, it.title)
    })

    return h('nav', {
      class: ['wf-anchor-nav', className].filter(Boolean).join(' '),
      ref: navRef,
      onKeyDown,
      'aria-label': '锚点导航',
    }, links)
  }
}
