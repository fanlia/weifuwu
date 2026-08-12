/**
 * keyed 分支位置校正：多节点 Fragment 集合整体移动（agent-platform 复现）
 *
 * 真实事故（design/vdom-trace-plan.md）：AgentDetail 文件浏览器 `{$.wsOpenFile ? <FragA> : <FragB>}`
 * ——点击文件后编辑视图错乱（edit-plain 被挤到第二个 Card 之后）。
 *
 * 根因（trace 定位，2026-12）：
 * - Card children `[div@0, Frag@1, Card@2]` 被 buildVNode 分配默认下标 key → hasUserKey=true
 *   → patchChildren 走 **keyed 分支**
 * - keyed 分支位置校正：`last = collected[last]`，`last.previousSibling !== lastDom` 时
 *   `insertBefore(last, lastDom.nextSibling)`——只移动**集合的最后一个节点**
 * - Fragment 是多节点集合（edit-plain + edit-div2）：只移 edit-div2 → 拆散 Fragment 连续区；
 *   后续 keyed 项（Card@2）的校正基于错位 lastDom 链 → edit-plain 被挤到末尾
 *
 * 断言：列表→编辑→列表→编辑 连续切换，每次 DOM 顺序正确（顺序断言，非仅存在性）。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'
import { Card } from '../components/index.ts'

before(setupJsdom)

function domSeq(el: Element): string[] {
  return [...el.childNodes].map((n) =>
    n.nodeType === 1 ? n.tagName + '#' + (n.id || '')
    : n.nodeType === 8 ? '<!--' + (n.nodeValue || '').slice(0, 30) + '-->'
    : '#' + n.nodeType
  )
}

test('Card 三元 Fragment：列表→编辑→列表→编辑 DOM 顺序始终正确', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let open: string | null = null
    const entries = [{ name: 'A' }, { name: 'B' }]
    const openFile = () => { open = 'A'; c.ui.render() }
    const back = () => { open = null; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h(Card as any, {},
          h('div', { id: 'title' }, '标题'),
          open
            ? h(Fragment, {},
                h('div', { id: 'edit-plain', onClick: back }, 'PLAIN-EDIT ' + open),
                h('div', { id: 'edit-div2' }, 'SECOND-DIV'),
              )
            : h(Fragment, {},
                h('div', { id: 'list-simple' }, 'SIMPLIFIED-LIST'),
                false,
                false,
                entries.map((e) => h('button', { key: e.name, id: 'btn-' + e.name, onClick: openFile }, e.name)),
              ),
          h('div', { id: 'tail' }, '尾卡片'),
        ),
      )
  }

  const assertOrder = (label: string) => {
    const card = container.querySelector('.wf-card')!
    const seq = domSeq(card)
    const title = seq.indexOf('DIV#title')
    const list = seq.indexOf('DIV#list-simple')
    const btnA = seq.findIndex((s) => s.includes('btn-A'))
    const btnB = seq.findIndex((s) => s.includes('btn-B'))
    const edit1 = seq.indexOf('DIV#edit-plain')
    const edit2 = seq.indexOf('DIV#edit-div2')
    const tail = seq.indexOf('DIV#tail')
    return { seq, title, list, btnA, btnB, edit1, edit2, tail }
  }

  await handle.mount(h('div', {}, h(Comp, {})))

  // ── 首帧：列表（list-simple 在按钮前，按钮在 tail 前） ──
  let o = assertOrder('f0')
  assert.ok(o.title === 0, `首帧 title 首位: ${o.seq.join(' | ')}`)
  assert.ok(o.list >= 0 && o.list < o.btnA && o.btnA < o.btnB && o.btnB < o.tail,
    `首帧列表顺序 list<btnA<btnB<tail: ${o.seq.join(' | ')}`)

  // ── 列表 → 编辑：edit-plain 在 edit-div2 前，都在 tail 前 ──
  ;(container.querySelector('#btn-A') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  o = assertOrder('r1')
  assert.ok(o.edit1 >= 0 && o.edit1 < o.edit2 && o.edit2 < o.tail,
    `r1 编辑顺序 edit-plain<edit-div2<tail: ${o.seq.join(' | ')}`)
  assert.ok(!o.seq.some((s) => s.includes('list-simple')), `r1 列表移除: ${o.seq.join(' | ')}`)

  // ── 编辑 → 编辑（同结构 rerender——数据刷新场景，顺序不得漂移） ──
  await ctx.ui.render()
  await new Promise((r) => setTimeout(r, 30))
  o = assertOrder('r2')
  assert.ok(o.edit1 >= 0 && o.edit1 < o.edit2 && o.edit2 < o.tail,
    `r2 编辑顺序保持: ${o.seq.join(' | ')}`)

  // ── 编辑 → 列表：列表恢复且顺序正确 ──
  ;(container.querySelector('#edit-plain') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  o = assertOrder('r3')
  assert.ok(o.list >= 0 && o.list < o.btnA && o.btnA < o.btnB && o.btnB < o.tail,
    `r3 列表恢复顺序: ${o.seq.join(' | ')}`)
  assert.ok(!o.seq.some((s) => s.includes('edit-plain')), `r3 编辑移除: ${o.seq.join(' | ')}`)

  // ── 列表 → 编辑（第二次切换——锚点错位残留会在此暴露） ──
  ;(container.querySelector('#btn-B') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  o = assertOrder('r4')
  assert.ok(o.edit1 >= 0 && o.edit1 < o.edit2 && o.edit2 < o.tail,
    `r4 二次编辑顺序: ${o.seq.join(' | ')}`)

  handle.close?.()
  document.body.removeChild(container)
})
