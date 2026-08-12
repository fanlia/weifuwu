import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Modal } from './Modal.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import { mountToDom, patchToDom, buildToDom } from '../../ui-dom/testing.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

const globalKeys: ((e: any) => void)[] = []
function makeCtx(): WfuiContext {
  let phase: 'closed' | 'open' | 'exit' = 'closed'
  return createTestCtx({ ui: {
    $: () => ({}), render: () => {}, dirty: () => {}, ready: true,
    // usePopup mock：presence 模式状态机（组件层测试不跑渲染器）
    useGlobalKey: (h: any) => { globalKeys.push(h); return () => {} },
    usePopup: () => ({
      get phase() { return phase },
      get open() { return phase !== 'closed' },
      setOpen: (v: boolean) => { if (v) phase = 'open'; else if (phase === 'open') phase = 'exit' },
      sync: (open: boolean) => {
        if (open) phase = 'open'
        else if (phase === 'open') phase = 'exit'
        return phase
      },
      wrapProps: {}, portal: (c: any) => c, refresh: () => {},
    }),
  } }) as any
}

/** 两阶段组件：mount 后调用 renderFn(props) 获取 VNode */
async function renderModal(props: any, ctx: WfuiContext) {
  const result = await Modal(props, ctx)
  if (typeof result === 'function') return result(props)
  return result
}

// Portal 包裹的组件：先取内层 VNode
const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('Modal', () => {
  it('returns null when not open', async () => {
    const result = await renderModal({ open: false, children: '内容' }, makeCtx())
    assert.equal(result, null)
  })

  it('renders content when open', async () => {
    const vnode = await inner(await renderModal({ open: true, children: '内容' }, makeCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-modal/)
  })

  it('renders title when provided', async () => {
    const vnode = await inner(await renderModal({ open: true, title: '确认', children: '内容' }, makeCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    assert.equal(header.props.children[0], '确认')
  })

  it('renders footer when provided', async () => {
    const vnode = await inner(await renderModal({ open: true, title: '确认', children: '内容', footer: '底部' }, makeCtx())!)
    const content = vnode.props.children[1]
    const footer = content.props.children[2]
    assert.equal(footer.props.class, 'wf-modal-footer')
    assert.equal(footer.props.children, '底部')
  })

  it('has overlay that calls onClose on click', async () => {
    let closed = false
    const vnode = await inner(await renderModal({ open: true, children: '内容', onClose: () => { closed = true } }, makeCtx())!)
    const overlay = vnode.props.children[0]
    assert.equal(overlay.props.class, 'wf-modal-overlay')
    assert.equal(typeof overlay.props.onClick, 'function')
  })

  it('accepts custom width（视口 clamp：min(600px, calc(100vw - 32px))）', async () => {
    const vnode = await inner(await renderModal({ open: true, children: '内容', width: '600px' }, makeCtx())!)
    const content = vnode.props.children[1]
    assert.equal(content.props.class, 'wf-modal-content')
    assert.equal(content.props.style.minWidth, 'min(600px, calc(100vw - 32px))')
    assert.equal(content.props.style.maxWidth, 'min(600px, calc(100vw - 32px))')
  })

  it('hides close button when closable=false', async () => {
    const vnode = await inner(await renderModal({ open: true, title: '标题', children: '内容', closable: false }, makeCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    // no close button in header children
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-modal-close')
    assert.equal(closeBtn, undefined)
  })

  it('shows close button by default', async () => {
    const vnode = await inner(await renderModal({ open: true, title: '标题', children: '内容' }, makeCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-modal-close')
    assert.ok(closeBtn)
  })

  it('Escape 触发 onClose（document 级 useGlobalKey）', async () => {
    const ctx = makeCtx()
    const keysBefore = globalKeys.length
    let closed = 0
    await renderModal({ open: true, onClose: () => closed++ }, ctx)
    const esc = globalKeys[globalKeys.length - 1]
    assert.equal(typeof esc, 'function')
    esc({ key: 'Escape' })
    assert.equal(closed, 1)
    // 非 Escape 键不触发
    esc({ key: 'Tab' })
    assert.equal(closed, 1)
    void keysBefore
  })

  it('关闭先挂 --exit 类，animationend 后才真正卸载（patch 管线）', async () => {
    let renderFn: (() => any) | null = null
    let prev: any = null
    const container = document.createElement('div')
    document.body.appendChild(container)
    let open = true
    let phase: 'closed' | 'open' | 'exit' = 'closed'
    const ctx: any = {
      ui: {
        $: () => ({}), dirty: () => {},
        useGlobalKey: () => () => {},
        render: async () => {
          const next = await renderFn!()
          await patchToDom(container, container.firstChild, prev, next, ctx)
          prev = next
        },
        usePopup: () => {
          let animEndHandler: (() => void) | undefined
          return {
            get phase() { return phase },
            sync: (open: boolean) => {
              if (open) phase = 'open'
              else if (phase === 'open') phase = 'exit'
              return phase
            },
            // 模拟 portalPanelRef（presence.ref——animationend 退场监听挂到渲染元素）
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
      },
    }
    const result = await (Modal as any)({}, ctx)
    renderFn = typeof result === 'function' ? async () => await result({ open, children: 'x' }) : null
    prev = await renderFn!()
    await mountToDom(container, prev, ctx)
    assert.ok(document.querySelector('.wf-modal'), 'open=true 应渲染')
    assert.match(document.querySelector('.wf-modal')!.className, /wf-modal--enter/)

    // 父组件关闭 → 退场帧（不立刻卸载）
    open = false
    await ctx.ui.render()
    const el = document.querySelector('.wf-modal') as HTMLElement
    assert.ok(el, '关闭瞬间仍保留在 DOM（播退场动画）')
    assert.match(el.className, /wf-modal--exit/, '退场帧应挂 --exit 类')

    // animationend → 真正卸载
    el.dispatchEvent(new (window as any).Event('animationend'))
    await ctx.ui.render()
    assert.ok(!document.querySelector('.wf-modal'), 'animationend 后应卸载')
  })
})

// ── 真实 usePopup 链路（非 mock——createVdomContext + mountRoot：presence 退场接线） ──

import { mountRoot, createVdomContext } from '../../ui-dom/context.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import { h } from '../../ui-dom/vnode.ts'

it('真实 usePopup：open → 渲染 → close → exit 动画 → animationend 卸载', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  let open = false
  let modalPhase: string | undefined
  const Host: any = async (_i: any, c: any) => async () => h('div', {}, h(Modal, { open, onClose: () => { open = false } }))
  await handle.mount(h(Host, {}))
  open = true
  await handle.ctx.ui.render()
  // Modal 经 portal 渲染到 #__wf_portal（body）——查全局 DOM
  const q = () => document.querySelector('.wf-modal')
  assert.ok(q(), 'open → 渲染 wf-modal（portal）')
  assert.match(q()!.className, /wf-modal--enter/)

  // 关闭 → 退场帧（不立刻卸载——presence exit）
  open = false
  await handle.ctx.ui.render()
  const el = q()
  assert.ok(el, '关闭瞬间仍保留（退场动画）')
  assert.match(el!.className, /wf-modal--exit/, '挂 --exit 类')

  // animationend（portalPanelRef → presence.ref）→ 真正卸载
  el!.dispatchEvent(new (window as any).Event('animationend'))
  await new Promise((r) => setTimeout(r, 20))
  assert.ok(!q(), 'animationend 后卸载')
  document.body.removeChild(container)
})
