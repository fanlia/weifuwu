import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Cascader } from './Cascader.ts'
import { Portal } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function mockCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true, usePopup: (opts: any) => {
      // 镜像 usePopup 的 document 级 Escape（portal 中按 Escape 也能关）
      const onDocKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && opts.isOpen?.()) opts.setOpen?.(false) }
      document.addEventListener('keydown', onDocKey)
      return {
        open: !!opts.isOpen?.(),
        setOpen: (v: boolean) => { if (!v) opts.setOpen?.(false) },
        wrapProps: {},
        portal: (content: any) => opts.isOpen?.() ? { type: Portal, props: { children: { ...content, props: { ...content.props, class: ['wf-popup', content.props?.class].filter(Boolean).join(' '), style: { ...content.props?.style, position: 'fixed', top: '0px', left: '0px' } } }, portalKey: 'popover' }, key: undefined, _placement: 'remote' } : null,
        refresh: () => {},
      }
    } } } as any
}

function mount(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result : null
}

const options = [
  {
    value: 'zj', label: '浙江',
    children: [
      { value: 'hz', label: '杭州', children: [{ value: 'xh', label: '西湖区' }] },
      { value: 'nb', label: '宁波' },
    ],
  },
  { value: 'gd', label: '广东', children: [{ value: 'sz', label: '深圳' }] },
]

/** 穿透 portal 取弹层 VNode（panel 在 wf-cascader 包装层内） */
function panelOf(v: any): any {
  const wrap = wrapOf(v)
  const portal = wrap?.props?.children?.find((c: any) => c?.type === Portal)
  return portal?.props?.children
}

/** 取 wf-cascader 包装（trigger + panel 所在层） */
function wrapOf(v: any): any {
  return v.props.children.find((c: any) => c?.props?.class === 'wf-cascader')
}

const triggerOf = (v: any) => wrapOf(v).props.children[0]

