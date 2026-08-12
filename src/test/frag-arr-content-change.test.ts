/**
 * 数组项内容变化：ARR(0) → ARR(2) 递归 diff 新增位置（agent-platform 复现）
 *
 * 真实事故：AgentDetail 工作空间文件区首帧（wsEntries=[] → 空数组 ARR(0)）→ loadWsList 完成
 * （wsEntries=[src,README] → ARR(2)）——新数组项内容（文件按钮）被插到 Card children **最前**，
 * DOM = [btn-src, btn-README, 面包屑, ...]（应为 [面包屑, ..., fragment-start, btn-src, btn-README, fragment-end]）。
 *
 * 根因（trace 定位，2026-12）：
 * - 数组项配对分支（Array.isArray(oldC) && Array.isArray(newC)）递归
 *   `patchChildren(parent, oldC=[], newC=[btn...], ctx, range=[start,end])`
 * - 递归内层 newChildren 有显式 key（文件按钮 key=name）→ **keyed 分支**
 * - keyed 分支「新增」逻辑：`lastDom=null`（无旧匹配）→ `parent.insertBefore(node, parent.firstChild)`
 *   → 插到容器最前（parent = Fragment children 容器）——完全忽略 oldRange（旧数组项范围）的位置
 * - allUnkeyed 分支同样问题：next 查找失败 → `parent.appendChild(node)` → 插到容器末尾
 *
 * 断言：数组项内容从空→非空→增删后，新内容必须出现在旧数组项范围位置（面包屑之后），而非容器首/尾。
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

test('数组项 ARR(0)→ARR(2)→ARR(1)→ARR(3)：新增/移除内容位置始终正确（事件驱动）', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let entries: string[] = []
    const load = () => { entries = ['A', 'B']; c.ui.render() }
    const addC = () => { entries = ['A', 'B', 'C']; c.ui.render() }
    const removeA = () => { entries = ['B']; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h(Card as any, {},
          h('div', { id: 'title', onClick: load }, '标题'),
          h(Fragment, {},
            h('div', { id: 'crumb' }, '面包屑'),
            false,
            false,
            entries.map((e) => h('button', { key: e, id: 'btn-' + e, onClick: e === 'A' ? removeA : addC }, e)),
          ),
          h('div', { id: 'tail' }, '尾卡片'),
        ),
      )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  const card = () => container.querySelector('.wf-card')!

  // 首帧：空数组标记在面包屑后
  let seq = domSeq(card())
  assert.ok(seq.findIndex((s) => s.includes('fragment-start')) > seq.indexOf('DIV#crumb'),
    `首帧标记在面包屑后: ${seq.join(' | ')}`)

  // ── 点击标题 → entries=['A','B']：ARR(0)→ARR(2) 递归 diff（新增插位置——本次 bug 核心） ──
  ;(container.querySelector('#title') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(card())
  const crumb = seq.indexOf('DIV#crumb')
  const btnA = seq.indexOf('BUTTON#btn-A')
  const btnB = seq.indexOf('BUTTON#btn-B')
  const tail = seq.indexOf('DIV#tail')
  assert.ok(btnA >= 0 && btnB >= 0, `r1 按钮渲染: ${seq.join(' | ')}`)
  assert.ok(crumb >= 0 && crumb < btnA && btnA < btnB && btnB < tail,
    `r1 数组项内容在面包屑后、tail 前（未插到容器最前）: ${seq.join(' | ')}`)

  // ── 点 btn-A → entries=['B']：ARR(2)→ARR(1) keyed 移除 ──
  ;(container.querySelector('#btn-A') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(card())
  assert.ok(!seq.some((s) => s.includes('btn-A')), `r2 btn-A 移除: ${seq.join(' | ')}`)
  assert.ok(seq.indexOf('DIV#crumb') < seq.indexOf('BUTTON#btn-B'), `r2 btn-B 位置: ${seq.join(' | ')}`)

  // ── 点 btn-B → entries=['A','B','C']：ARR(1)→ARR(3) 递归 diff（keyed 新增 A/C 插位置） ──
  ;(container.querySelector('#btn-B') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(card())
  const crumb3 = seq.indexOf('DIV#crumb')
  const a3 = seq.indexOf('BUTTON#btn-A')
  const b3 = seq.indexOf('BUTTON#btn-B')
  const c3 = seq.indexOf('BUTTON#btn-C')
  const tail3 = seq.indexOf('DIV#tail')
  assert.ok(crumb3 >= 0 && crumb3 < a3 && a3 < b3 && b3 < c3 && c3 < tail3,
    `r3 ARR(3) 顺序 面包屑<A<B<C<tail: ${seq.join(' | ')}`)

  handle.close?.()
  document.body.removeChild(container)
})
