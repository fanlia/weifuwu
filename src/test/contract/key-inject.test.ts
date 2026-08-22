/**
 * key 注入（id 空间分隔符 '.'——compId 路径歧义——核心层修复）
 *
 * 背景（证明审计发现）：keyed compId = `{parent}.k{key}`——key 直接拼接——
 * 用户 key 可含任意字符（数据 id——如 'a.b'）——'root.0.ka'（key='a'）与
 * 'root.0.ka.b'（key='a.b'）产生前缀关系——disposeComponent/remapSubtree/
 * procRemove 的 startsWith 前缀匹配误删兄弟 keyed 实例（unmount root.0.ka
 * 误删 root.0.ka.b——实例状态丢失 + onUnmounts 错乱——实证）。
 *
 * 修复：keyedId（node/keyed.ts）统一转义（'%' 先行，'.' 转义）——
 * build/diff/cleanup 全部生成点单一实现源——转义后 key 注入不产生前缀
 * 关系（'a.b' → 'ka%2Eb' vs 'ka'——'ka%2Eb'.startsWith('ka.') = false）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { createComponentRegistry, disposeComponent } from '../../client/vdom/core/node/component.ts'
import { keyedId } from '../../client/vdom/core/node/keyed.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

async function drain(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  const r = s.getReader()
  while (true) { const { value, done } = await r.read(); if (done) break; out.push(value) }
  return out
}

let factoryRuns = 0
const Comp = (() => { factoryRuns++; return () => h('div', { class: 'c' }, 'x') })

test('keyedId：key 转义——分隔符与百分号不产生前缀关系/碰撞', () => {
  const id = keyedId('root.0', 'a.b')
  assert.equal(id, 'root.0.ka%2Eb', 'a.b 转义为 a%2Eb')
  assert.equal(keyedId('root.0', 'a%2Eb'), 'root.0.ka%252Eb', 'a%2Eb 转义为 a%252Eb（% 先行——不碰撞）')
  // 前缀关系消除（disposeComponent 的 startsWith(id+'.') 不再误伤）
  assert.ok(!keyedId('root.0', 'a.b').startsWith(keyedId('root.0', 'a') + '.'), 'key=a.b 不再是 key=a 的后代前缀')
  assert.equal(keyedId('root.0', 'k%25'), 'root.0.kk%2525', '原生百分号安全')
})

test('key 注入：unmount 消费不误删兄弟 keyed 实例（状态保持）', async () => {
  factoryRuns = 0
  const reg = createComponentRegistry()
  await drain(renderToStream(h('div', {}, [h(Comp, { key: 'a' }), h(Comp, { key: 'a.b' })]), {}, reg))
  assert.equal(reg.keys().length, 2, 'build 后两个实例')
  // 模拟消费 unmount（移除 key=a 的项——unmount 命令消费 = disposeComponent）
  disposeComponent(keyedId('root.0', 'a'), reg)
  assert.deepEqual(
    reg.keys().sort(),
    [keyedId('root.0', 'a.b')],
    'key=a.b 实例必须保留（修复前被前缀误删——registry 空）',
  )
  // 状态保持：后续 diff 渲染 key=a.b 时工厂不重跑
  const oldT = h('div', {}, [h(Comp, { key: 'a' }), h(Comp, { key: 'a.b' })]) as VNode
  const newT = h('div', {}, [h(Comp, { key: 'a.b' })]) as VNode
  const reg2 = createComponentRegistry()
  await drain(renderToStream(oldT, {}, reg2))
  const f0 = factoryRuns
  await drain(diffStream(oldT, newT, {}, reg2))
  assert.equal(factoryRuns, f0, 'key=a.b 实例复用——工厂不重跑（修复前误删重建）')
  assert.ok(reg2.get(keyedId('root.0', 'a.b')), '实例在注册表')
})

test('key 注入：含 "." 与 "/" key 的增删——实例面收敛（消费 unmount 语义）', async () => {
  const reg = createComponentRegistry()
  const oldT = h('div', {}, [
    h(Comp, { key: 'a' }),
    h(Comp, { key: 'a.b' }),
    h(Comp, { key: 'x/y.z' }),
  ]) as VNode
  const newT = h('div', {}, [
    h(Comp, { key: 'a.b' }),
    h(Comp, { key: 'x/y.z' }),
  ]) as VNode
  await drain(renderToStream(oldT, {}, reg))
  // 消费 diff（unmount 语义 = disposeComponent；mount 断言实例存在）
  const d = await drain(diffStream(oldT, newT, {}, reg))
  for (const c of d) {
    if (c.op === 'unmount') disposeComponent(c.compId, reg)
    if (c.op === 'mount') assert.ok(reg.get(c.compId), `mount 前实例必须存在: ${c.compId}`)
  }
  assert.deepEqual(
    [...reg.keys()].sort(),
    [keyedId('root.0', 'a.b'), keyedId('root.0', 'x/y.z')],
    '移除 key=a 后仅存 a.b 与 x/y.z（前缀误删则实例面缺项）',
  )
})
