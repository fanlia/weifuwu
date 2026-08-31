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
 *
 * **v1 退役（2027-08）**：实例权威从 v1 registry 迁移到 v2 段表
 * （renderV2/diffV2 共享 segments——mounts 计数 = segments.size——
 * unmount 命令 = 消费端清理信号——断言面不变）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode } from '../../client/vdom/core/vnode.ts'
import { diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { renderToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { keyedId } from '../../client/vdom/core/node/keyed.ts'
import type { Segment } from '../../client/vdom/core/v2/diff.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

async function drain(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  const r = s.getReader()
  while (true) { const { value, done } = await r.read(); if (done) break; out.push(value) }
  return out
}

/** 段表（实例权威——v2） */
function segments() { return new Map<string, Segment>() }
/** 消费 unmount 语义——段 dispose（v2 引擎侧生成期已 dispose——消费端幂等兜底） */
function disposeByCmds(cmds: Command[], segs: Map<string, Segment>): void {
  for (const c of cmds) {
    if (c.op === 'unmount' && segs.has((c as { compId: string }).compId)) {
      segs.delete((c as { compId: string }).compId)
    }
  }
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
  const segs = segments()
  await drain(renderToStreamV2(h('div', {}, [h(Comp, { key: 'a' }), h(Comp, { key: 'a.b' })]), {}, undefined, segs))
  assert.equal(segs.size, 2, 'build 后两个段（实例）')
  // 模拟消费 unmount（移除 key=a 的项——unmount 命令消费 = 段删除）
  disposeByCmds([{ op: 'unmount', compId: keyedId('root.0', 'a') } as Command], segs)
  assert.deepEqual(
    [...segs.keys()].sort(),
    [keyedId('root.0', 'a.b')],
    'key=a.b 段必须保留（修复前被前缀误删——实例面空）',
  )
  // **段复用对照（2027-10 语义一致化——VDOM-CORE-EXCELLENCE A2）**：
  // 位置不变组件 diff → 段复用工厂不重跑（movedComp=false 对照路径）。
  // **已知缺口（登记 VDOM-CORE-EXCELLENCE B 波次）**：删头前移场景
  // （keyed 组件跨槽位移动）走重建路径——工厂重跑状态丢失——正解
  // 「输出锚物理 move + ref 定位」待 B 波次实现
  const oldT = h('div', {}, [h(Comp, { key: 'a' }), h(Comp, { key: 'a.b' })]) as VNode
  const newT = h('div', {}, [h(Comp, { key: 'a' }), h(Comp, { key: 'a.b' }), h(Comp, { key: 'c' })]) as VNode
  const segs2 = segments()
  const f0 = factoryRuns
  await drain(renderToStreamV2(oldT, {}, undefined, segs2))
  const f1 = factoryRuns
  await drain(diffToStreamV2(oldT, newT, {}, undefined, segs2))
  assert.equal(factoryRuns, f1 + 1, '位置不变组件段复用——工厂不重跑（仅新增 c 一个工厂——a/a.b 复用）')
  assert.ok(segs2.get(keyedId('root.0', 'a.b')), '段在段表（实例保留）')
  assert.ok(f1 > f0)
  // **删头前移（M2 物理 move 收口——2027-10 KEYED-COMPONENT-MOVE）**：
  // A2 时代走重建路径（mount 信号重发——生命周期噪声）；M2 后单根 el
  // 输出走槽位 remap——段零扰动——工厂不重跑 + 零生命周期信号
  const oldT2 = h('div', {}, [h(Comp, { key: 'a' }), h(Comp, { key: 'a.b' })]) as VNode
  const newT2 = h('div', {}, [h(Comp, { key: 'a.b' })]) as VNode
  const segs3 = segments()
  await drain(renderToStreamV2(oldT2, {}, undefined, segs3))
  const f2 = factoryRuns
  const d2 = await drain(diffToStreamV2(oldT2, newT2, {}, undefined, segs3))
  assert.ok(segs3.get(keyedId('root.0', 'a.b')), '删头前移后段存在（实例保留）')
  assert.equal(factoryRuns, f2, '工厂不重跑（物理 move 段零扰动——A2 缺口收口）')
  assert.ok(!d2.some((c: any) => c.op === 'mount'), '零 mount 信号（生命周期零噪声——非重建路径）')
  assert.ok(!d2.some((c: any) => c.op === 'unmount' && String((c as any).compId ?? '').includes('a.b')), 'a.b 无 unmount（实例不卸载）')
})

test('key 注入：含 "." 与 "/" key 的增删——实例面收敛（消费 unmount 语义）', async () => {
  const segs = segments()
  const oldT = h('div', {}, [
    h(Comp, { key: 'a' }),
    h(Comp, { key: 'a.b' }),
    h(Comp, { key: 'x/y.z' }),
  ]) as VNode
  const newT = h('div', {}, [
    h(Comp, { key: 'a.b' }),
    h(Comp, { key: 'x/y.z' }),
  ]) as VNode
  await drain(renderToStreamV2(oldT, {}, undefined, segs))
  // 消费 diff（unmount 语义 = 段删除；mount 断言段存在）
  const d = await drain(diffToStreamV2(oldT, newT, {}, undefined, segs))
  for (const c of d) {
    if (c.op === 'unmount') disposeByCmds([c], segs)
    if (c.op === 'mount') assert.ok(segs.get(c.compId), `mount 前段必须存在: ${c.compId}`)
  }
  assert.deepEqual(
    [...segs.keys()].sort(),
    [keyedId('root.0', 'a.b'), keyedId('root.0', 'x/y.z')],
    '移除 key=a 后仅存 a.b 与 x/y.z（前缀误删则实例面缺项）',
  )
})
