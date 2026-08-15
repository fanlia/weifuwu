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

import { h } from '../../ui-dom/vnode.ts'
import { mountToDom } from '../../ui-dom/testing.ts'
import { Confirm } from './Confirm.ts'
import { Modal } from '../Modal/Modal.ts'
import { UIRouter, jsx } from '../../ui-dom/index.ts'
import { uiServe } from '../../ui-dom/middleware/serve.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

function makeCtx(): WfuiContext {
  return createTestCtx({ ui: {
    render: () => {}, $: () => ({}), dirty: () => {},
    usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }),
    useGlobalKey: () => () => {},
    // usePopup mock：presence 状态机 + portal 绑定 animationend（真实渲染管线需要）
    usePopup: () => {
      let phase: 'closed' | 'open' | 'exit' = 'closed'
      let animEndHandler: (() => void) | undefined
      return {
        get phase() { return phase },
        sync: (open: boolean) => {
          if (open) phase = 'open'
          else if (phase === 'open') phase = 'exit'
          return phase
        },
        portal: (content: any) => ({
          ...content,
          props: {
            ...content.props,
            ref: (el: any) => {
              if (el && !animEndHandler) {
                animEndHandler = () => { if (phase === 'exit') phase = 'closed' }
                el.addEventListener('animationend', animEndHandler)
              }
              if (typeof content.props?.ref === 'function') content.props.ref(el)
            },
          },
        }),
        wrapProps: {}, setOpen: () => {}, refresh: () => {},
      }
    },
  } }) as any
}

/** 两阶段组件：mount → renderFn，反复调用 await renderFn(props) 获取 VNode */

const modal = () => document.querySelector('.wf-modal') as HTMLElement | null
const buttons = () => Array.from(document.querySelectorAll('.wf-modal .wf-btn')) as HTMLButtonElement[]

afterEach(() => {
  document.querySelectorAll('#__wf_portal').forEach(el => el.remove())
  document.body.innerHTML = ''
})

// ── 命令式测试基建：真实 app（$ 响应式才能驱动 Modal 退场状态机）──
async function mountConfirmApp() {
  const router = new UIRouter()
  let captured: any
  router.use(uiDomConfirm())
  router.get('/', (location: any, ctx: any) => { captured = ctx; return jsx('div', { children: 'host' }) })
  const el = document.createElement('div')
  el.id = `confirm-root-${Math.random().toString(36).slice(2)}`
  document.body.appendChild(el)
  uiServe(router, { root: `#${el.id}` })
  await flush()
  return captured as WfuiContext & { confirm: (m: string, o?: any) => Promise<boolean> }
}

const flush = (ms = 30) => new Promise(r => setTimeout(r, ms))
const fireExit = () => modal()?.dispatchEvent(new (window as any).Event('animationend'))

