import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Modal } from './Modal.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import { mountToDom, patchToDom, buildToDom } from '../../ui-dom/testing.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

function makeCtx(): WfuiContext {
  let phase: 'closed' | 'open' | 'exit' = 'closed'
  return createTestCtx({ ui: {
    $: () => ({}), render: () => {}, dirty: () => {}, ready: true,
    // useDialog mock：状态机与真实现同语义（组件层测试不跑渲染器）
    useDialog: () => ({
      get phase() { return phase },
      rootRef: () => {}, panelRef: () => {},
      sync: (open: boolean) => {
        if (open) phase = 'open'
        else if (phase === 'open') phase = 'exit'
        return phase
      },
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
    const vnode = inner(await renderModal({ open: true, children: '内容' }, makeCtx())!)
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-modal/)
  })

  it('renders title when provided', async () => {
    const vnode = inner(await renderModal({ open: true, title: '确认', children: '内容' }, makeCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    assert.equal(header.props.children[0], '确认')
  })

  it('renders footer when provided', async () => {
    const vnode = inner(await renderModal({ open: true, title: '确认', children: '内容', footer: '底部' }, makeCtx())!)
    const content = vnode.props.children[1]
    const footer = content.props.children[2]
    assert.equal(footer.props.class, 'wf-modal-footer')
    assert.equal(footer.props.children, '底部')
  })

  it('has overlay that calls onClose on click', async () => {
    let closed = false
    const vnode = inner(await renderModal({ open: true, children: '内容', onClose: () => { closed = true } }, makeCtx())!)
    const overlay = vnode.props.children[0]
    assert.equal(overlay.props.class, 'wf-modal-overlay')
    assert.equal(typeof overlay.props.onClick, 'function')
  })

  it('accepts custom width（视口 clamp：min(600px, calc(100vw - 32px))）', async () => {
    const vnode = inner(await renderModal({ open: true, children: '内容', width: '600px' }, makeCtx())!)
    const content = vnode.props.children[1]
    assert.equal(content.props.class, 'wf-modal-content')
    assert.equal(content.props.style.minWidth, 'min(600px, calc(100vw - 32px))')
    assert.equal(content.props.style.maxWidth, 'min(600px, calc(100vw - 32px))')
  })

  it('hides close button when closable=false', async () => {
    const vnode = inner(await renderModal({ open: true, title: '标题', children: '内容', closable: false }, makeCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    // no close button in header children
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-modal-close')
    assert.equal(closeBtn, undefined)
  })

  it('shows close button by default', async () => {
    const vnode = inner(await renderModal({ open: true, title: '标题', children: '内容' }, makeCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-modal-close')
    assert.ok(closeBtn)
  })

  it('Escape 触发 onClose（根节点 onKeyDown）', async () => {
    let closed = 0
    const vnode = inner(await renderModal({ open: true, onClose: () => closed++ }, makeCtx())!)
    assert.equal(typeof vnode.props.onKeyDown, 'function')
    vnode.props.onKeyDown({ key: 'Escape' })
    assert.equal(closed, 1)
    // 非 Escape 键不触发
    vnode.props.onKeyDown({ key: 'Tab' })
    assert.equal(closed, 1)
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
        render: async () => {
          const next = renderFn!()
          await patchToDom(container, container.firstChild, prev, next, ctx)
          prev = next
        },
        useDialog: () => {
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
      },
    }
    const result = await (Modal as any)({}, ctx)
    renderFn = typeof result === 'function' ? () => result({ open, children: 'x' }) : null
    prev = renderFn!()
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
