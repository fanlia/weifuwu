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
import { diffStream } from '../../client/vdom/core/diff/index.ts'
import { renderToStream } from '../../client/vdom/core/build.ts'
import { createComponentRegistry, type ComponentRegistry } from '../../client/vdom/core/node/component.ts'
import type { Command } from '../../client/vdom/core/command/index.ts'

// ── Sim——命令流模拟器（proc* 语义的纯数据实现） ──
// **状态机化（P1）**：NodeState = ABSENT(记录不存在) / CREATED / INSERTED /
// ACTIVE——迁移表（apply 各分支更新状态）+ Post 验证（verifyPost——每个
// 命令消费后断言状态合法——违反 = 显式 Reject（throw）——消灭隐式路径）
type SimNodeState = 'created' | 'inserted' | 'active'
interface SimNode {
  id: string
  kind: 'el' | 'text' | 'anchor'
  tag?: string
  text?: string
  attrs: Record<string, unknown>
  children: SimNode[]
  parent: SimNode | null
  state: SimNodeState
}
class Sim {
  nodes = new Map<string, SimNode>()
  root: SimNode = { id: 'ROOT', kind: 'el', tag: 'root', attrs: {}, children: [], parent: null, state: 'active' }
  touched = new Set<string>()
  events = new Map<string, Map<string, unknown>>()   // S_EVT：id → event → handler
  instances = new Set<string>()                       // S_INST：compId 集（mount/unmount）

  private detach(n: SimNode): void {
    if (n.parent) {
      const i = n.parent.children.indexOf(n)
      if (i >= 0) n.parent.children.splice(i, 1)
      n.parent = null
    }
    // 递归清子树 parent 链（对齐真实 DOM：remove/replaceWith 后整棵子树
    // parentNode=null——insert 的 isConnected 判定必须与 el.isConnected 一致）
    const clear = (m: SimNode): void => { for (const c of m.children) { c.parent = null; clear(c) } }
    clear(n)
  }
  private parentOf(id: string): SimNode | null {
    if (id === 'root') return this.root
    if (this.nodes.has(id)) return this.nodes.get(id)!
    const segs = id.split('.')
    for (let i = segs.length - 1; i > 0; i--) {
      const p = segs.slice(0, i).join('.')
      if (p === 'root') return this.root
      if (this.nodes.has(p)) return this.nodes.get(p)!
    }
    return null
  }
  /** 子树挂载（对齐真实 DOM：insertBefore 挂载整棵子树——子树 parentNode
   *  自动更新——否则 detach 时父链判断错误——幽灵节点/误 splice）
   *  状态迁移：子树全部 → INSERTED */
  private mountTree(n: SimNode, p: SimNode): void {
    n.parent = p
    n.state = 'inserted'
    for (const c of n.children) this.mountTree(c, n)
  }