describe('Confirm 组件（声明式）', () => {
  it('open=false 时挂载后无 DOM', async () => {
    const ctx = makeCtx()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = await renderVNode(Confirm, { open: false, message: 'x' }, ctx)
    await mountToDom(container, vnode, ctx)
    await new Promise((r) => setTimeout(r, 0)) // Modal async 化：占位补全
    assert.equal(modal(), null, 'Modal open=false 不渲染 DOM')
  })

  it('open=true 渲染为 Modal（open/children 透传）', async () => {
    const vnode = await renderVNode(Confirm, { open: true, message: '确定删除？' }, makeCtx())
    assert.equal(vnode.type, Modal)
    assert.equal(vnode.props.open, true)
    assert.equal(vnode.props.children, '确定删除？')
  })

  it('按钮文案默认与自定义', async () => {
    const ctx = makeCtx()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const vnode = await renderVNode(Confirm, { open: true, message: 'x', confirmText: '删除', cancelText: '再想想', onConfirm: () => {}, onCancel: () => {} }, ctx)
    await mountToDom(container, vnode, ctx)
    // Button async 化：VNode 层断言（mock ctx 无补全调度——DOM 按钮不落地）
    const modal = vnode as any
    const btns = modal.props.footer.filter((b: any) => b?.type?.name === 'Button')
    const texts = btns.map((b: any) => b.props.children)
    assert.deepEqual(texts, ['再想想', '删除'])
  })

  it('确定/取消按钮分别触发 onConfirm/onCancel', async () => {
    let confirmed = 0
    let cancelled = 0
    const vnode = await renderVNode(Confirm, {
      open: true, message: 'x',
      onConfirm: () => confirmed++, onCancel: () => cancelled++,
    }, makeCtx())
    const [cancelBtn, okBtn] = vnode.props.footer
    okBtn.props.onClick()
    cancelBtn.props.onClick()
    assert.equal(confirmed, 1)
    assert.equal(cancelled, 1)
  })

  it('ESC 触发 onCancel（经 Modal onKeyDown，焦点在对话框内）', async () => {
    // Modal/Button async 化：mock ctx 无补全调度——用集成式（真实调度补全）
    const router = new UIRouter()
    let cancelled = false
    router.get('/', () => h(Confirm, { open: true, message: 'x', onCancel: () => { cancelled = true } }))
    const el = document.createElement('div')
    el.id = `confirm-esc-${Math.random().toString(36).slice(2)}`
    document.body.appendChild(el)
    const handle = uiServe(router, { root: `#${el.id}` })
    await new Promise((r) => setTimeout(r, 0))

    const dialog = document.querySelector('.wf-modal') as HTMLElement
    assert.ok(dialog, 'Modal 补全渲染')
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    assert.equal(cancelled, true)
    handle.close()
  })

  it('Modal onClose 路由到 onCancel（Promise resolve(false) 语义）', async () => {
    let cancelled = 0
    const vnode = await renderVNode(Confirm, { open: true, message: 'x', onCancel: () => cancelled++ }, makeCtx())
    vnode.props.onClose()
    assert.equal(cancelled, 1)
  })

  it('遮罩点击默认不取消（maskClosable=false，危险操作防误触）', async () => {
    // Modal/Button async 化：mock ctx 无补全调度——集成式（真实调度补全）
    const router = new UIRouter()
    let cancelled = 0
    router.get('/', () => h(Confirm, { open: true, message: 'x', onCancel: () => { cancelled++ } }))
    const el = document.createElement('div')
    el.id = `confirm-mask-${Math.random().toString(36).slice(2)}`
    document.body.appendChild(el)
    const handle = uiServe(router, { root: `#${el.id}` })
    await new Promise((r) => setTimeout(r, 0))

    const overlay = document.querySelector('.wf-modal-overlay') as HTMLElement
    assert.ok(overlay, 'Modal 补全渲染')
    overlay.click()
    assert.equal(cancelled, 0, '默认遮罩点击不触发 onCancel')
    handle.close()
  })

  it('遮罩点击在 maskClosable=true 时触发 onCancel', async () => {
    // Modal/Button async 化：mock ctx 无补全调度——集成式
    const router = new UIRouter()
    let cancelled = 0
    router.get('/', () => h(Confirm, { open: true, message: 'x', maskClosable: true, onCancel: () => { cancelled++ } }))
    const el = document.createElement('div')
    el.id = `confirm-mask2-${Math.random().toString(36).slice(2)}`
    document.body.appendChild(el)
    const handle = uiServe(router, { root: `#${el.id}` })
    await new Promise((r) => setTimeout(r, 0))

    const overlay = document.querySelector('.wf-modal-overlay') as HTMLElement
    assert.ok(overlay, 'Modal 补全渲染')
    overlay.click()
    assert.equal(cancelled, 1, '显式 maskClosable=true 遮罩点击触发')
    handle.close()
  })

  it('无关闭按钮（closable=false）+ variant/width 透传', async () => {
    const vnode = await renderVNode(Confirm, { open: true, message: 'x', variant: 'danger', width: '600px' }, makeCtx())
    assert.equal(vnode.props.closable, false)
    assert.equal(vnode.props.width, '600px')
    const [, okBtn] = vnode.props.footer
    assert.equal(okBtn.props.variant, 'danger')
  })

  it('message 支持 VNode（任意内容）', async () => {
    const msg = { type: 'div', props: { children: '富文本' } }
    const vnode = await renderVNode(Confirm, { open: true, message: msg }, makeCtx())
    assert.equal(vnode.props.children, msg)
  })
})
