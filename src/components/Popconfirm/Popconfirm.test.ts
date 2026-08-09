import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Popconfirm } from './Popconfirm.ts'
import { Icon } from '../Icon/Icon.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const found = findVNode(k, pred)
      if (found) return found
    }
  } else if (kids && typeof kids === 'object') {
    return findVNode(kids, pred)
  }
  return null
}

// mount 保持状态（usePopup setOpen 驱动内部 show）
function mount(Comp: any, props: any, ctx: any) {
  const factory = Comp({}, ctx)
  return { render: (p: any = props) => factory(p) }
}

const mockCtx = () => {
  const openStates = new Map<string, boolean>()
  return {
    ui: {
      $: () => ({}),
      render: () => {},
      dirty: () => {},
      useOpen: (opts: any) => {
        const key = opts.name ?? 'default'
        if (!openStates.has(key)) openStates.set(key, false)
        const controlled = opts.open !== undefined
        const isOpen = () => controlled ? !!opts.open : (openStates.get(key) ?? false)
        const setOpen = (v: boolean) => {
          if (controlled) opts.onOpenChange?.(v)
          else openStates.set(key, v)
        }
        return { get open() { return isOpen() }, setOpen, triggerProps: { onClick: () => setOpen(true), onFocus: () => {} } }
      },
      usePopup: (opts: any) => ({
        get open() { return opts.isOpen() },
        setOpen: opts.setOpen,
        refresh: () => {},
        wrapProps: {},
        portal: (content: any) => content,
        isOpen: opts.isOpen,
      }),
    },
  } as any
}

describe('Popconfirm', () => {
  test('渲染触发元素 + 气泡内容（title + 确认/取消）', () => {
    const vnode = renderVNode(
      Popconfirm,
      { title: '确定删除？', children: '删除' },
      mockCtx(),
    )
    const wrap = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-wrap'))
    assert.ok(wrap, '存在 wrap')
    // 气泡默认关闭
    const bubble = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-popconfirm'))
    assert.ok(bubble, '存在气泡容器')
    assert.match(bubble.props?.class, /--(enter|exit)/, '浮层 enter/exit 类成对纪律')
    const title = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-title'))
    assert.ok(title, 'title 容器存在')
    const titleText = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-title-text'))
    assert.equal(titleText.props.children, '确定删除？')
    const ok = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-ok'))
    assert.ok(ok)
    const cancel = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-cancel'))
    assert.ok(cancel)
  })

  test('danger → 确认按钮 danger 变体', () => {
    const vnode = renderVNode(
      Popconfirm,
      { title: 'x', danger: true, children: 'd' },
      mockCtx(),
    )
    const ok = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-ok'))
    assert.match(ok.props.class, /danger/, 'danger 透传确认按钮')
  })

  test('打开后：确认回调 + 受控关闭通知', () => {
    let confirmed = 0
    let closed = 0
    const ctx = mockCtx()
    const inst = mount(Popconfirm, { title: 'x', onConfirm: () => confirmed++, children: 't' }, ctx)
    let vnode = inst.render({ title: 'x', onConfirm: () => confirmed++, children: 't', open: true, onOpenChange: () => { closed++ } })
    const ok = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-ok'))
    ok.props.onClick({ stopPropagation: () => {} })
    assert.equal(confirmed, 1, '确认回调触发')
    assert.equal(closed, 1, '受控模式通知 onOpenChange(false)')
  })

  test('取消回调 + 关闭', () => {
    let cancelled = 0
    const ctx = mockCtx()
    const inst = mount(Popconfirm, { title: 'x', onCancel: () => cancelled++, children: 't' }, ctx)
    const vnode = inst.render({ title: 'x', onCancel: () => cancelled++, children: 't', open: true })
    const cancel = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-cancel'))
    cancel.props.onClick({ stopPropagation: () => {} })
    assert.equal(cancelled, 1, '取消回调触发')
  })

  test('icon 自定义（默认 Icon 组件）', () => {
    const vnode = renderVNode(Popconfirm, { title: 'x', children: 't' }, mockCtx())
    const title = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-title'))
    // 默认图标 + title 文本
    assert.ok(title.props.children, 'title 有内容')
    const icon = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-icon'))
    assert.equal(icon?.props?.children?.type, Icon, '默认图标用 Icon 组件（禁裸字形）')
  })
})
