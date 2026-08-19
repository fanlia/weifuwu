import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../vdom/setup.ts'
setupJsdom()
import { Mentions } from './Mentions.ts'
import { Portal } from '../../vdom/core/node/portal.ts'
import type { UIContext } from '../../vdom/index.ts'
import { createTestCtx } from '../../vdom/testing.ts'

function makeCtx(): UIContext {
  const states = new Map<string, { keyword: string; selectedLabel: string }>()
  const values = new Map<string, any>()
  return createTestCtx({ ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    usePopup: (opts: any) => ({
      open: !!opts.isOpen?.(),
      setOpen: (v: boolean) => { if (!v) opts.setOpen?.(false) },
      wrapProps: {},
      portal: (content: any) => opts.isOpen?.() ? { type: Portal, props: { children: { ...content, props: { ...content.props, class: ['wf-popup', content.props?.class].filter(Boolean).join(' '), style: { ...content.props?.style, position: 'fixed', top: '0px', left: '0px' } } }, portalKey: 'popover' }, key: undefined, _placement: 'remote' } : null,
      refresh: () => {},
    }),
    useControlledInput: (opts: any) => {
      const key = opts.name ?? 'default'
      const controlled = opts.value !== undefined
      if (!values.has(key)) values.set(key, opts.value)
      const st = states.get(key) ?? { keyword: '', selectedLabel: '' }
      states.set(key, st)
      return {
        value: controlled ? opts.value : values.get(key),
        setValue: (v: any) => { if (controlled) opts.onChange?.(v); else values.set(key, v) },
        controlled,
        get keyword() { return st.keyword },
        setKeyword: (v: string) => { st.keyword = v },
        get selectedLabel() { return st.selectedLabel },
        setSelectedLabel: (v: string) => { st.selectedLabel = v },
      }
    },
  } }) as any
}

async function mount(Comp: any, props: any, ctx: any) {
  const result = await Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const options = [
  { value: 'alice', label: 'Alice' },
  { value: 'bob', label: 'Bob' },
  { value: 'carol', label: 'Carol' },
]

const panelOf = (v: any) => {
  const portal = v?.props?.children?.find((c: any) => c?.type === Portal)
  return portal?.props?.children
}

describe('Mentions', () => {
  it('renders textarea', async () => {
    const render = await mount(Mentions, { options, children: undefined }, makeCtx())!
    const vnode = await render({ options })
    const ta = vnode.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    assert.equal(ta.type, 'textarea')
  })

  it('typing @ triggers mention panel', async () => {
    const ctx = makeCtx()
    const render = await mount(Mentions, { options }, ctx)!
    let v = await render({ options })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onInput({ target: { value: '你好 @a', selectionStart: 7 } } as any)
    v = await render({ options })
    const panel = panelOf(v)
    assert.ok(panel, '应显示提及面板')
    assert.match(panel.props.class, /wf-mentions-panel/)
  })

  it('filters options by keyword', async () => {
    const ctx = makeCtx()
    const render = await mount(Mentions, { options }, ctx)!
    let v = await render({ options })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onInput({ target: { value: '@ca', selectionStart: 3 } } as any)
    v = await render({ options })
    const panel = panelOf(v)
    const items = panel.props.children
    assert.equal(items.length, 1) // 只有 carol
    assert.match(items[0].props.children, /Carol/)
  })

  it('no panel without @ prefix', async () => {
    const ctx = makeCtx()
    const render = await mount(Mentions, { options }, ctx)!
    let v = await render({ options })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onInput({ target: { value: '你好 world', selectionStart: 5 } } as any)
    v = await render({ options })
    assert.equal(v.props.children.length, 1) // 无面板
  })

  it('selecting option inserts mention', async () => {
    let got = ''
    const ctx = makeCtx()
    const render = await mount(Mentions, { options, onChange: (v: string) => { got = v } }, ctx)!
    let v = await render({ options, onChange: (v: string) => { got = v } })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onInput({ target: { value: '你好 @a', selectionStart: 7 } } as any)
    v = await render({ options, onChange: (v: string) => { got = v } })
    const panel = panelOf(v)
    panel.props.children[0].props.onClick()
    assert.match(got, /@alice/)
  })

  it('composition start suppresses panel', async () => {
    const ctx = makeCtx()
    const render = await mount(Mentions, { options }, ctx)!
    let v = await render({ options })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onCompositionStart({})
    ta.props.onInput({ target: { value: '@a', selectionStart: 2 } } as any)
    v = await render({ options })
    assert.equal(v.props.children.length, 1) // composition 中不弹
  })

  it('composition end resumes', async () => {
    const ctx = makeCtx()
    const render = await mount(Mentions, { options }, ctx)!
    let v = await render({ options })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onCompositionStart({})
    ta.props.onCompositionEnd({})
    ta.props.onInput({ target: { value: '@b', selectionStart: 2 } } as any)
    v = await render({ options })
    const panel = panelOf(v)
    assert.ok(panel)
    assert.equal(panel.props.children.length, 1) // bob
  })

  it('Escape closes panel', async () => {
    const ctx = makeCtx()
    const render = await mount(Mentions, { options }, ctx)!
    let v = await render({ options })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onInput({ target: { value: '@a', selectionStart: 2 } } as any)
    v = await render({ options })
    assert.ok(panelOf(v))
    const ta2 = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta2.props.onKeyDown({ key: 'Escape', preventDefault: () => {} })
    v = await render({ options })
    assert.equal(v.props.children.length, 1)
  })

  it('keyboard: ArrowDown + Enter selects', async () => {
    let got = ''
    const ctx = makeCtx()
    const render = await mount(Mentions, { options, onChange: (v: string) => { got = v } }, ctx)!
    let v = await render({ options, onChange: (v: string) => { got = v } })
    const ta = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta.props.onInput({ target: { value: '@', selectionStart: 1 } } as any)
    v = await render({ options, onChange: (v: string) => { got = v } })
    const ta2 = v.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    ta2.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    ta2.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.match(got, /@bob/) // ArrowDown 高亮第 2 项
  })

  it('disabled textarea', async () => {
    const render = await mount(Mentions, { options, disabled: true }, makeCtx())!
    const vnode = await render({ options, disabled: true })
    const ta = vnode.props.children.find((c: any) => c.props?.class?.includes('wf-mentions-input'))
    assert.equal(ta.props.disabled, true)
  })
})
