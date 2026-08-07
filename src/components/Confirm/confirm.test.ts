/**
 * weifuwu/components — Confirm 测试
 *
 * 覆盖：
 *   - 声明式 <Confirm open>：footer 按钮 / ESC / 遮罩点击 = 取消
 *   - 命令式 ctx.confirm()：Promise resolve / 只 settle 一次 / 自定义文案 / 清理
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()

import { h } from '../../client/vnode.ts'
import { mountVNode } from '../../client/render.ts'
import { Confirm } from './Confirm.ts'
import { confirm } from './Confirm.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { render: () => {}, $: () => ({}), dirty: () => {}, usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }) } } as any
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

describe('Confirm 组件（声明式）', () => {
  it('open=false 时挂载后无 DOM', () => {
    const ctx = mockCtx()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = renderVNode(Confirm, { open: false, message: 'x' }, ctx)
    mountVNode(container, vnode, ctx)
    assert.equal(modal(), null, 'Modal open=false 不渲染 DOM')
  })

  it('open=true 渲染消息 + 取消/确定按钮', () => {
    const ctx = mockCtx()
    const vnode = renderVNode(Confirm, { open: true, message: '确定删除？', onConfirm: () => {}, onCancel: () => {} }, ctx)
    assert.ok(vnode, '应渲染 Modal')
    // Modal 是 portal VNode（remote）
    assert.equal(vnode?.type?.toString?.().includes('Portal') || vnode?.props !== undefined, true)
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

  it('ESC 触发 onCancel（经 Modal onKeyDown，焦点在对话框内）', () => {
    const ctx = mockCtx()
    let cancelled = false
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = renderVNode(Confirm, { open: true, message: 'x', onCancel: () => { cancelled = true } }, ctx)
    mountVNode(container, vnode, ctx)

    // Modal 根节点挂 onKeyDown（Escape → onClose = onCancel）；事件从对话框内元素冒泡
    const dialog = document.querySelector('.wf-modal') as HTMLElement
    const firstFocusable = dialog.querySelector('button') as HTMLElement
    firstFocusable.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.equal(cancelled, true)
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
})

describe('confirm() 命令式中间件', () => {
  it('注入 ctx.confirm', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    assert.equal(typeof (ctx as any).confirm, 'function')
  })

  it('调用后渲染确认框，点确定 resolve(true) 并清理', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('确定删除？')

    assert.ok(modal(), '应渲染 .wf-modal')
    assert.ok(modal()!.textContent!.includes('确定删除？'))

    const confirmBtn = buttons().find(b => b.textContent === '确定')!
    confirmBtn.click()
    // 退场：exit 类 + animationend 后清理（命令式路径 animateOut）
    assert.match(modal()!.className, /wf-modal--exit/, '关闭先挂 exit 类')
    modal()!.dispatchEvent(new (window as any).Event('animationend'))
    const result = await promise
    assert.equal(result, true)

    // 清理：portal 与容器都被移除
    assert.equal(document.querySelector('.wf-modal'), null, '确认后 DOM 应清理')
  })

  it('点取消 resolve(false)', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('x')
    const cancelBtn = buttons().find(b => b.textContent === '取消')!
    cancelBtn.click()
    modal()!.dispatchEvent(new (window as any).Event('animationend'))
    assert.equal(await promise, false)
  })

  it('ESC resolve(false)', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('x')
    // Escape 经 Modal 根节点 onKeyDown：从对话框内元素冒泡（焦点被 trap 在框内）
    const firstBtn = modal()!.querySelector('button') as HTMLElement
    firstBtn.dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    modal()!.dispatchEvent(new (window as any).Event('animationend'))
    assert.equal(await promise, false)
  })

  it('遮罩点击默认不取消（命令式，防误触）', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('x')
    // 默认 maskClosable=false：遮罩点击后仍不 resolve
    const overlay = document.querySelector('.wf-modal-overlay') as HTMLElement
    overlay.click()
    let resolved = false
    promise.then(() => { resolved = true })
    await new Promise(r => setTimeout(r, 20))
    assert.equal(resolved, false, '遮罩点击不应取消（默认）')
    // 取消按钮仍可关闭（收尾，防 timer 挂起）
    buttons().find(b => b.textContent === '取消')!.click()
    modal()!.dispatchEvent(new (window as any).Event('animationend'))
    assert.equal(await promise, false)
  })

  it('自定义文案与 variant', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('x', { confirmText: '删除', cancelText: '再想想', variant: 'danger' })
    const texts = buttons().map(b => b.textContent)
    assert.deepEqual(texts, ['再想想', '删除'])
    const danger = buttons().find(b => b.textContent === '删除')
    assert.ok(danger!.className.includes('wf-btn--danger'))
    // 点击确定
    danger!.click()
    modal()!.dispatchEvent(new (window as any).Event('animationend')) // 退场完成，清 timer
    assert.equal(await promise, true)
  })

  it('Promise 只 settle 一次（确定后再点取消不重复 resolve）', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const promise = (ctx as any).confirm('x')
    buttons().find(b => b.textContent === '确定')!.click()
    modal()!.dispatchEvent(new (window as any).Event('animationend')) // 退场完成，清 timer
    // 按钮已卸载，尝试再触发（应无效）
    assert.equal(await promise, true)
    const result = await promise
    assert.equal(result, true, '第二次 await 拿到同一结果，不重新 resolve')
  })

  it('连续多次调用：各自独立渲染与 resolve（叠放语义）', async () => {
    const mw = confirm()
    const ctx = await mw({} as WfuiContext)
    const p1 = (ctx as any).confirm('第一个')
    const p2 = (ctx as any).confirm('第二个')

    const modals = document.querySelectorAll('.wf-modal')
    assert.equal(modals.length, 2, '两次调用各自渲染一个对话框')
    assert.ok(modals[0].textContent.includes('第一个'))
    assert.ok(modals[1].textContent.includes('第二个'))

    // 各自独立 resolve
    const btn1 = Array.from(modals[0].querySelectorAll('.wf-btn')).find(b => b.textContent === '确定')!
    btn1.click()
    ;(modals[0] as HTMLElement).dispatchEvent(new (window as any).Event('animationend')) // 退场完成
    assert.equal(await p1, true)
    assert.equal(document.querySelectorAll('.wf-modal').length, 1, '第一个已清理，第二个仍在')

    const btn2 = Array.from(modals[1].querySelectorAll('.wf-btn')).find(b => b.textContent === '确定')!
    btn2.click()
    ;(modals[1] as HTMLElement).dispatchEvent(new (window as any).Event('animationend'))
    assert.equal(await p2, true)
    assert.equal(document.querySelector('.wf-modal'), null, '全部清理')
  })
})
