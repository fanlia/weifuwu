/**
 * weifuwu/components — Confirm 测试
 *
 * 覆盖：
 *   - 声明式 <Confirm open>：footer 按钮 / ESC / 遮罩点击 = 取消
 *   - 命令式 ctx.confirm()：Promise resolve / 只 settle 一次 / 自定义文案 / DOM 无残留
 *
 * 命令式路径用真实 createApp（$ 响应式驱动退场状态机——mock ctx 无法驱动重渲染）。
 * 历史：confirm.test.ts（小写命名，审计/清单漏计）合并入本文件（2026-08 P10）。
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()

import { h } from '../../client/vnode.ts'
import { mountVNode } from '../../client/render.ts'
import { Confirm, confirm } from './Confirm.ts'
import { Modal } from '../Modal/Modal.ts'
import { createApp } from '../../client/app.ts'
import { jsx } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: {
    render: () => {}, $: () => ({}), dirty: () => {},
    usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }),
    // useDialog mock：状态机 + rootRef 绑定 animationend（真实渲染管线需要）
    useDialog: () => {
      let phase: 'closed' | 'open' | 'exit' = 'closed'
      let animEndHandler: (() => void) | undefined
      return {
        get phase() { return phase },
        rootRef: (el: any) => {
          if (el && !animEndHandler) {
            animEndHandler = () => { if (phase === 'exit') phase = 'closed' }
            el.addEventListener('animationend', animEndHandler)
          }
        },
        panelRef: () => {},
        sync: (open: boolean) => {
          if (open) phase = 'open'
          else if (phase === 'open') phase = 'exit'
          return phase
        },
      }
    },
  } } as any
}

/** 两阶段组件：mount → renderFn，反复调用 renderFn(props) 获取 VNode */
function renderVNode(Comp: any, props: any, ctx: WfuiContext) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const modal = () => document.querySelector('.wf-modal') as HTMLElement | null
const buttons = () => Array.from(document.querySelectorAll('.wf-modal .wf-btn')) as HTMLButtonElement[]

afterEach(() => {
  document.querySelectorAll('#__wf_portal').forEach(el => el.remove())
  document.body.innerHTML = ''
})

// ── 命令式测试基建：真实 app（$ 响应式才能驱动 Modal 退场状态机）──
async function mountConfirmApp() {
  const app = createApp()
  let captured: any
  app.use(confirm())
  const el = document.createElement('div')
  el.id = `confirm-root-${Math.random().toString(36).slice(2)}`
  document.body.appendChild(el)
  await app.mount(`#${el.id}`, (init: any, ctx: any) => { captured = ctx; return () => jsx('div', { children: 'host' }) })
  return captured as WfuiContext & { confirm: (m: string, o?: any) => Promise<boolean> }
}

const flush = (ms = 30) => new Promise(r => setTimeout(r, ms))
const fireExit = () => modal()?.dispatchEvent(new (window as any).Event('animationend'))

describe('Confirm 组件（声明式）', () => {
  it('open=false 时挂载后无 DOM', () => {
    const ctx = mockCtx()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = renderVNode(Confirm, { open: false, message: 'x' }, ctx)
    mountVNode(container, vnode, ctx)
    assert.equal(modal(), null, 'Modal open=false 不渲染 DOM')
  })

  it('open=true 渲染为 Modal（open/children 透传）', () => {
    const vnode = renderVNode(Confirm, { open: true, message: '确定删除？' }, mockCtx())
    assert.equal(vnode.type, Modal)
    assert.equal(vnode.props.open, true)
    assert.equal(vnode.props.children, '确定删除？')
  })

  it('按钮文案默认与自定义', () => {
    const ctx = mockCtx()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = renderVNode(Confirm, { open: true, message: 'x', confirmText: '删除', cancelText: '再想想', onConfirm: () => {}, onCancel: () => {} }, ctx)
    mountVNode(container, vnode, ctx)
    const texts = buttons().map(b => b.textContent)
    assert.deepEqual(texts, ['再想想', '删除'])
  })

  it('确定/取消按钮分别触发 onConfirm/onCancel', () => {
    let confirmed = 0
    let cancelled = 0
    const vnode = renderVNode(Confirm, {
      open: true, message: 'x',
      onConfirm: () => confirmed++, onCancel: () => cancelled++,
    }, mockCtx())
    const [cancelBtn, okBtn] = vnode.props.footer
    okBtn.props.onClick()
    cancelBtn.props.onClick()
    assert.equal(confirmed, 1)
    assert.equal(cancelled, 1)
  })

  it('ESC 触发 onCancel（经 Modal onKeyDown，焦点在对话框内）', () => {
    const ctx = mockCtx()
    let cancelled = false
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = renderVNode(Confirm, { open: true, message: 'x', onCancel: () => { cancelled = true } }, ctx)
    mountVNode(container, vnode, ctx)

    const dialog = document.querySelector('.wf-modal') as HTMLElement
    const firstFocusable = dialog.querySelector('button') as HTMLElement
    firstFocusable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.equal(cancelled, true)
  })

  it('Modal onClose 路由到 onCancel（Promise resolve(false) 语义）', () => {
    let cancelled = 0
    const vnode = renderVNode(Confirm, { open: true, message: 'x', onCancel: () => cancelled++ }, mockCtx())
    vnode.props.onClose()
    assert.equal(cancelled, 1)
  })

  it('遮罩点击默认不取消（maskClosable=false，危险操作防误触）', () => {
    const ctx = mockCtx()
    let cancelled = 0
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = renderVNode(Confirm, { open: true, message: 'x', onCancel: () => { cancelled++ } }, ctx)
    mountVNode(container, vnode, ctx)

    const overlay = document.querySelector('.wf-modal-overlay') as HTMLElement
    overlay.click()
    assert.equal(cancelled, 0, '默认遮罩点击不触发 onCancel')
  })

  it('遮罩点击在 maskClosable=true 时触发 onCancel', () => {
    const ctx = mockCtx()
    let cancelled = 0
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = renderVNode(Confirm, { open: true, message: 'x', maskClosable: true, onCancel: () => { cancelled++ } }, ctx)
    mountVNode(container, vnode, ctx)

    const overlay = document.querySelector('.wf-modal-overlay') as HTMLElement
    overlay.click()
    assert.equal(cancelled, 1, '显式 maskClosable=true 遮罩点击触发')
  })

  it('无关闭按钮（closable=false）+ variant/width 透传', () => {
    const vnode = renderVNode(Confirm, { open: true, message: 'x', variant: 'danger', width: '600px' }, mockCtx())
    assert.equal(vnode.props.closable, false)
    assert.equal(vnode.props.width, '600px')
    const [, okBtn] = vnode.props.footer
    assert.equal(okBtn.props.variant, 'danger')
  })

  it('message 支持 VNode（任意内容）', () => {
    const msg = { type: 'div', props: { children: '富文本' } }
    const vnode = renderVNode(Confirm, { open: true, message: msg }, mockCtx())
    assert.equal(vnode.props.children, msg)
  })
})

