/**
 * 占位互换：Fragment/数组项 ↔ false/null 残留（wf-hole 与多节点输出的交互）
 *
 * 真实场景：`{cond ? <Fragment>多节点</Fragment> : false}` / `{cond ? items.map(...) : false}`
 * 条件消失时——patchChildren「真实 → 占位」分支只 `replaceChild(hole, 锚点)`：
 * - Fragment → false：锚点 = _childNodes[0]，Fragment 其余节点（f1/f2）残留
 * - 数组项 → false：锚点 = fragment-start 标记，数组内容 + end 标记残留
 * → DOM 与 vnode 不一致（vnode 已是 hole，DOM 还挂着旧内容）
 *
 * 断言：Frag/数组项 → false（残留归零，仅 hole）→ 恢复（内容回归原位）完整循环。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h, Fragment } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/vdom/mount.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

function domSeq(el: Element): string[] {
  return [...el.childNodes].map((n) =>
    n.nodeType === 1 ? n.tagName + '#' + (n.id || '')
    : n.nodeType === 8 ? '<!--' + (n.nodeValue || '').slice(0, 30) + '-->'
    : '#' + n.nodeType
  )
}

test('Fragment ↔ false：消失无残留，恢复原位', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let show = true
    const toggle = () => { show = !show; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h('div', { id: 'head', onClick: toggle }, 'h'),
        show
          ? h(Fragment, {}, h('div', { id: 'f1' }, 'F1'), h('div', { id: 'f2' }, 'F2'))
          : false,
        h('div', { id: 'tail' }, 't'),
      )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  let seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(seq.indexOf('DIV#head') < seq.indexOf('DIV#f1') && seq.indexOf('DIV#f2') < seq.indexOf('DIV#tail'),
    `首帧 Frag 渲染: ${seq.join(' | ')}`)

  // Frag → false：f1/f2 移除，hole 占位在 head 与 tail 之间
  ;(container.querySelector('#head') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(!seq.some((s) => s.includes('DIV#f1') || s.includes('DIV#f2')), `r1 Frag 残留: ${seq.join(' | ')}`)
  assert.ok(seq.indexOf('DIV#head') < seq.length - 1 && seq.indexOf('DIV#tail') === seq.length - 1,
    `r1 hole 占位在 head 与 tail 间: ${seq.join(' | ')}`)

  // false → Frag：恢复
  ;(container.querySelector('#head') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(seq.indexOf('DIV#f1') >= 0 && seq.indexOf('DIV#f1') < seq.indexOf('DIV#f2') && seq.indexOf('DIV#f2') < seq.indexOf('DIV#tail'),
    `r2 Frag 恢复: ${seq.join(' | ')}`)

  handle.close?.()
  document.body.removeChild(container)
})

test('数组项 ↔ false：消失无残留，恢复原位', async () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })

  const Comp = async (_init: any, c: any) => {
    let show = true
    const toggle = () => { show = !show; c.ui.render() }
    return () =>
      h('div', { id: 'wrap' },
        h('div', { id: 'head', onClick: toggle }, 'h'),
        show ? ['A', 'B'].map((e) => h('button', { key: e, id: 'b-' + e }, e)) : false,
        h('div', { id: 'tail' }, 't'),
      )
  }

  await handle.mount(h('div', {}, h(Comp, {})))
  let seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(seq.findIndex((s) => s.includes('b-A')) < seq.indexOf('DIV#tail'), `首帧数组项: ${seq.join(' | ')}`)

  // 数组项 → false：按钮/标记移除，hole 占位
  ;(container.querySelector('#head') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(!seq.some((s) => s.includes('b-A') || s.includes('b-B') || s.includes('fragment')),
    `r1 数组项残留: ${seq.join(' | ')}`)
  assert.ok(seq.indexOf('DIV#head') < seq.length - 1 && seq.indexOf('DIV#tail') === seq.length - 1,
    `r1 hole 占位: ${seq.join(' | ')}`)

  // false → 数组项：恢复
  ;(container.querySelector('#head') as HTMLElement).click()
  await new Promise((r) => setTimeout(r, 30))
  seq = domSeq(container.querySelector('#wrap')!)
  assert.ok(seq.findIndex((s) => s.includes('b-A')) >= 0 && seq.findIndex((s) => s.includes('b-A')) < seq.indexOf('DIV#tail'),
    `r2 数组项恢复: ${seq.join(' | ')}`)

  handle.close?.()
  document.body.removeChild(container)
})
