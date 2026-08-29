/**
 * vdom 契约测试共享 — Sim（命令流模拟器——状态机规格跟踪）
 * 双引擎对账（v1/v2 命令流 → Sim 终态等价——切换护栏）
 */
import type { Command } from '../../client/vdom/core/command/index.ts'
import { createStateTracker, transition, type StateTracker } from '../../client/vdom/core/patch/state-machine.ts'

/** 流 → 命令数组（契约层共享——避免从测试文件 import 引发的连带执行） */
export async function drainStream(s: ReadableStream<Command>): Promise<Command[]> {
  const out: Command[] = []
  const r = s.getReader()
  while (true) { const { value, done } = await r.read(); if (done) break; out.push(value) }
  return out
}

export interface SimNode {
  id: string
  kind: 'el' | 'text' | 'anchor'
  tag?: string
  text?: string
  attrs: Record<string, unknown>
  children: SimNode[]
  parent: SimNode | null
}
export class Sim {
  nodes = new Map<string, SimNode>()
  root: SimNode = { id: 'ROOT', kind: 'el', tag: 'root', attrs: {}, children: [], parent: null }
  touched = new Set<string>()
  events = new Map<string, Map<string, unknown>>()   // S_EVT：id → event → handler
  instances = new Set<string>()                       // S_INST：compId 集（mount/unmount）
  /** 状态机规格跟踪器（共享——patch/state-machine.ts——单一实现源） */
  tracker: StateTracker = createStateTracker()

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
   *  （状态迁移由共享规格 transition 管理——此处只管数据面 parent 链） */
  private mountTree(n: SimNode, p: SimNode): void {
    n.parent = p
    for (const c of n.children) this.mountTree(c, n)
  }

  apply(cmd: Command): void {
    switch (cmd.op) {
      case 'create': {
        this.touched.add(cmd.id)
        const ex = this.nodes.get(cmd.id)
        if (ex && ex.kind === 'el' && ex.tag === cmd.tag) { ex.attrs = { ...cmd.attrs }; break }
        const n: SimNode = { id: cmd.id, kind: 'el', tag: cmd.tag, attrs: { ...cmd.attrs }, children: [], parent: null }
        if (ex) this.detach(ex)
        this.nodes.set(cmd.id, n)
        break
      }
      case 'createText': {
        this.touched.add(cmd.id)
        const ex = this.nodes.get(cmd.id)
        if (ex && ex.kind === 'text') { ex.text = cmd.value; break }
        const n: SimNode = { id: cmd.id, kind: 'text', text: cmd.value, attrs: {}, children: [], parent: null }
        if (ex) this.detach(ex)
        this.nodes.set(cmd.id, n)
        break
      }
      case 'createAnchor': {
        this.touched.add(cmd.id)
        const ex = this.nodes.get(cmd.id)
        if (ex && ex.kind === 'anchor') break
        const n: SimNode = { id: cmd.id, kind: 'anchor', attrs: {}, children: [], parent: null }
        if (ex) this.detach(ex)
        this.nodes.set(cmd.id, n)
        break
      }
      case 'insert': {
        const n = this.nodes.get(cmd.id)
        if (!n || n.parent) break // isConnected → skip
        const p = this.parentOf(cmd.parent)
        if (!p) break
        // **id 空间状态机（2026-XX——维度补全）**：insert 的 parent 必须
        // 是容器（元素/root）——锚/文本不是容器（真实 DOM insertBefore
        // 到注释/文本抛 DOMException——组件 fuzz an:root.0(div) 案例——
        // 影子树 id 空间错位在消费瞬间显式违例（而非终态不等价才暴露））
        if (p !== this.root && p.kind !== 'el') {
          throw new Error(`[state-machine] id 空间违例：insert ${cmd.id} 的 parent ${cmd.parent} 不是容器（${p.kind}）`)
        }
        if (cmd.ref) {
          let ref = this.nodes.get(cmd.ref) ?? null
          // **ref 组件 id 回退（2026-08——与消费端 procInsert 对称）**：
          // ref=组件 id——槽位代表 = 子空间最新节点（插入序前缀检索）
          if (!ref) {
            let best: SimNode | null = null
            for (const [id, node] of this.nodes) {
              if (id.startsWith(cmd.ref + '.')) best = node
            }
            ref = best
          }
          const idx = ref ? p.children.indexOf(ref) : -1
          if (idx >= 0) p.children.splice(idx + 1, 0, n)
          else p.children.unshift(n) // ref 无效——统一容器头部（与消费端一致）
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
        // 类型检查（数据面——SimNode.kind——规格的类型维度由各数据面承担）
        else if (t) throw new Error(`[state-machine] setText Pre 违例：${cmd.id} 非文本节点（${t.kind}）`)
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
        // **实例迁移（与真实 patch remapSubtree 的 registry 迁移对齐——
        //  G9：move remap 后 diff 生成端按新 id 对照组件——rec 不迁移则
        //  查询落空 → 工厂重跑 + 旧 rec 残留——S_INST 面不等价）**
        for (const id of [...this.instances]) {
          if (id === oldP || id.startsWith(oldP + '.')) {
            this.instances.delete(id)
            this.instances.add(newP + id.slice(oldP.length))
          }
        }
        break
      }
      case 'mount': this.instances.add(cmd.compId); break
      case 'unmount': {
        // **前缀递归（与 disposeComponent 一致——Sim 消费端完整性）**：
        // 真实消费端 unmount → disposeComponent(compId) 前缀递归卸载
        // （compId + compId.*——输出子空间 root.0.0.1.0/keyed 子实例）——
        // Sim 只删单个会残留（组件 fuzz seed=99 实证——root.0.0.1.0 幽灵）
        for (const cid of [...this.instances]) {
          if (cid === cmd.compId || cid.startsWith(cmd.compId + '.')) this.instances.delete(cid)
        }
        break
      }
      case 'ref': case 'unref': break
      case 'close': break
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
    // **共享规格验证（P3c——单一实现源）**：状态迁移 + Post 违例收集——
    // 违例 throw（测试红——显式 Reject）
    const violations = transition(this.tracker, cmd)
    if (violations.length > 0) {
      throw new Error(`[state-machine] ${violations.join('; ')}`)
    }
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

