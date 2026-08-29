/**
 * 终态等价对账（reconcile）——理论的执行模型
 *
 * 定理 1（终态等价——design/vdom-theory-and-fix-plan.md §2）：
 *   ∀ old, new：consume(diff(old,new)) 的终态 ≡ consume(build(new)) 的终态
 * 完整终态 = 三面：S_DOM（结构）+ S_EVT（事件表）+ S_INST（实例注册表）
 *
 * 机制：Sim 命令流模拟器（纯数据实现 proc* 语义——单一执行模型）——
 * 同一命令流在 Sim 上消费——对账 snapshot 三面——fuzz 随机树对（固定种子
 * 可复现）——任何 diff 错误（漏 remove/漏 unmount/漏解绑/错位置）⟹ 终态
 * 不等价 ⟹ 必报错（consume 确定性——演绎保证）。
 *
 * 状态（2026-XX 基线——先红后绿）：固定用例 4 个预期失败（G2/G3/G4/G8）+
 * fuzz 300 对预期多个不等价——修复后全部归零。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { h, type VNode, type VNodeChild } from '../../client/vdom/core/vnode.ts'
import { Fragment } from '../../client/vdom/core/node/fragment.ts'
import { diffToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { renderToStreamV2 } from '../../client/vdom/core/v2/integrate.ts' // v1 退役——v2 桥
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import { childrenOf, slotCount } from '../../client/vdom/core/node/children.ts'
import { pathId } from '../../client/vdom/core/node/native.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'
import { createStateTracker, transition, type StateTracker, type NodeState } from '../../client/vdom/core/patch/state-machine.ts'

// ── Sim——命令流模拟器（proc* 语义的纯数据实现） ──
// **状态机化（P1/P3c）**：NodeState 迁移 + Post 验证由共享规格
// patch/state-machine.ts 承担（单一实现源——Sim 与 devVerify 共用——
// 消灭规格漂移）——Sim 只持数据面（DOM 树/事件表/实例表）——
// 每命令消费后 transition(tracker, cmd) 收集违例——throw（测试红）
import { Sim, type SimNode } from './sim.ts'
export async function drainStream(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  const r = s.getReader()
  while (true) { const { value, done } = await r.read(); if (done) break; out.push(value) }
  return out
}

/** 双树对账（维度 7——影子树投影 vs DOM 实际 id）：
 *  从 vnode 树推导合法 id 投影：
 *  - 静态槽位（元素/文本/空洞的槽位 id——childrenOf 展开 + slotCount 推进）
 *  - 组件子空间（组件 compId 及其子路径——输出动态——子空间前缀合法）
 *  幽灵 id（两者皆非）→ 精确报错（id 归属违例——比终态 snapshot 定位更细）
 *  ——1/300 类"parent 合法但 id 归属错"的定位维度 */
export function projectLegalIds(root: VNode): { staticSlots: Set<string>; compIds: Set<string> } {
  const staticSlots = new Set<string>()
  const compIds = new Set<string>()
  const walk = (v: VNodeChild, id: string): void => {
    if (v === null || v === undefined || typeof v === 'boolean' || typeof v === 'string' || typeof v === 'number') {
      staticSlots.add(id)
      return
    }
    if (Array.isArray(v)) {
      let s = 0
      for (const c of v) { walk(c, pathId(id, s)); s += slotCount(c) }
      return
    }
    const vn = v as VNode
    if (typeof vn.type === 'function') {
      // 组件：compId 子空间合法（输出动态——sink 特判 compId.i）
      compIds.add(id)
      if (vn.key !== null) compIds.add(`${id}.k${vn.key}`)
      return
    }
    staticSlots.add(id)
    const cs = childrenOf(vn)
    let s = 0
    for (const c of cs) { walk(c, pathId(id, s)); s += slotCount(c) }
  }
  let s = 0
  for (const c of childrenOf(root)) { walk(c, pathId('root', s)); s += slotCount(c) }
  return { staticSlots, compIds }
}

/** id 归属验证（双树对账）：静态槽位 OR 组件子空间前缀 */
export function isLegalId(id: string, proj: { staticSlots: Set<string>; compIds: Set<string> }): boolean {
  if (proj.staticSlots.has(id)) return true
  for (const cid of proj.compIds) {
    if (id === cid || id.startsWith(cid + '.')) return true
  }
  return false
}