describe('Cascader', () => {
  it('renders trigger with placeholder', () => {
    const render = mount(Cascader, { options }, mockCtx())!
    const v = render({ options })
    const trigger = triggerOf(v)
    assert.ok(trigger)
    assert.match(trigger.props.class, /wf-cascader-trigger/)
  })

  it('shows selected path label', () => {
    const render = mount(Cascader, { options, value: ['zj', 'hz', 'xh'] }, mockCtx())!
    const v = render({ options, value: ['zj', 'hz', 'xh'] })
    const label = triggerOf(v).props.children.find((c: any) => c?.props?.class === 'wf-cascader-value')
    assert.equal(label.props.children, '浙江 / 杭州 / 西湖区')
  })

  it('opens panel on click, shows first column', () => {
    const ctx = mockCtx()
    const render = mount(Cascader, { options }, ctx)!
    let v = render({ options })
    triggerOf(v).props.onClick()
    v = render({ options })
    const panel = panelOf(v)
    assert.ok(panel, '应显示级联面板')
    const col = panel.props.children[0]
    assert.equal(col.props.children.length, 2) // 浙江 + 广东
  })

  it('clicking parent advances to next column', () => {
    const ctx = mockCtx()
    const render = mount(Cascader, { options }, ctx)!
    let v = render({ options })
    triggerOf(v).props.onClick()
    v = render({ options })
    const panel = panelOf(v)
    const col0 = panel.props.children[0]
    // 点击浙江（有子 → 推进）
    col0.props.children[0].props.onClick()
    v = render({ options })
    const panel2 = panelOf(v)
    assert.equal(panel2.props.children.length, 2) // 两列：浙江 + 杭州/宁波
    const col1 = panel2.props.children[1]
    assert.equal(col1.props.children.length, 2)
  })

  it('clicking leaf completes selection', () => {
    let got: string[] = []
    const ctx = mockCtx()
    const render = mount(Cascader, { options, onChange: (v: string[]) => { got = v } }, ctx)!
    let v = render({ options, onChange: (v: string[]) => { got = v } })
    triggerOf(v).props.onClick()
    v = render({ options, onChange: (v: string[]) => { got = v } })
    const panel = panelOf(v)
    panel.props.children[0].props.children[1].props.onClick() // 广东
    v = render({ options, onChange: (v: string[]) => { got = v } })
    const panel2 = panelOf(v)
    panel2.props.children[1].props.children[0].props.onClick() // 深圳（叶子）
    assert.deepEqual(got, ['gd', 'sz'])
  })

  it('受控有 value 时从根重选：点广东路径必须从根算（闭包 path 快照）', () => {
    let got: string[] = []
    const ctx = mockCtx()
    const render = mount(Cascader, { options, value: ['zj', 'hz'], onChange: (v: string[]) => { got = v } }, ctx)!
    let v = render({ options, value: ['zj', 'hz'], onChange: (v: string[]) => { got = v } })
    triggerOf(v).props.onClick()
    v = render({ options, value: ['zj', 'hz'], onChange: (v: string[]) => { got = v } })
    // 列1 第2项 = 广东（点击时 path 必须为 [] 而非循环结束值 ['zj']）
    const panel = panelOf(v)
    panel.props.children[0].props.children[1].props.onClick()
    v = render({ options, value: ['zj', 'hz'], onChange: (v: string[]) => { got = v } })
    // 推进后列2 应为深圳（广东的子级）——证明 activePath 是 ['gd'] 而非 ['zj','gd']
    const panel2 = panelOf(v)
    const col1 = panel2.props.children[0]
    const col2 = panel2.props.children[1]
    const col2Texts = col2.props.children.map((b: any) => b.props.children[0].props.children)
    assert.deepEqual(col2Texts, ['深圳'], '列2 应只含深圳（广东子级）')
    col2.props.children[0].props.onClick() // 深圳（叶子）
    assert.deepEqual(got, ['gd', 'sz'])
  })

  it('disabled trigger not interactive', () => {
    const render = mount(Cascader, { options, disabled: true }, mockCtx())!
    const v = render({ options, disabled: true })
    assert.equal(triggerOf(v).props.onClick, undefined)
  })

  it('Escape closes panel（document 级，usePopup 接管）', () => {
    const ctx = mockCtx()
    const render = mount(Cascader, { options }, ctx)!
    let v = render({ options })
    triggerOf(v).props.onClick()
    v = render({ options })
    assert.ok(panelOf(v))
    ;(document as any).dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    v = render({ options })
    assert.equal(panelOf(v), undefined)
  })

  it('showSearch：关键词扁平过滤结果 + 选中提交路径', () => {
    const ctx = mockCtx()
    let picked: string[] | undefined
    const render = mount(Cascader, { options, showSearch: true, onChange: (v: string[]) => { picked = v } }, ctx)!
    let v = render({ options, showSearch: true, onChange: (v: string[]) => { picked = v } })
    triggerOf(v).props.onClick()
    // 模拟输入「宁波」
    ctx.ui.$().kw = '宁波'
    v = render({ options, showSearch: true, onChange: (v: string[]) => { picked = v } })
    const panel = panelOf(v)
    assert.ok(panel, '面板打开')
    // 搜索框 + 结果列表
    const s = JSON.stringify(panel)
    assert.ok(s.includes('wf-cascader-search'), '搜索框渲染')
    assert.ok(s.includes('宁波'), '匹配结果含宁波')
    assert.ok(!s.includes('杭州'), '不匹配的兄弟过滤')
    // 点击结果项提交路径
    const findItem = (n: any): any => {
      if (!n || typeof n !== 'object') return null
      if (n.props?.class === 'wf-cascader-search-item') return n
      const k = n.props?.children
      const arr = Array.isArray(k) ? k : (k && typeof k === 'object' ? [k] : [])
      for (const c of arr) { const f = findItem(c); if (f) return f }
      return null
    }
    const item = findItem(panel)
    assert.ok(item, '结果项存在')
    item.props.onClick()
    assert.deepEqual(picked, ['zj', 'nb'], '提交完整路径')
  })
})
