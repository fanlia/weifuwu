import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Tour } from './Tour.ts'
import { renderVNode } from '../../ui-dom/testing.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'


const makeCtx = () => {
  let keyHandler: ((e: any) => void) | null = null
  return createTestCtx({ ui: {
      $: () => ({}),
      render: () => {},
      dirty: () => {},
      usePopupPosition: () => ({ top: 100, left: 200, refresh: () => {} }),
      useGlobalKey: (fn: (e: any) => void) => { keyHandler = fn },
      _keyHandler: () => keyHandler,
    },
    browser: { query: () => null, activeElement: () => null },
  }) as any
}

const steps = [
  { target: '#btn-1', title: '第一步', content: '点击此按钮开始', placement: 'bottom' as const },
  { target: '#btn-2', title: '第二步', content: '然后这里', placement: 'right' as const },
  { target: '#btn-3', title: '第三步', content: '最后一步', placement: 'top' as const },
]

describe('Tour 组件', () => {
  test('关闭时不渲染（null）', async () => {
    const vnode = await renderVNode(Tour, { steps, open: false }, makeCtx())
    assert.equal(vnode, null)
  })

  test('打开渲染 Portal（遮罩 + 气泡）', async () => {
    const vnode = await renderVNode(Tour, { steps, open: true }, makeCtx())
    assert.ok(vnode, 'open 时非 null')
    // 检查遮罩元素（Portal vnode 的 props.children 内）
    const str = JSON.stringify(vnode)
    assert.match(str, /wf-tour-mask/, '应有遮罩')
    assert.match(str, /wf-tour-bubble/, '应有气泡')
  })

  test('步骤内容渲染：第一步标题 + 进度', async () => {
    const vnode = await renderVNode(Tour, { steps, open: true }, makeCtx())
    const str = JSON.stringify(vnode)
    assert.match(str, /第一步/, '第一步标题')
    assert.match(str, /1 \/ 3|1\/3/, '进度 1/3')
  })

  test('next 按钮 → onStepChange(1) 或内部推进', async () => {
    let step = 0
    const ctx = makeCtx()
    const vnode = await renderVNode(
      Tour,
      { steps, open: true, onStepChange: (s: number) => { step = s } },
      ctx,
    )
    // 找到 next 按钮并触发 onClick
    const nextBtn = findButton(vnode, /下一步|Next/)
    assert.ok(nextBtn, '应有下一步按钮')
    nextBtn.props.onClick()
    assert.equal(step, 1, 'onStepChange 回调收到新步骤')
  })

  test('最后一步 next → onFinish 回调', async () => {
    let finished = false
    const vnode = await renderVNode(
      Tour,
      { steps, open: true, current: 2, onFinish: () => { finished = true } },
      makeCtx(),
    )
    const nextBtn = findButton(vnode, /完成|Done/)
    assert.ok(nextBtn, '最后一步按钮文案应为「完成」')
    nextBtn.props.onClick()
    assert.equal(finished, true)
  })

  test('prev 按钮 → onStepChange(0)', async () => {
    let step = 1
    const vnode = await renderVNode(
      Tour,
      { steps, open: true, current: 1, onStepChange: (s: number) => { step = s } },
      makeCtx(),
    )
    const prevBtn = findButton(vnode, /上一步|Prev/)
    assert.ok(prevBtn, '应有上一步按钮')
    prevBtn.props.onClick()
    assert.equal(step, 0)
  })

  test('Escape 关闭 → onChange(false)', async () => {
    let open = true
    const ctx = makeCtx()
    await renderVNode(
      Tour,
      { steps, open, onChange: (v: boolean) => { open = v } },
      ctx,
    )
    const keyHandler = ctx.ui._keyHandler()
    assert.ok(keyHandler, '应有全局 Escape 处理')
    keyHandler({ key: 'Escape', preventDefault: () => {} })
    assert.equal(open, false)
  })

  test('跳过按钮 → onFinish（或 onChange false）', async () => {
    let finished = false
    const vnode = await renderVNode(
      Tour,
      { steps, open: true, onFinish: () => { finished = true } },
      makeCtx(),
    )
    const skipBtn = findButton(vnode, /跳过|Skip/)
    assert.ok(skipBtn, '应有跳过按钮')
    skipBtn.props.onClick()
    assert.equal(finished, true)
  })

  test('受控 open 遵循 props（不内部开）', async () => {
    const vnode = await renderVNode(Tour, { steps, open: true }, makeCtx())
    assert.notEqual(vnode, null)
    // 非受控（不传 open）默认关闭
    const vnode2 = await renderVNode(Tour, { steps }, makeCtx())
    assert.equal(vnode2, null)
  })

  test('placement 传给气泡', async () => {
    const vnode = await renderVNode(Tour, { steps, open: true }, makeCtx())
    const str = JSON.stringify(vnode)
    assert.match(str, /wf-tour-bubble--bottom/, '气泡带 placement 类')
  })
})

function findButton(vnode: any, re: RegExp): any | null {
  const str = JSON.stringify(vnode)
  if (!str) return null
  return findIn(vnode, (v: any) =>
    v?.props?.class?.includes?.('wf-tour-btn') && re.test(String(v?.props?.children ?? '')),
  )
}

function findKeyHandler(vnode: any): ((e: any) => void) | null {
  return findIn(vnode, (v: any) => v?.props?.onKeyDown)?.props?.onKeyDown ?? null
}

function findIn(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const found = findIn(k, pred)
      if (found) return found
    }
  } else if (kids && typeof kids === 'object') {
    return findIn(kids, pred)
  }
  return null
}