/** 终态等价验证——不等价返回差异描述，等价返回 null
 *  **参考世界隔离（C1 测试纪律）**：build(new)（参考终态）用**独立 registry**
 *  ——与 sim（build(old)+diff——模拟 serve 跨渲染复用同一 registry）隔离——
 *  否则 build(new) 的组件注册污染 diff 的 isNew 判定（mount 缺失——假反例）
 *  **双树对账（维度 7）**：消费后校验 DOM id 全部属于合法投影（幽灵 id
 *  ——静态槽位/组件子空间皆非——精确报错） */
export async function verifyEquivalence(
  oldTree: VNode, newTree: VNode, registry: ComponentRegistry,
): Promise<string | null> {
  const ref = new Sim()
  const refSegs = new Map<string, import('../../client/vdom/core/v2/diff.ts').Segment>()
  for (const c of await drainStream(renderToStreamV2(newTree, {}, createComponentRegistry(), refSegs))) ref.apply(c)
  // **段表共享（2027-08——v2 桥迁移关键）**：build/diff 同一段表——组件
  // 段跨渲染复用（工厂不重跑）——各建新表 = 段断裂 = 全量重挂载 = 不等价
  const segs: Map<string, import('../../client/vdom/core/v2/diff.ts').Segment> = new Map()
  const sim = new Sim()
  for (const c of await drainStream(renderToStreamV2(oldTree, {}, registry, segs))) sim.apply(c)
  for (const c of await drainStream(diffToStreamV2(oldTree, newTree, {}, registry, segs))) sim.apply(c)
  const s1 = ref.snapshot(), s2 = sim.snapshot()
  if (s1 !== s2) {
    // **双树对账（维度 7）**：幽灵 id 精确报错（定位维度——不等价来源）
    const proj = projectLegalIds(newTree)
    const ghosts: string[] = []
    for (const id of sim['nodes'].keys()) {
      if (id.startsWith('root') && !isLegalId(id, proj)) ghosts.push(id)
    }
    const ghostMsg = ghosts.length > 0 ? `\n幽灵 id: ${ghosts.join(', ')}（不属于 ${newTree.type === undefined ? 'FRAG/组件' : String(newTree.type)} 投影）` : ''
    return `参考(build new): ${s1}\n实际(diff 后)  : ${s2}${ghostMsg}`
  }
  return null
}

/** 固定种子随机（mulberry32——可复现） */
export function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 固定用例（理论缺口实证——先红后绿） ──

test('G3：Fragment 缩短——旧项必须移除（终态等价）', async () => {
  const frag = (ks: string[]) => h('div', {}, [h(Fragment, {}, ks.map((k) => h('span', { key: k }, k)))])
  const diff = await verifyEquivalence(frag(['a', 'b']), frag(['a']), createComponentRegistry())
  assert.equal(diff, null, `fragment 缩短后旧 b 残留——终态不等价:\n${diff ?? ''}`)
})

test('G2：组件输出多根 → 元素——区间完整移除（终态等价）', async () => {
  const reg = createComponentRegistry()
  const Multi = () => () => [h('span', { class: 'a' }, 'a'), h('b', {}, 'bold')]
  const diff = await verifyEquivalence(
    h('div', {}, [h(Multi, {}), h('button', {}, 'k')]),
    h('div', {}, [h('div', { class: 'x' }, 'x'), h('button', {}, 'k')]),
    reg,
  )
  assert.equal(diff, null, `组件多根区间残留:\n${diff ?? ''}`)
})

test('G4：事件 handler 移除——事件表必须解绑（终态等价 S_EVT 面）', async () => {
  const fn = () => {}
  const diff = await verifyEquivalence(
    h('button', { onClick: fn }, 'b'),
    h('button', {}, 'b'),
    createComponentRegistry(),
  )
  assert.equal(diff, null, `onClick 移除后事件表残留:\n${diff ?? ''}`)
})

test('G8：嵌套组件卸载——子实例必须递归清理（终态等价 S_INST 面）', async () => {
  const reg = createComponentRegistry()
  const ChildC = () => () => h('span', {}, 'c')
  const Parent = () => () => h('div', {}, [h(ChildC, {})])
  const diff = await verifyEquivalence(
    h('div', {}, [h(Parent, {})]),
    h('div', {}, [h('p', {}, 'gone')]),
    reg,
  )
  assert.equal(diff, null, `嵌套子实例残留:\n${diff ?? ''}`)
})

