/**
 * vdom v2 — 集成验证（v2 命令流 → HTML——SSR 等价）
 *
 * VDOM-V2-BLUEPRINT 阶段 2A：v2 HTML ≡ v1 HTML（多种子——SSR 链路等价）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import type { VNode } from '../../client/vdom/core/vnode.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { commandToHtml } from '../../client/vdom/core/ssr/html.ts'
import { v2ToHtml } from '../../client/vdom/core/v2/integrate.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

async function v1ToHtml(root: VNode): Promise<string> {
  const reader = renderToStream(root, emptyCtx).pipeThrough(commandToHtml()).getReader()
  let out = ''
  if (reader) {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      out += value
    }
  }
  return out
}

test('SSR 等价：元素/文本/属性（v1 HTML == v2 HTML）', async () => {
  const root = h('div', { class: 'a', 'data-x': '1' }, [
    h('span', { id: 's' }, '你好'),
    h('b', {}, 'world'),
  ]) as VNode
  assert.equal(await v2ToHtml(root, emptyCtx), await v1ToHtml(root))
})

test('SSR 等价：组件嵌套（输出展开）', async () => {
  const Inner: any = (_p: any, _c: any) => () => h('em', { class: 'i' }, 'in')
  const root = h('div', {}, [h(Inner, {}), h('span', {}, 'x')]) as VNode
  assert.equal(await v2ToHtml(root, emptyCtx), await v1ToHtml(root))
})

test('SSR 等价：空洞（hole 占位）', async () => {
  const root = h('div', {}, [null, h('span', {}, 'a'), false]) as VNode
  const v1 = await v1ToHtml(root)
  const v2 = await v2ToHtml(root, emptyCtx)
  assert.equal(v2, v1)
})

test('SSR 等价：数组/Fragment 展开', async () => {
  const root = h('div', {}, [
    [h('i', {}, 'a'), h('i', {}, 'b')],
    h('>', {}, [h('i', {}, 'c')]),
  ]) as VNode
  assert.equal(await v2ToHtml(root, emptyCtx), await v1ToHtml(root))
})

test('SSR 等价：随机树多种子（20 对——fuzz）', async () => {
  let seed = 7
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const mkTree = (depth: number): any => {
    if (depth <= 0 || rnd() < 0.3) return rnd() < 0.5 ? 't' + Math.floor(rnd() * 5) : null
    const n = 1 + Math.floor(rnd() * 3)
    const children = Array.from({ length: n }, () => mkTree(depth - 1))
    return h(['div', 'span', 'p'][Math.floor(rnd() * 3)], rnd() < 0.4 ? { 'data-k': String(Math.floor(rnd() * 3)) } : {}, children)
  }
  let mismatch = 0
  let sample = ''
  for (let i = 0; i < 20; i++) {
    const root = mkTree(3)
    const a = await v1ToHtml(root)
    const b = await v2ToHtml(root, emptyCtx)
    if (a !== b) { mismatch++; if (!sample) sample = `i=${i}\n  v1: ${a.slice(0, 120)}\n  v2: ${b.slice(0, 120)}` }
  }
  assert.equal(mismatch, 0, `v1/v2 HTML 不等价 ${mismatch}/20\n${sample}`)
})
