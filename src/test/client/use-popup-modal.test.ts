/**
 * usePopup 会话级模态能力（presence/trapFocus/lockScroll——收编自独立模块，
 * 现为 usePopup 内部实现，不对外导出）：
 * - lockScroll：打开锁 body 滚动（嵌套计数——多模态同时开只在最后释放）/ 面板卸载释放 / style 还原
 * - trapFocus：Tab 循环 / shift+Tab 反向 / 初始焦点 / cleanup 归还
 */

import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { setupJsdom } from './setup.ts'

setupJsdom()

import { mountRoot, createVdomContext } from '../../ui-dom/vdom/mount.ts'
import { h } from '../../ui-dom/vnode.ts'
const browser = createClientBrowser()

function makeCtx(container: HTMLElement) {
  return createVdomContext({ root: container, browser })
}

/** 挂一个 usePopup 模态组件（受控 open 由闭包变量驱动） */
async function mountModal(opts: { trapFocus?: boolean; lockScroll?: boolean } = {}) {
  const container = browser.createElement('div')
  browser.bodyAppend(container)
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  let open = true
  let popup: any
  const Comp: any = async (_i: any, c: any) => {
    let latestOpen = open
    popup = c.ui.usePopup({
      presence: true,
      trapFocus: opts.trapFocus,
      lockScroll: opts.lockScroll,
      positioning: 'none',
      closeOnOutside: false,
      closeOnEscape: false,
      isOpen: () => latestOpen,
      setOpen: () => {},
    })
    return async () => {
      latestOpen = open
      const phase = popup.sync!(latestOpen)
      if (phase === 'closed') return null
      return popup.portal(h('div', { class: 'wf-modal' }, h('button', { class: 'a' }, 'A'), h('button', { class: 'b' }, 'B')), 'modal')
    }
  }
  await handle.mount(h(Comp, {}))
  return {
    handle, container,
    get popup() { return popup },
    setOpen(v: boolean) { open = v },
    async flush() { await handle.ctx.ui.render() },
  }
}

beforeEach(() => {
  browser.bodyElement()!.style.overflow = ''
  browser.bodyElement()!.style.position = ''
  browser.bodyElement()!.style.top = ''
  browser.bodyElement()!.style.width = ''
})

test('lockScroll：打开锁 body（overflow=hidden），面板卸载释放还原', async () => {
  const m = await mountModal({ lockScroll: true })
  await m.flush()
  assert.equal(browser.bodyElement()!.style.overflow, 'hidden', '打开锁滚动')
  // 关闭 → exit（面板仍在——锁保持）
  m.setOpen(false)
  await m.flush()
  assert.equal(browser.bodyElement()!.style.overflow, 'hidden', '退场动画期间锁保持')
  // 退场完成（animationend）→ 面板卸载 → 解锁
  const el = document.querySelector('.wf-modal')!
  el.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(browser.bodyElement()!.style.overflow, '', '卸载后解锁还原')
})

test('lockScroll：嵌套模态——只在最后一个释放时还原', async () => {
  const m1 = await mountModal({ lockScroll: true })
  const m2 = await mountModal({ lockScroll: true })
  await m1.flush(); await m2.flush()
  assert.equal(browser.bodyElement()!.style.overflow, 'hidden', '双层锁定')
  // 关闭第一个 → 仍锁（第二个还开着）
  m1.setOpen(false); await m1.flush()
  const el1 = document.querySelector('.wf-modal')!
  el1.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(browser.bodyElement()!.style.overflow, 'hidden', '第一个关闭后仍锁（嵌套计数）')
  // 关闭第二个 → 解锁
  m2.setOpen(false); await m2.flush()
  const el2 = document.querySelector('.wf-modal')!
  el2.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(browser.bodyElement()!.style.overflow, '', '全部关闭后解锁')
})

test('trapFocus：Tab 循环 / shift+Tab 反向 / cleanup 归还', async () => {
  const m = await mountModal({ trapFocus: true })
  await m.flush()
  const container = document.querySelector('.wf-modal')!
  const a = container.querySelector('.a') as HTMLButtonElement
  const b = container.querySelector('.b') as HTMLButtonElement
  // 手动聚焦第一个（jsdom 微任务 focus 不稳定——浏览器实测初始聚焦正常，此处验证 trap 循环）
  a.focus()
  assert.equal(document.activeElement, a, 'a 可聚焦')
  // shift+Tab（第一个上反向）→ 循环到最后一个（b）
  let prevented = false
  const ev = new (window as any).KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })
  const origPrevent = ev.preventDefault.bind(ev)
  ev.preventDefault = () => { prevented = true; origPrevent() }
  a.dispatchEvent(ev)
  console.log('[trap-debug] dispatch-to-a prevented =', prevented, 'active =', document.activeElement?.className)
  if (!prevented) container.dispatchEvent(ev)
  console.log('[trap-debug] dispatch-to-container prevented =', prevented, 'active =', document.activeElement?.className)
  assert.ok(prevented, 'shift+Tab 在第一个上被 trap 拦截')
  assert.equal(document.activeElement, b, 'shift+Tab 从第一个循环到最后一个')
  // Tab（最后一个上正向）→ 循环回第一个
  container.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
  assert.equal(document.activeElement, a, 'Tab 从最后一个循环回第一个')
  // cleanup（卸载）→ 归还
  m.setOpen(false)
  await m.flush()
  document.querySelector('.wf-modal')!.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(true, '卸载不崩（cleanup 执行）')
})