test('G9：重复 key——首现优先 + move 正确发出 + 终态等价（1/300 回归——非法输入确定行为）', async () => {
  // 复刻组件树 fuzz seed=99 i=67（旧列表两个 span{k1} 重复 key——裸
  // Map.set 尾现覆盖 → moved 误判（oldIdx===newIdx）→ move 缺失 → 旧
  // 节点残留 + 新项插进旧节点 + 实例残留——首现优先（与 keyIndex 对齐）
  // 修复后：move root.0→root.1 正确发出——终态等价）
  const Dup = () => () => h('div', { class: 'o' }, 'x')
  const oldT = h(Fragment, {}, [
    h('span', { key: 'k1' }, h(Dup, {})),   // root.0 span{k1} > 组件
    h('span', { key: 'k1' }, h(Dup, {})),   // root.1 span{k1}（重复 key）
  ])
  const newT = h(Fragment, {}, [
    h(Dup, {}),                              // root.0 组件（无 key 槽位）
    h('span', { key: 'k1' }, h(Dup, {})),    // root.1 span{k1} > 组件
  ])
  // move 命令断言（首现优先：oldIdx=0 ≠ newIdx=1 → move 必须发出）
  const reg = createComponentRegistry()
  const d = await drainStream(diffToStreamV2(oldT, newT, {}, reg))
  assert.ok(
    d.some((c) => c.op === 'move' && c.id === 'root.0' && (c as { newId?: string }).newId === 'root.1'),
    `重复 key 首现优先 → move root.0→root.1 必须发出（实际: ${d.map((c) => c.op + ':' + ((c as { id?: string }).id ?? (c as { compId?: string }).compId ?? '')).join(' ')}）`,
  )
  // 终态等价（三面对账）
  const warns: string[] = []
  const origWarn = console.warn
  console.warn = (m: string) => { warns.push(String(m)) }
  let diffMsg = ''
  try {
    const diff = await verifyEquivalence(oldT, newT, createComponentRegistry())
    diffMsg = diff ?? ''
  } finally { console.warn = origWarn }
  assert.equal(diffMsg, '', `重复 key 终态不等价:\n${diffMsg}`)
  // A 级检测：重复 key 必须 warn 引导（非法输入显式化——不静默）
  assert.ok(warns.some((w) => w.includes('重复 key')), `A 级检测：重复 key 必须 warn 引导（实际: ${warns.join(' | ')}）`)
  // **build 路径补全（同源——静默复用实证）**：build 同 key 组件 →
  // compId 相同 → 后者静默复用前者实例（工厂不执行/不 mount——初始化
  // 丢失）——build 路径也必须 warn（diff 路径已覆盖——build 缺失）
  const bwarns: string[] = []
  const origWarn2 = console.warn
  console.warn = (m: string) => { bwarns.push(String(m)) }
  try {
    const reg2 = createComponentRegistry()
    await drainStream(renderToStreamV2(
      h('div', {}, [h(Dup, { key: 'k1' }), h(Dup, { key: 'k1' })]), {}, reg2,
    ))
  } finally { console.warn = origWarn2 }
  assert.ok(bwarns.some((w) => w.includes('重复 key')), `build 路径重复 key 必须 warn（实际: ${bwarns.join(' | ')}）`)
})

test('G11：可变组件输出（状态变化——形态切换）——终态等价（fuzz 盲区：输出固定纪律的反面）', async () => {
  // 真实世界：组件状态变化 → 输出形态切换（div→数组→null→em→组件）——
  // 旧输出移除必须按**旧输出形态**的 id 空间（单元素挂槽位/数组空洞挂
  // compId.0）——统一 outId 曾导致：旧 div 保留 + 锚插入 + 实例残留
  // （probe3 实证）——修复：diffComponentOutput 的 oldBase 按形态计算
  // （slotId/compId.0）——以下每轮先 build old（phase 旧值）再 phase++
  // 后 diff（renderFn 重调输出新形态）——参考 build new（新 phase）
  let phase = 0
  const Vary = () => () => {
    switch (phase) {
      case 0: return h('div', { class: 'v' }, 'a')
      case 1: return [h('span', {}, 'b'), h('span', {}, 'c')]
      case 2: return null
      case 3: return h('em', {}, 'e')
      case 4: return h('p', {}, 'p')
      default: return h('div', { class: 'v' }, 'a')
    }
  }
  const tree = (): VNode => h('div', {}, [h(Vary, {})])
  // 每对：build old（phase=n）+ diff（phase=n+1）vs 参考 build new（phase=n+1）
  for (let n = 0; n < 4; n++) {
    phase = n
    const oldT = tree()
    phase = n + 1
    const newT = tree()
    const diff = await verifyEquivalence(oldT, newT, createComponentRegistry())
    assert.equal(diff, null, `可变输出 ${n}→${n + 1} 终态不等价:\n${diff ?? ''}`)
  }
})

