/** 分层抽象演示——useOverlay 换皮（行为契约 + 自绘皮——三用法之一） */
import type { Component } from 'weifuwu/vdom'
import { h } from 'weifuwu/vdom'

export const OverlayCustomDemo: Component = (_i, ctx) => {
  let open = false
  const ov = ctx.ui.useOverlay({ role: 'dialog' })

  return () => {
    const trigger = h('button', {
      class: 'wf-btn wf-btn--primary',
      onClick: () => { open = true; ctx.render() },
    }, '打开自绘面板')

    const panel = open
      ? h('div', {
          class: 'my-overlay-root',
          ...ov.panelProps,
        }, [
          h('div', { class: 'my-overlay-mask', ...ov.maskProps }),
          h('div', { class: 'my-overlay-panel' }, [
            h('h3', {}, '自绘面板（行为来自 useOverlay）'),
            h('p', {}, 'Esc 关闭 · 焦点困禁 · 滚动锁 · 遮罩点击关闭——无一手写。'),
            h('button', {
              class: 'wf-btn',
              onClick: () => { open = false; ctx.render() },
            }, '关闭'),
          ]),
        ])
      : null

    if (open) ov.sync(() => panel!, { open: true, onOpenChange: (v) => { if (!v) { open = false; ctx.render() } } })
    else ov.sync(() => panel!, { open })

    return h('div', { class: 'wf-stack wf-items-center wf-gap-md', style: 'padding:24px' }, [
      trigger,
      panel,
    ])
  }
}

export const DEMOS = { OverlayCustom: OverlayCustomDemo }
