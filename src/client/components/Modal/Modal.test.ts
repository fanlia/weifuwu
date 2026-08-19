import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
setupJsdom()
import { Modal } from './Modal.ts'
import { Portal } from '../../vdom/core/node/portal.ts'
import { mountToDom, patchToDom, buildToDom } from '../../vdom/testing.ts'
import type { UIContext } from '../../vdom/index.ts'
import { createTestCtx } from '../../vdom/testing.ts'

const globalKeys: ((e: any) => void)[] = []
function makeCtx(): UIContext {
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
async function renderModal(props: any, ctx: UIContext) {
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

  it('maskClosable=false 遮罩点击不触发 onClose（危险确认防误触）', async () => {
    let closed = 0
    const vnode = await inner(await renderModal({ open: true, children: '内容', onClose: () => closed++, maskClosable: false }, makeCtx())!)
    const overlay = vnode.props.children[0]
    assert.equal(overlay.props.onClick, undefined, 'maskClosable=false 时遮罩无 onClick')
    assert.equal(closed, 0)
  })

  it('无 title 不渲染 header（含无关闭按钮场景）', async () => {
    const vnode = await inner(await renderModal({ open: true, children: '内容' }, makeCtx())!)
    const content = vnode.props.children[1]
    const kids = content.props.children as any[]
    const hasHeader = kids.some((c: any) => c?.props?.class === 'wf-modal-header')
    assert.equal(hasHeader, false, '无 title 无 header')
  })

  it('无 footer 不渲染 footer 元素', async () => {
    const vnode = await inner(await renderModal({ open: true, title: '标题', children: '内容' }, makeCtx())!)
    const content = vnode.props.children[1]
    const kids = content.props.children as any[]
    const hasFooter = kids.some((c: any) => c?.props?.class === 'wf-modal-footer')
    assert.equal(hasFooter, false)
  })

  it('内容点击 stopPropagation（不冒泡到遮罩关闭）', async () => {
    let closed = 0
    const vnode = await inner(await renderModal({ open: true, title: '标题', children: '内容', onClose: () => closed++ }, makeCtx())!)
    const content = vnode.props.children[1]
    // 模拟内容内点击冒泡：stopPropagation 阻止到达遮罩
    const fakeEvent = { stopPropagation: () => { (fakeEvent as any).stopped = true } } as any
    content.props.onClick(fakeEvent)
    assert.equal((fakeEvent as any).stopped, true, '内容点击必须 stopPropagation')
    assert.equal(closed, 0)
  })

  it('关闭按钮点击触发 onClose（aria-label 关闭）', async () => {
    let closed = 0
    const vnode = await inner(await renderModal({ open: true, title: '标题', children: '内容', onClose: () => closed++ }, makeCtx())!)
    const content = vnode.props.children[1]
    const header = content.props.children[0]
    const closeBtn = (Array.isArray(header.props.children) ? header.props.children : [header.props.children]).find((c: any) => c?.props?.class === 'wf-modal-close')
    assert.ok(closeBtn, '关闭按钮存在')
    assert.equal(closeBtn.props['aria-label'], '关闭')
    closeBtn.props.onClick()
    assert.equal(closed, 1)
  })

  it('aria：role=dialog + aria-modal + aria-label=title', async () => {
    const vnode = await inner(await renderModal({ open: true, title: '确认删除', children: '内容' }, makeCtx())!)
    assert.equal(vnode.props.role, 'dialog')
    assert.equal(vnode.props['aria-modal'], 'true')
    assert.equal(vnode.props['aria-label'], '确认删除')
  })

  it('Escape 在退场（exit）阶段不重复触发 onClose', async () => {
    const ctx = makeCtx()
    let closed = 0
    let open = true
    await renderModal({ open, onClose: () => { closed++; open = false } }, ctx)
    const esc = globalKeys[globalKeys.length - 1]
    esc({ key: 'Escape' })
    assert.equal(closed, 1)
    // 父组件 render open=false → sync → phase=exit（模拟真实关闭链路）
    await renderModal({ open: false, onClose: () => {} }, ctx)
    esc({ key: 'Escape' })
    assert.equal(closed, 1, 'exit 阶段 Escape 不重复触发')
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
      render: async () => {
        const next = await renderFn!()
        await patchToDom(container, container.firstChild, prev, next, ctx)
        prev = next
      },
      onUnmount: () => {}, params: {}, query: {},
      ui: {
        useGlobalKey: () => () => {},
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
    await ctx.render()
    const el = document.querySelector('.wf-modal') as HTMLElement
    assert.ok(el, '关闭瞬间仍保留在 DOM（播退场动画）')
    assert.match(el.className, /wf-modal--exit/, '退场帧应挂 --exit 类')

    // animationend → 真正卸载
    el.dispatchEvent(new (window as any).Event('animationend'))
    await ctx.render()
    assert.ok(!document.querySelector('.wf-modal'), 'animationend 后应卸载')
  })
})