// ── 模糊测试（固定种子——定理 1 的归纳验证） ──

test('终态等价：随机树对 fuzz 零不等价（多种子 × 400 对——收敛验收）', async () => {
  let total = 0
  for (const seed of [42, 7, 2026]) {
    const mismatches = await fuzzRound(seed, 400)
    total += mismatches
  }
  assert.equal(total, 0, `终态不等价合计 ${total}/1200`)
})

/** 单种子 fuzz 轮（生成器 + 终态等价验证——返回不等价数） */
async function fuzzRound(seed: number, rounds: number): Promise<number> {
  const rnd = mulberry32(seed)
  let seq = 0
  const randLeaf = (): VNodeChild => {
    const r = rnd()
    if (r < 0.3) return 't' + (seq++ % 7)
    if (r < 0.5) return null
    if (r < 0.6) return false
    return seq++ % 2 === 0 ? 'x' : 42
  }
  const randTree = (depth: number): VNodeChild => {
    if (depth > 3 || rnd() < 0.25) return randLeaf()
    const r = rnd()
    if (r < 0.3) return h('span', { class: 'c' + (seq % 3) }, randTree(depth + 1))
    if (r < 0.5) return h('div', { id: 'd' + (seq % 2) }, Array.from({ length: 1 + (seq % 3) }, () => randTree(depth + 1)))
    if (r < 0.7) return h('span', { key: 'k' + (seq++ % 1000) }, randTree(depth + 1))
    if (r < 0.85) return h('ul', {}, Array.from({ length: 1 + (seq % 3) }, (_, i) => h('li', { key: 'L' + i }, randTree(depth + 1))))
    return h(Fragment, {}, Array.from({ length: 1 + (seq % 2) }, () => randTree(depth + 1)))
  }
  let mismatches = 0
  let sample = ''
  for (let i = 0; i < rounds; i++) {
    const oldT = randTree(0) as VNode
    const newT = randTree(0) as VNode
    if (typeof oldT === 'string' || oldT === null || typeof oldT === 'boolean' || typeof newT === 'string' || newT === null || typeof newT === 'boolean') continue
    const diff = await verifyEquivalence(oldT, newT, createComponentRegistry())
    if (diff) { mismatches++; if (!sample) sample = `seed=${seed} i=${i}\nold=${JSON.stringify(oldT)}\nnew=${JSON.stringify(newT)}\n${diff}` }
  }
  if (mismatches > 0) console.error('[fuzz-fail]', sample)
  return mismatches
}


/** 组件工厂（输出形态由 kind 决定——C1 组件路径 fuzz）：
 *  array  = 多根输出（高发区——组件输出数组）
 *  el     = 单元素输出
 *  hole   = 空洞/元素切换（条件渲染）
 *  comp   = 输出组件（outIsComponent 特判路径——C2 靶点） */
let compSeq = 0
function makeCompFactory(kind: 'array' | 'el' | 'hole' | 'comp', inner: () => VNodeChild, rnd: () => number): () => any {
  // **生成器纪律：输出形态与 inner 全部创建时固定**——工厂每次执行输出
  // 完全相同的 vnode（确定性——build 与 diff 各执行一次——输出必须一致
  // ——否则假反例）——hole 切换/arrLabel/inner 均创建时求值
  const holeVal = rnd() < 0.5
  const arrLabel = 'a' + (compSeq % 3)
  const innerVal = inner()
  const innerComp = kind === 'comp' ? h(makeCompFactory('el', () => 'x', rnd), {}) : null
  // **生成器强化（G10 盲区——组件输出数组项从未带 key）**：输出数组
  //  首项带唯一 key（创建时固定——工厂输出确定性纪律）——keyed 路径
  //  （diffKeyedChildren 顺移/重建 + removalParent 清理）纳入 fuzz 覆盖
  const outKey = 'outk' + (compSeq++)
  const f = () => () => {
    switch (kind) {
      case 'array': return [h('span', { class: 'o0', key: outKey }, arrLabel), innerVal]
      case 'el': return h('div', { class: 'oel' }, innerVal)
      case 'hole': return holeVal ? h('b', {}, 'h') : null
      case 'comp': return innerComp
    }
  }
  return f as any
}