  /** Post 验证（状态机规格——每个命令消费后断言——违反 = 显式 Reject）
   *  覆盖：insert（挂载/状态）/ close（ACTIVE）/ remove（记录清除）/
   *  setText/setProp（节点存在性） */
  private verifyPost(cmd: Command, before: Map<string, SimNode>): void {
    switch (cmd.op) {
      case 'insert': {
        // Pre：id 必须存在（create 先行——生成层 bug 显式暴露）
        const n = this.nodes.get(cmd.id)
        if (!n) throw new Error(`[state-machine] insert Pre 违例：id ${cmd.id} 未 create`)
        // Post：已挂载（父链到 root）
        let p = n.parent
        let reached = false
        while (p) { if (p === this.root) { reached = true; break } p = p.parent }
        if (!reached) throw new Error(`[state-machine] insert Post 违例：${cmd.id} 未挂载到 root 链`)
        // 状态：CREATED → INSERTED（新挂载）；INSERTED/ACTIVE → 幂等 skip
        // （重建/move 路径——节点已挂载——同 isConnected skip 语义）
        if (n.state !== 'inserted' && n.state !== 'active') throw new Error(`[state-machine] insert Post 违例：${cmd.id} 状态应为 inserted/active（实际 ${n.state}）`)
        break
      }
      case 'close': {
        // Pre/Post：close 对 INSERTED → ACTIVE（子树完成）；对 ACTIVE →
        // 不变（**幂等 skip**——重建路径 create 复用 active 节点后 close
        // 重复——合法幂等——同 insert 的 isConnected skip 语义）
        const n = this.nodes.get(cmd.id)
        if (!n) throw new Error(`[state-machine] close Pre 违例：id ${cmd.id} 不存在`)
        if (n.state !== 'inserted' && n.state !== 'active') throw new Error(`[state-machine] close Pre 违例：${cmd.id} 状态应为 inserted/active（实际 ${n.state}）`)
        break
      }
      case 'remove': {
        // Post：记录必须清除（REMOVED = nodes 无记录 + ref/事件无前缀）
        if (this.nodes.has(cmd.id)) throw new Error(`[state-machine] remove Post 违例：${cmd.id} 记录未清除`)
        for (const id of this.nodes.keys()) {
          if (id.startsWith(cmd.id + '.')) throw new Error(`[state-machine] remove Post 违例：${cmd.id} 前缀记录残留 ${id}`)
        }
        for (const id of this.events.keys()) {
          if (id === cmd.id || id.startsWith(cmd.id + '.')) throw new Error(`[state-machine] remove Post 违例：事件表残留 ${id}`)
        }
        break
      }
      case 'setText': {
        // Pre：id 必须存在且为文本节点（procSetText 静默 skip 是隐式路径——
        //  状态机规格要求显式）
        const n = this.nodes.get(cmd.id)
        if (!n) throw new Error(`[state-machine] setText Pre 违例：id ${cmd.id} 不存在`)
        if (n.kind !== 'text') throw new Error(`[state-machine] setText Pre 违例：${cmd.id} 非文本节点（${n.kind}）`)
        break
      }
      case 'setProp': {
        const n = this.nodes.get(cmd.id)
        if (!n) throw new Error(`[state-machine] setProp Pre 违例：id ${cmd.id} 不存在`)
        if (n.kind !== 'el') throw new Error(`[state-machine] setProp Pre 违例：${cmd.id} 非元素节点（${n.kind}）`)
        break
      }
      default: break
    }
  }
  apply(cmd: Command): void {
    switch (cmd.op) {
      case 'create': {
        this.touched.add(cmd.id)
        const ex = this.nodes.get(cmd.id)
        if (ex && ex.kind === 'el' && ex.tag === cmd.tag) { ex.attrs = { ...cmd.attrs }; break }
        const n: SimNode = { id: cmd.id, kind: 'el', tag: cmd.tag, attrs: { ...cmd.attrs }, children: [], parent: null, state: 'created' }
        if (ex) this.detach(ex)
        this.nodes.set(cmd.id, n)
        break
      }
      case 'createText': {
        this.touched.add(cmd.id)
        const ex = this.nodes.get(cmd.id)
        if (ex && ex.kind === 'text') { ex.text = cmd.value; break }
        const n: SimNode = { id: cmd.id, kind: 'text', text: cmd.value, attrs: {}, children: [], parent: null, state: 'created' }
        if (ex) this.detach(ex)
        this.nodes.set(cmd.id, n)
        break
      }
      case 'createAnchor': {
        this.touched.add(cmd.id)
        const ex = this.nodes.get(cmd.id)
        if (ex && ex.kind === 'anchor') break
        const n: SimNode = { id: cmd.id, kind: 'anchor', attrs: {}, children: [], parent: null, state: 'created' }
        if (ex) this.detach(ex)
        this.nodes.set(cmd.id, n)
        break
      }
      case 'insert': {
        const n = this.nodes.get(cmd.id)
        if (!n || n.parent) break // isConnected → skip
        const p = this.parentOf(cmd.parent)
        if (!p) break
        if (cmd.ref) {
          const ref = this.nodes.get(cmd.ref)
          const idx = ref ? p.children.indexOf(ref) : -1
          if (idx >= 0) p.children.splice(idx + 1, 0, n)
          else p.children.push(n)
        } else {
          p.children.unshift(n) // 容器头部
        }
        this.mountTree(n, p)
        break
      }
      case 'remove': {
        const n = this.nodes.get(cmd.id)
        if (n) this.detach(n)
        for (const id of [...this.nodes.keys()]) {
          if (id === cmd.id || id.startsWith(cmd.id + '.')) {
            this.events.delete(id)
            this.nodes.delete(id)
          }
        }
        break
      }
      case 'setText': {
        const t = this.nodes.get(cmd.id)
        if (t && t.kind === 'text') t.text = cmd.value
        break
      }
      case 'setProp': {
        const el = this.nodes.get(cmd.id)
        if (cmd.key === 'ref') break
        if (/^on[A-Z]/.test(cmd.key)) {
          const name = cmd.key.slice(2).toLowerCase()
          if (!el) break
          let m = this.events.get(cmd.id)
          if (cmd.value === undefined) {
            if (m) { m.delete(name); if (m.size === 0) this.events.delete(cmd.id) }
            break
          }
          if (!m) { m = new Map(); this.events.set(cmd.id, m) }
          m.set(name, cmd.value)
          break
        }
        if (el) {
          if (cmd.value === undefined) delete el.attrs[cmd.key]
          else el.attrs[cmd.key] = cmd.value
        }
        break
      }
      case 'move': {
        const n = this.nodes.get(cmd.id)
        if (n && !cmd.noMove) {
          this.detach(n)
          const p = this.parentOf(cmd.parent)
          if (p) {
            const ref = cmd.ref ? this.nodes.get(cmd.ref) : null
            const idx = ref ? p.children.indexOf(ref) : -1
            if (idx >= 0) p.children.splice(idx + 1, 0, n)
            else p.children.push(n)
            this.mountTree(n, p)
          }
        }
        // remapSubtree（nodes/events 前缀迁移）
        const oldP = cmd.id, newP = cmd.newId
        for (const id of [...this.nodes.keys()]) {
          if (id === oldP || id.startsWith(oldP + '.')) {
            const v = this.nodes.get(id)!
            this.nodes.delete(id)
            const nid = newP + id.slice(oldP.length)
            v.id = nid
            this.nodes.set(nid, v)
            const ev = this.events.get(id)
            if (ev) { this.events.delete(id); this.events.set(nid, ev) }
          }
        }
        break
      }
      case 'mount': this.instances.add(cmd.compId); break
      case 'unmount': this.instances.delete(cmd.compId); break
      case 'ref': case 'unref': break
      case 'close': {
        // 迁移：INSERTED → ACTIVE（子树完成）——其他状态不动
        // （active = 幂等 skip——重建路径；created = 违例——verifyPost 捕获）
        const n = this.nodes.get(cmd.id)
        if (n && n.state === 'inserted') n.state = 'active'
        break
      }
      case 'done': {
        if (cmd.full) {
          for (const [id, n] of [...this.nodes]) {
            if (!this.touched.has(id)) { this.detach(n); this.events.delete(id); this.nodes.delete(id) }
          }
        }
        this.touched.clear()
        break
      }
    }
    if (cmd.op !== 'done') this.verifyPost(cmd, this.nodes)
  }
  /** 完整终态快照（S_DOM + S_EVT + S_INST 三面） */
  snapshot(): string {
    const ser = (n: SimNode): string => {
      const head = n.kind === 'el' ? `el:${n.tag}:${n.id}` : n.kind === 'text' ? `tx:${n.id}:${n.text}` : `an:${n.id}`
      const attrs = Object.keys(n.attrs).sort().map((k) => `${k}=${String(n.attrs[k])}`).join(',')
      return `${head}{${attrs}}(${n.children.map(ser).join('|')})`
    }
    const evs = [...this.events.keys()].sort().map((id) => `${id}:${[...(this.events.get(id)?.keys() ?? [])].sort().join('+')}`).join(';')
    const inst = [...this.instances].sort().join(',')
    return `DOM:${ser(this.root)}|EV:${evs}|INST:${inst}`
  }
}

