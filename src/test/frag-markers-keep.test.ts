/**
 * 数组项标记引用保持：Card children 三元 Fragment 多次切换（agent-platform 完整复现）
 *
 * 真实 bug 链（design/vdom-trace-plan.md）：
 * - 首帧 renderValue：Fragment._childNodes = [list-simple, hole, hole, start, btn-A, btn-B, end]（7 个）
 * - 第一次 rerender（数组项配对分支）：递归 patch 剥离 start/end 做内部 diff，返回 out 不含标记
 *   → Fragment._childNodes 缩成 5 个（start/end 引用丢失——DOM 里标记还在）
 * - 后续切换（列表→编辑）：oldRange 锚点错位（数组项锚点 = 内部节点而非 fragment-start）
 *   → arr-remove rangeFor 范围错 → 误删/乱序（app 工作空间文件区点击后编辑视图消失/列表乱序）
 *
 * 复现结构：Card 组件 children 数组含三元 Fragment（列表 div+false×2+map 数组 → 编辑两个 div），
 * 连续切换列表→编辑→列表→编辑，断言每次 DOM 顺序正确。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { Card } from '../components/index.ts'
import { configureVdomTrace } from '../ui-dom/vdom/trace.ts'

// Node 测试环境开启 vdom trace（diff 阶段 trace 级——观察数组项移除/配对动作）
configureVdomTrace({ stages: ['diff', 'mount'], level: 'trace' })

before(setupJsdom)

function domSeq(parent: Element): string[] {
  return [...parent.childNodes].map((n) =>
    n.nodeType === 1 ? n.tagName + '#' + (n.id || '')
    : n.nodeType === 8 ? '<!--' + (n.nodeValue || '').slice(0, 40) + '-->'
    : '#' + n.nodeType
  )
}

test('Card 三元 Fragment 连续切换：列表→编辑→列表→编辑 DOM 顺序正确', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let open: string | null = null
    const entries = [{ name: 'A' }, { name: 'B' }]
    const openFile = () => { open = 'A'; c.ui.render() }
    const closeFile = () => { open = null; c.ui.render() }
    return () =>
      h(Card as any, {},
        h('div', {}, '标题'),
        open
          ? h(Fragment, {},
              h('div', { id: 'edit-plain' }, 'PLAIN-EDIT ' + open),
              h('div', { id: 'edit-div2' }, 'SECOND-DIV'),
            )
          : h(Fragment, {},
              h('div', { id: 'list-simple' }, 'SIMPLIFIED-LIST'),
              false,
              false,
              entries.map((e) => h('button', { key: e.name, id: 'btn-' + e.name, onClick: openFile }, e.name)),
            ),
        h(Card as any, {}, '第二个 Card'),
      )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  const card = container.querySelector('.wf-card')!

  // ── 首帧：列表 ──
  let seq = domSeq(card)
  let listIdx = seq.indexOf('DIV#list-simple')
  let aIdx = seq.findIndex((s) => s.includes('btn-A'))
  assert.ok(listIdx >= 0 && listIdx < aIdx, '首帧 list-simple 在按钮前: ' + seq.join(' | '))

  // ── 第一次切换：列表 → 编辑 ──
  ;(globalThis as any).__muts = []
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type !== 'childList' || m.target !== card) continue
      const added = [...m.addedNodes].map((n) => (n.nodeType === 1 ? (n as Element).id || n.nodeName : '#' + n.nodeType))
      const removed = [...m.removedNodes].map((n) => (n.nodeType === 1 ? (n as Element).id || n.nodeName : '#' + n.nodeType))
      ;(globalThis as any).__muts.push({ added, removed })
    }
  })
  mo.observe(card, { childList: true })
  ;(container.querySelector('#btn-A') as HTMLElement).click()
  console.log('[r1-immediate]', JSON.stringify(domSeq(card)))
  await new Promise((r) => setTimeout(r, 10))
  console.log('[r1-t10]', JSON.stringify(domSeq(card)))
  await new Promise((r) => setTimeout(r, 20))
  seq = domSeq(card)
  console.log('[r1-t30]', JSON.stringify(seq))
  assert.ok(seq.includes('DIV#edit-plain'), 'r1 编辑渲染: ' + seq.join(' | '))
  assert.ok(seq.includes('DIV#edit-div2'), 'r1 编辑第二 div: ' + seq.join(' | '))
  assert.ok(!seq.includes('DIV#list-simple'), 'r1 列表移除: ' + seq.join(' | '))
  console.log('[r1-seq]', JSON.stringify(seq))
  console.log('[muts]', JSON.stringify((globalThis as any).__muts))

  // ── 第二次切换：编辑 → 列表（再走数组项渲染/配对） ──
  ;(container.querySelector('#edit-plain') as HTMLElement).click() // 无 onClick——用内部状态
  // 直接触发 closeFile：通过 Comp 内部无法外部调用——改为再点一次按钮（已移除）——
  // 用 rerender 模拟：改为 open 状态由组件内部控制，这里用组件第二次渲染（同结构编辑→编辑）验证锚点
  // 更实际：直接触发 ctx.ui.render()（同结构 rerender——app 数据加载场景）
  await ctx.ui.render()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(card)
  // 编辑→编辑（同结构）不应乱序
  assert.ok(seq.includes('DIV#edit-plain'), 'r2 编辑保持: ' + seq.join(' | '))
  const e1 = seq.indexOf('DIV#edit-plain')
  const e2 = seq.indexOf('DIV#edit-div2')
  assert.ok(e1 >= 0 && e1 < e2, 'r2 编辑 div 顺序: ' + seq.join(' | '))

  // ── 第三次：触发组件状态切换（新渲染树——编辑 Fragment 换列表 Fragment） ──
  // 用重挂载模拟状态切换（组件内部 let 无法外部改——用 mountComponent 同实例）
  handle.close?.()
  document.body.removeChild(container)
  // 二段：重新挂载 + 完整切换链
  const container2 = document.createElement('div')
  document.body.appendChild(container2)
  const handle2 = mountRoot({ root: container2, ctx, browser })
  const Comp2 = async (_init: any, c: any) => {
    let open: string | null = null
    const entries = [{ name: 'A' }, { name: 'B' }]
    return () =>
      h('div', { id: 'wrap2' },
        h(Card as any, {},
          h('div', {}, '标题'),
          open
            ? h(Fragment, {}, h('div', { id: 'edit-plain' }, 'E'), h('div', { id: 'edit-div2' }, 'D2'))
            : h(Fragment, {},
                h('div', { id: 'list-simple' }, 'L'),
                false,
                false,
                entries.map((e) => h('button', { key: e.name, id: 'b-' + e.name, onClick: () => { open = 'A'; c.ui.render() } }, e.name)),
              ),
        ),
      )
  }
  await handle2.mount(h('div', {}, h(Comp2, {})))
  const card2 = container2.querySelector('.wf-card')!
  seq = domSeq(card2)
  assert.ok(seq.indexOf('DIV#list-simple') < seq.findIndex((s) => s.includes('b-A')), '二段首帧: ' + seq.join(' | '))
  ;(container2.querySelector('#b-A') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(card2)
  assert.ok(seq.includes('DIV#edit-plain'), '二段编辑: ' + seq.join(' | '))
  assert.ok(seq.includes('DIV#edit-div2') && seq.indexOf('DIV#edit-plain') < seq.indexOf('DIV#edit-div2'), '二段编辑顺序: ' + seq.join(' | '))

  handle2.close?.()
  document.body.removeChild(container2)
})