/** 单种子组件 fuzz 轮（C1——组件路径随机对账——返回不等价数） */
async function compFuzzRound(seed: number, rounds: number): Promise<number> {
  const rnd = mulberry32(seed)
  let seq = 0
  compSeq = 0
  const kinds = ['array', 'el', 'hole', 'comp'] as const
  const randComp = (depth: number): VNodeChild => {
    if (depth > 2 || rnd() < 0.5) {
      const k = kinds[seq % kinds.length]
      return h(makeCompFactory(k, () => 't' + (seq % 3), rnd), {})
    }
    const k = kinds[seq++ % kinds.length]
    return h(makeCompFactory(k, () => randComp(depth + 1), rnd), {})
  }
  const randTree = (depth: number): VNodeChild => {
    if (depth > 2 || rnd() < 0.3) return randComp(depth)
    const r = rnd()
    if (r < 0.3) return h('div', { class: 'c' + (seq % 2) }, Array.from({ length: 1 + (seq % 2) }, () => randTree(depth + 1)))
    if (r < 0.6) return h('span', { key: 'k' + (seq++ % 1000) }, randTree(depth + 1))
    return h(Fragment, {}, Array.from({ length: 1 + (seq % 2) }, () => randTree(depth + 1)))
  }
  let mismatches = 0
  let sample = ''
  const origWarn = console.warn
  console.warn = () => {} // A 级检测告警静音（组件项无 key——fuzz 噪音）
  try {
    for (let i = 0; i < rounds; i++) {
      const oldT = randTree(0) as VNode
      const newT = randTree(0) as VNode
      if (typeof oldT === 'string' || oldT === null || typeof oldT === 'boolean' || typeof newT === 'string' || newT === null || typeof newT === 'boolean') continue
      const diff = await verifyEquivalence(oldT, newT, createComponentRegistry())
      if (diff) {
        mismatches++
        if (!sample) {
          // 打印 diff 命令流（mount/unmount/remove）
          const reg2 = createComponentRegistry()
          const segs2: Map<string, import('../../client/vdom/core/v2/diff.ts').Segment> = new Map()
          const bo = await drainStream(renderToStreamV2(oldT, {}, reg2, segs2))
          const d2 = await drainStream(diffToStreamV2(oldT, newT, {}, reg2, segs2))
          const stream2 = `[bo] ${bo.map((c: any) => `${c.op}:${c.id ?? c.compId ?? ''}${c.parent ? '^' + c.parent : ''}${c.tag ? ':' + c.tag : ''}`).join(' ')}\n[d2] ${d2.map((c: any) => `${c.op}:${c.id ?? c.compId ?? ''}${c.parent ? '^' + c.parent : ''}${c.tag ? ':' + c.tag : ''}`).join(' ')}`
          sample = `seed=${seed} i=${i}\nold=${JSON.stringify(oldT)}\nnew=${JSON.stringify(newT)}\n${diff}\n流: ${stream2}`
        }
      }
    }
  } finally {
    console.warn = origWarn
  }
  if (mismatches > 0) console.error('[comp-fuzz-fail]', sample)
  return mismatches
}

test('组件树 fuzz：组件输出多根/输出组件/嵌套——终态等价（C1——先红后绿）', async () => {
  let total = 0
  for (const seed of [11, 99]) {
    const mismatches = await compFuzzRound(seed, 150)
    total += mismatches
  }
  assert.equal(total, 0, `组件树终态不等价合计 ${total}/300\n（C2 outIsComponent 特判歼灭前——基线 89%——修复后归零）`)
})

// ── P1：状态机迁移覆盖用例（规格可执行——每个命令的迁移/Reject/幂等） ──