async function drainStream(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  const r = s.getReader()
  while (true) { const { value, done } = await r.read(); if (done) break; out.push(value) }
  return out
}

/** 终态等价验证——不等价返回差异描述，等价返回 null */
async function verifyEquivalence(
  oldTree: VNode, newTree: VNode, registry: ComponentRegistry,
): Promise<string | null> {
  const ref = new Sim()
  for (const c of await drainStream(renderToStream(newTree, {}, registry))) ref.apply(c)
  const sim = new Sim()
  for (const c of await drainStream(renderToStream(oldTree, {}, registry))) sim.apply(c)
  for (const c of await drainStream(diffStream(oldTree, newTree, {}, registry))) sim.apply(c)
  const s1 = ref.snapshot(), s2 = sim.snapshot()
  if (s1 !== s2) {
    return `参考(build new): ${s1}\n实际(diff 后)  : ${s2}`
  }
  return null
}

/** 固定种子随机（mulberry32——可复现） */
function mulberry32(seed: number): () => number {
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

// ── 模糊测试（固定种子——定理 1 的归纳验证） ──

test('终态等价：随机树对 fuzz 零不等价（固定种子 42——300 对）', async () => {
  const rnd = mulberry32(42)
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
    if (r < 0.7) return h('span', { key: 'k' + (seq % 5) }, randTree(depth + 1))
    if (r < 0.85) return h('ul', {}, Array.from({ length: 1 + (seq % 3) }, (_, i) => h('li', { key: 'L' + i }, randTree(depth + 1))))
    return h(Fragment, {}, Array.from({ length: 1 + (seq % 2) }, () => randTree(depth + 1)))
  }
  let mismatches = 0
  const samples: string[] = []
  for (let i = 0; i < 300; i++) {
    const oldT = randTree(0) as VNode
    const newT = randTree(0) as VNode
    if (typeof oldT === 'string' || oldT === null || typeof oldT === 'boolean' || typeof newT === 'string' || newT === null || typeof newT === 'boolean') continue
    const diff = await verifyEquivalence(oldT, newT, createComponentRegistry())
    if (diff) { mismatches++; if (samples.length < 2) samples.push(`fuzz#${i}:\n${diff}`) }
  }
  assert.equal(mismatches, 0, `终态不等价 ${mismatches}/300:\n${samples.join('\n---\n')}`)
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
  const n = sim['nodes'].get('root.0')
  assert.equal(n?.state, 'active', 'close 后状态 = ACTIVE')
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
  const n = sim['nodes'].get('root.1')
  assert.equal(n?.state, 'active', 'remap 后状态保持 ACTIVE')
  assert.ok(!sim['nodes'].has('root.0'), '旧 id 记录清除')
})
