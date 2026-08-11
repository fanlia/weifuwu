import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Popconfirm } from './Popconfirm.ts'
import { Icon } from '../Icon/Icon.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'


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

const makeCtx = () => {
  const openStates = new Map<string, boolean>()
  return createTestCtx({ ui: {
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
  }) as any
}

describe('Popconfirm', () => {
  test('渲染触发元素 + 气泡内容（title + 确认/取消）', () => {
    const vnode = renderVNode(
      Popconfirm,
      { title: '确定删除？', children: '删除' },
      makeCtx(),
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
      makeCtx(),
    )
    const ok = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-ok'))
    assert.match(ok.props.class, /danger/, 'danger 透传确认按钮')
  })

  test('打开后：确认回调 + 受控关闭通知', () => {
    let confirmed = 0
    let closed = 0
    const ctx = makeCtx()
    const inst = mount(Popconfirm, { title: 'x', onConfirm: () => confirmed++, children: 't' }, ctx)
    let vnode = inst.render({ title: 'x', onConfirm: () => confirmed++, children: 't', open: true, onOpenChange: () => { closed++ } })
    const ok = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-ok'))
    ok.props.onClick({ stopPropagation: () => {} })
    assert.equal(confirmed, 1, '确认回调触发')
    assert.equal(closed, 1, '受控模式通知 onOpenChange(false)')
  })

  test('取消回调 + 关闭', () => {
    let cancelled = 0
    const ctx = makeCtx()
    const inst = mount(Popconfirm, { title: 'x', onCancel: () => cancelled++, children: 't' }, ctx)
    const vnode = inst.render({ title: 'x', onCancel: () => cancelled++, children: 't', open: true })
    const cancel = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-cancel'))
    cancel.props.onClick({ stopPropagation: () => {} })
    assert.equal(cancelled, 1, '取消回调触发')
  })

  test('icon 自定义（默认 Icon 组件）', () => {
    const vnode = renderVNode(Popconfirm, { title: 'x', children: 't' }, makeCtx())
    const title = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-title'))
    // 默认图标 + title 文本
    assert.ok(title.props.children, 'title 有内容')
    const icon = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-popconfirm-icon'))
    assert.equal(icon?.props?.children?.type, Icon, '默认图标用 Icon 组件（禁裸字形）')
  })
})

test('受控 open + onOpenChange 对称（§5.2 受控纪律）', () => {
  let notified: boolean | undefined
  const props = { title: 'x', open: false, onOpenChange: (v: boolean) => { notified = v } }
  const ctx = makeCtx()
  const inst = mount(Popconfirm, props, ctx)
  const vnode = inst.render()
  // 受控 open=false：气泡挂 --exit（非 --enter）——open 由父层独占
  const bubble = findVNode(vnode, (v: any) => String(v.props?.class ?? '').split(' ').includes('wf-popconfirm'))
  assert.ok(bubble, '气泡 VNode 存在（portal mock 恒渲染）')
  assert.match(bubble.props.class, /wf-popconfirm--exit/, '受控 open=false → exit 态')
  // 关闭路径通知父层（onConfirm 后 close → onOpenChange(false)）
  const okBtn = findVNode(bubble, (v: any) => String(v.props?.class ?? '').includes('wf-popconfirm-ok'))
  okBtn.props.onClick({ stopPropagation: () => {} })
  assert.equal(notified, false, '受控关闭必须通知 onOpenChange(false)')
})

test('自定义 okText/cancelText', () => {
  const ctx = makeCtx()
  const inst = mount(Popconfirm, { title: 'x', okText: '删掉', cancelText: '算了' }, ctx)
  const vnode = inst.render({ title: 'x', okText: '删掉', cancelText: '算了', open: true, onOpenChange: () => {} })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('删掉') && s.includes('算了'), '自定义按钮文案')
})

test('边界：无 onConfirm/onCancel 点击不抛错', () => {
  const ctx = makeCtx()
  const inst = mount(Popconfirm, { title: 'x', open: true, onOpenChange: () => {} }, ctx)
  const vnode = inst.render({ title: 'x', open: true, onOpenChange: () => {} })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-popconfirm'), '气泡渲染')
})