/** 直接消费命令流的 Sim 实例（单命令断言） */
function simFor(cmds: Command[]): Sim {
  const sim = new Sim()
  for (const c of cmds) sim.apply(c)
  return sim
}

test('状态机：create → insert → close 状态流（CREATED → INSERTED → ACTIVE）', () => {
  const sim = simFor([
    { op: 'create', id: 'root.0', tag: 'div', attrs: {} },
    { op: 'insert', id: 'root.0', parent: 'root', ref: null },
    { op: 'close', id: 'root.0' },
  ])
  const t = sim['tracker'] as StateTracker
  assert.equal(t.get('root.0'), 'active', 'close 后状态 = ACTIVE（共享规格 tracker）')
  assert.equal(sim['nodes'].get('root.0')?.parent, sim['root'], '已挂载到 root')
})

test('状态机：insert 对未 create 的 id → 显式 Reject（不再静默）', () => {
  const sim = new Sim()
  assert.throws(
    () => sim.apply({ op: 'insert', id: 'root.9', parent: 'root', ref: null }),
    /insert Pre 违例/,
    'insert 未 create 的 id 必须抛错（生成层 bug 显式暴露）',
  )
})

test('状态机：setText 对不存在的 id → 显式 Reject', () => {
  const sim = new Sim()
  assert.throws(() => sim.apply({ op: 'setText', id: 'root.9', value: 'x' }), /setText Pre 违例/)
})

test('状态机：setText 对元素节点（非文本）→ 显式 Reject', () => {
  const sim = simFor([{ op: 'create', id: 'root.0', tag: 'div', attrs: {} }])
  assert.throws(() => sim.apply({ op: 'setText', id: 'root.0', value: 'x' }), /setText Pre 违例/)
})

test('状态机：setProp 对不存在的 id → 显式 Reject', () => {
  const sim = new Sim()
  assert.throws(() => sim.apply({ op: 'setProp', id: 'root.9', key: 'class', value: 'x' }), /setProp Pre 违例/)
})

test('状态机：close 对 CREATED（未 insert）节点 → 显式 Reject', () => {
  const sim = simFor([{ op: 'create', id: 'root.0', tag: 'div', attrs: {} }])
  assert.throws(() => sim.apply({ op: 'close', id: 'root.0' }), /close Pre 违例/)
})

test('状态机：重复 insert（已挂载）→ 幂等 skip（合法——不抛）', () => {
  const sim = simFor([
    { op: 'create', id: 'root.0', tag: 'div', attrs: {} },
    { op: 'insert', id: 'root.0', parent: 'root', ref: null },
  ])
  assert.doesNotThrow(() => sim.apply({ op: 'insert', id: 'root.0', parent: 'root', ref: null }), '重复 insert = 幂等 skip')
})

test('状态机：remove 后记录/事件表前缀清除（Post 验证生效）', () => {
  const sim = simFor([
    { op: 'create', id: 'root.0', tag: 'div', attrs: {} },
    { op: 'insert', id: 'root.0', parent: 'root', ref: null },
    { op: 'create', id: 'root.0.0', tag: 'span', attrs: {} },
    { op: 'insert', id: 'root.0.0', parent: 'root.0', ref: null },
    { op: 'setProp', id: 'root.0.0', key: 'onClick', value: () => {} },
  ])
  sim.apply({ op: 'remove', id: 'root.0' })
  assert.ok(!sim['nodes'].has('root.0') && !sim['nodes'].has('root.0.0'), '记录清除')
  assert.ok(!sim['events'].has('root.0.0'), '事件表前缀清除')
})

test('状态机：move remap 后状态保持（INSERTED/ACTIVE 跟随 id）', () => {
  const sim = simFor([
    { op: 'create', id: 'root.0', tag: 'div', attrs: {} },
    { op: 'insert', id: 'root.0', parent: 'root', ref: null },
    { op: 'close', id: 'root.0' },
  ])
  sim.apply({ op: 'move', id: 'root.0', parent: 'root', ref: null, newId: 'root.1', noMove: true })
  const t = sim['tracker'] as StateTracker
  assert.equal(t.get('root.1'), 'active', 'remap 后状态保持 ACTIVE（共享规格 remapPrefix）')
  assert.equal(t.get('root.0'), undefined, '旧 id 状态清除')
  assert.ok(!sim['nodes'].has('root.0'), '旧 id 记录清除')
})
