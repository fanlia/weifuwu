/**
 * 任意嵌套数组结构可还原性验证：DOM（含 wf-hole 边界标记）→ 反向解析 → 用户原始数组结构
 *
 * 信息完备性：fid 配对（start/end）+ type + key + value——DOM 是用户 JSX 的完备镜像。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { h } from '../ui-dom/vnode.ts'
import { setupJsdom } from './client/setup.ts'
import { createVdomContext, mountRoot } from '../ui-dom/context.ts'
import { createClientBrowser } from '../ui-dom/browser.ts'

before(setupJsdom)

/** 从 DOM childNodes 还原数组结构（含嵌套数组项——fid 配对） */
function reconstruct(nodes: Node[]): any[] {
  const out: any[] = []
  let i = 0
  while (i < nodes.length) {
    const n = nodes[i]
    if (n.nodeType === 8) {
      const v = n.nodeValue ?? ''
      if (v.includes('type=fragment-start')) {
        // 数组项开始：找同 fid 的 end（嵌套 start 跳过——fid 精确配对）
        const fid = /fid=([^\s"]+)/.exec(v)?.[1]
        const inner: Node[] = []
        let depth = 1
        i++
        while (i < nodes.length) {
          const cn = nodes[i]
          if (cn.nodeType === 8) {
            const cv = cn.nodeValue ?? ''
            if (cv.includes('type=fragment-start')) depth++
            else if (cv.includes('type=fragment-end')) {
              const efid = /fid=([^\s"]+)/.exec(cv)?.[1]
              depth--
              if (depth === 0 && efid === fid) { i++; break }
            }
          }
          inner.push(cn)
          i++
        }
        out.push(reconstruct(inner))
        continue
      }
      if (v.includes('type=hole')) {
        const value = /value=("(?:[^"]*)"|[^\s]+)/.exec(v)?.[1] ?? ''
        out.push(value.startsWith('"') ? value.slice(1, -1) : value)
        i++
        continue
      }
      i++
      continue
    }
    if (n.nodeType === 3) { out.push(`text:${n.textContent}`); i++; continue }
    const el = n as Element
    out.push(`<${el.tagName.toLowerCase()}>`)
    i++
  }
  return out
}

async function renderTree(v: any): Promise<Node[]> {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const browser = createClientBrowser()
  const { ctx } = createVdomContext({ root: container, browser })
  const handle = mountRoot({ root: container, ctx, browser })
  await handle.mount(v)
  const nodes = [...container.querySelector('div')!.childNodes]
  handle.close?.()
  document.body.removeChild(container)
  return nodes
}

test('[[a,b],[c,d,[e,f]],x] 三层嵌套 → 还原一致', async () => {
  const mk = (id: string) => h('i', { id })
  const nodes = await renderTree(h('div', {}, [[mk('a'), mk('b')], [mk('c'), mk('d'), [mk('e'), mk('f')]], mk('x')]))
  const tree = reconstruct(nodes)
  assert.deepEqual(tree, [['<i>', '<i>'], ['<i>', '<i>', ['<i>', '<i>']], '<i>'],
    `三层嵌套还原: ${JSON.stringify(tree)}`)
})

test('含占位/文本：[[a,false],null,[c,d]] → 还原（值保真）', async () => {
  const mk = (id: string) => h('i', { id })
  const nodes = await renderTree(h('div', {}, [[mk('a'), false], null, [mk('c'), mk('d')], 'tail']))
  const tree = reconstruct(nodes)
  assert.deepEqual(tree, [['<i>', 'false'], 'null', ['<i>', '<i>'], 'text:tail'],
    `占位/文本还原: ${JSON.stringify(tree)}`)
})

test('深层嵌套 4 层：[[[[a]]],[b,[c,[d]]]] → 还原', async () => {
  const mk = (id: string) => h('i', { id })
  const nodes = await renderTree(h('div', {}, [[[[mk('a')]]], [mk('b'), [mk('c'), [mk('d')]]]]))
  const tree = reconstruct(nodes)
  assert.deepEqual(tree, [[[['<i>']]], ['<i>', ['<i>', ['<i>']]]],
    `4 层嵌套还原: ${JSON.stringify(tree)}`)
})

test('闭环：DOM → 还原结构 → 重渲染 → DOM 一致（可推导性 by construction）', async () => {
  const mk = (id: string) => h('i', { id })
  const v1 = h('div', {}, [[mk('a'), mk('b')], [mk('c'), mk('d'), [mk('e'), mk('f')]], false, [mk('g')], 'tail'])
  // 首次渲染
  const c1 = document.createElement('div')
  document.body.appendChild(c1)
  const b1 = createClientBrowser()
  const vc1 = createVdomContext({ root: c1, browser: b1 })
  const h1 = mountRoot({ root: c1, ctx: vc1.ctx, browser: b1 })
  await h1.mount(v1)
  const snapshot1 = [...c1.querySelector('div')!.childNodes].map(n => n.nodeType === 8 ? `📄${n.nodeValue}` : n.nodeType === 3 ? `✏${n.textContent}` : `🏷${(n as Element).tagName}`).join('|')
  // 还原
  const tree = reconstruct([...c1.querySelector('div')!.childNodes])
  // 还原结构重渲染
  const c2 = document.createElement('div')
  document.body.appendChild(c2)
  const b2 = createClientBrowser()
  const vc2 = createVdomContext({ root: c2, browser: b2 })
  const h2 = mountRoot({ root: c2, ctx: vc2.ctx, browser: b2 })
  // 用还原结构构造等价 JSX（递归：元素项→h('i')，占位值→原值，文本→字符串）
  const revive = (t: any): any =>
    Array.isArray(t) ? t.map(revive)
    : t === 'false' ? false
    : t === 'null' ? null
    : typeof t === 'string' && t.startsWith('text:') ? t.slice(5)
    : typeof t === 'string' && t.startsWith('<') ? h('i', {})
    : t
  await h2.mount(h('div', {}, tree.map(revive)))
  const snapshot2 = [...c2.querySelector('div')!.childNodes].map(n => n.nodeType === 8 ? `📄${n.nodeValue}` : n.nodeType === 3 ? `✏${n.textContent}` : `🏷${(n as Element).tagName}`).join('|')
  // fid 为位置路径（确定性）——两次渲染同结构 → 同 fid → 快照一致
  assert.equal(snapshot2, snapshot1, `闭环一致: ${snapshot1}`)
  h1.close?.(); h2.close?.()
  document.body.removeChild(c1)
  document.body.removeChild(c2)
})