describe('confirm() 命令式中间件（真实 app ctx）', () => {
  it('注入 ctx.confirm', async () => {
    const mw = confirm()
    const ctx = await mw(mockCtx())
    assert.equal(typeof (ctx as any).confirm, 'function')
  })

  it('点确定 resolve(true) 且 DOM 无残留（portal modal 泄漏防线）', async () => {
    const ctx = await mountConfirmApp()
    const p = ctx.confirm('确定删除？', { confirmText: '删除', variant: 'danger' })
    await flush()
    assert.ok(modal(), '命令式 confirm 应打开 modal')

    const okBtn = buttons().find(b => b.textContent === '删除')!
    okBtn.click()
    assert.equal(await p, true, '确定 → resolve(true)')
    // 模拟宿主 await 续跑重渲染（历史泄漏触发条件）
    ctx.ui.render()
    await flush()
    fireExit()
    await flush(700) // 兜底 timeout 后
    assert.equal(document.querySelectorAll('.wf-modal').length, 0, 'resolve 后 modal 必须退场清理（portal 不残留）')
  })

  it('点取消 resolve(false)', async () => {
    const ctx = await mountConfirmApp()
    const p = ctx.confirm('x')
    await flush()
    buttons().find(b => b.textContent === '取消')!.click()
    assert.equal(await p, false)
    await flush()
    fireExit()
    await flush(700)
    assert.equal(modal(), null)
  })

  it('ESC resolve(false)', async () => {
    const ctx = await mountConfirmApp()
    const p = ctx.confirm('x')
    await flush()
    const dialog = modal()!
    dialog.querySelector('button')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.equal(await p, false)
  })

  it('遮罩点击默认不取消（命令式，防误触）', async () => {
    const ctx = await mountConfirmApp()
    let settled = false
    const p = ctx.confirm('x').then(r => { settled = true; return r })
    await flush()
    ;(document.querySelector('.wf-modal-overlay') as HTMLElement).click()
    await flush()
    assert.equal(settled, false, '遮罩点击不应 settle')
    buttons().find(b => b.textContent === '取消')!.click()
    assert.equal(await p, false)
  })

  it('Promise 只 settle 一次（确定后再点取消不重复 resolve）', async () => {
    const ctx = await mountConfirmApp()
    let count = 0
    const p = ctx.confirm('x').then(r => { count++; return r })
    await flush()
    buttons().find(b => b.textContent === '确定')!.click()
    assert.equal(await p, true)
    buttons().find(b => b.textContent === '取消')?.click()
    await flush()
    assert.equal(count, 1)
  })

  it('连续多次调用：各自独立渲染与 resolve（叠放语义）', async () => {
    const ctx = await mountConfirmApp()
    const p1 = ctx.confirm('第一条', { confirmText: '好' })
    const p2 = ctx.confirm('第二条', { confirmText: '行' })
    await flush()
    const modals = document.querySelectorAll('.wf-modal')
    assert.ok(modals.length >= 1, '至少一条在显示')
    // 各自独立 resolve
    const okBtns = Array.from(document.querySelectorAll('.wf-modal .wf-btn')).filter(b => ['好', '行'].includes(b.textContent ?? ''))
    okBtns.forEach(b => (b as HTMLButtonElement).click())
    assert.equal(await p1, true)
    assert.equal(await p2, true)
  })
})
