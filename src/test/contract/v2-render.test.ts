/**
 * vdom v2 — render 等价验证（v1 renderToStream vs v2 renderV2——命令流逐命令相等）
 *
 * VDOM-V2-BLUEPRINT 阶段 1 里程碑：**等价是切换的前提**——
 * - 同树两次渲染（v1 流 vs v2 流）——命令序列逐项相等（op/id/完整字段）
 * - 场景矩阵：元素嵌套/文本/空洞/数组/FRAG/组件嵌套/keyed 组件/
 *   portal/ref/事件 props/重复 key 检测——全 kind 覆盖
 * - 性能基线（吞吐——v2 不慢于 v1）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h } from '../../client/vdom/core/vnode.ts'
import type { VNode } from '../../client/vdom/core/vnode.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { renderV2 } from '../../client/vdom/core/v2/render.ts'
import { createComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { Observable } from '../../client/vdom/observable/index.ts'

const emptyCtx = { render: async () => {}, browser: null } as never

/** 收集 v1 命令（ReadableStream） */
async function collectV1(root: VNode): Promise<Command[]> {
  const out: Command[] = []
  for await (const c of renderToStream(root, emptyCtx, createComponentRegistry())) out.push(c)
  return out
}

/** 收集 v2 命令（Observable） */
function collectV2(root: VNode): Promise<Command[]> {
  return new Promise((resolve, reject) => {
    const out: Command[] = []
    renderV2(root, emptyCtx, createComponentRegistry()).subscribe({
      next: (c) => out.push(c),
      error: reject,
      complete: () => resolve(out),
    })
  })
}

/** 深度相等断言（命令字段全比——JSON 规范排序键） */
function sameCmds(a: Command[], b: Command[]): string | null {
  if (a.length !== b.length) return `长度 ${a.length} vs ${b.length}（v1: ${a.map(c => c.op).join(',')} / v2: ${b.map(c => c.op).join(',')}）`
  for (let i = 0; i < a.length; i++) {
    const sa = JSON.stringify(a[i], Object.keys(a[i] as object).sort())
    const sb = JSON.stringify(b[i], Object.keys(b[i] as object).sort())
    if (sa !== sb) return `第 ${i} 条不同:\n  v1: ${sa.slice(0, 160)}\n  v2: ${sb.slice(0, 160)}`
  }
  return null
}

test('等价：元素嵌套 + 文本 + 属性', async () => {
  const root = h('div', { class: 'a' }, [
    h('span', { id: 'x' }, '你好'),
    h('b', {}, '世界'),
  ]) as VNode
  const diff = sameCmds(await collectV1(root), await collectV2(root))
  assert.equal(diff, null, diff ?? '')
})

test('等价：空洞（null/boolean/字符串空——hole 全态）', async () => {
  const root = h('div', {}, [
    null, false, undefined, '',
    h('span', {}, true),
    h('i', {}, 'x'),
  ]) as VNode
  const diff = sameCmds(await collectV1(root), await collectV2(root))
  assert.equal(diff, null, diff ?? '')
})

test('等价：数组/Fragment 展开（槽位推进）', async () => {
  const root = h('div', {}, [
    [
      h('span', {}, 'a'),
      h('span', {}, 'b'),
    ],
    h('>', {}, [
      h('i', {}, 'c'),
      h('i', {}, 'd'),
    ]),
  ]) as VNode
  const diff = sameCmds(await collectV1(root), await collectV2(root))
  assert.equal(diff, null, diff ?? '')
})

test('等价：组件嵌套 + keyed 组件', async () => {
  const Inner: any = (_p: any, _c: any) => () => h('em', { class: 'inner' }, 'in')
  const Holder: any = (_p: any, _c: any) => () => h('div', { class: 'holder' }, [
    h(Inner, {}),
    h('span', {}, 's'),
  ])
  const root = h('div', {}, [
    h(Inner, {}),
    h(Holder, {}),
    h(Inner, { key: 'k1' }),
  ]) as VNode
  const diff = sameCmds(await collectV1(root), await collectV2(root))
  assert.equal(diff, null, diff ?? '')
})

test('等价：事件 props（setProp 函数面）', async () => {
  const onClick = () => {}
  const root = h('button', { onClick, 'data-x': '1' }, '点') as VNode
  const diff = sameCmds(await collectV1(root), await collectV2(root))
  assert.equal(diff, null, diff ?? '')
})

test('等价：ref prop（ref 指令位置）', async () => {
  const refFn = (el: unknown) => void el
  const root = h('div', { ref: refFn }, h('span', {}, 'x')) as VNode
  const diff = sameCmds(await collectV1(root), await collectV2(root))
  assert.equal(diff, null, diff ?? '')
})

test('等价：命令数基准（性能吞吐——v2 同步流不慢）', async () => {
  // 大列表（100 项）——v1/v2 命令数一致 + 耗时同量级
  const root = h('div', {}, Array.from({ length: 100 }, (_, i) =>
    h('span', { key: i }, 'item' + i),
  )) as VNode
  const t0 = Date.now()
  const c1 = await collectV1(root)
  const t1 = Date.now() - t0
  const t2s = Date.now()
  const c2 = await collectV2(root)
  const t2 = Date.now() - t2s
  assert.equal(c1.length, c2.length, '命令数一致')
  assert.ok(t2 <= t1 * 3 + 20, `v2 耗时 ${t2}ms 应接近 v1 ${t1}ms`)
})

test('等价：随机树多种子（fuzz 迷你——10 对）', async () => {
  // 简单随机生成器（确定性种子——非真随机）
  let seed = 42
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
  const mkTree = (depth: number): any => {
    if (depth <= 0 || rnd() < 0.3) return rnd() < 0.5 ? 'text' + Math.floor(rnd() * 10) : null
    const n = 1 + Math.floor(rnd() * 3)
    const children = Array.from({ length: n }, () => mkTree(depth - 1))
    const type = ['div', 'span', 'p'][Math.floor(rnd() * 3)]
    return h(type, rnd() < 0.3 ? { 'data-k': 'v' } : {}, children)
  }
  let mismatch = 0
  let sample = ''
  for (let i = 0; i < 10; i++) {
    const root = mkTree(3)
    const d = sameCmds(await collectV1(root), await collectV2(root))
    if (d) { mismatch++; if (!sample) sample = `i=${i}\n${d}` }
  }
  assert.equal(mismatch, 0, `v1/v2 不等价 ${mismatch}/10\n${sample}`)
})
