/**
 * vdom core/patch — processors（命令处理器——独立文件）
 *
 * 职责：各命令的消费逻辑（细节）——CommandApplier（index.ts）只做
 * 中转（apply switch → 本模块分发）。
 *
 * 生命周期语义：
 * - ref（挂载完成——insert 后——el 已连接）；unref/remove/done（ref(null)）
 * - mount（组件初始化标记）；unmount（onUnmounts 逆序）
 * - move（顺移 remap / 移动 + 重映射）
 * - done.full（全量流清理旧树多余节点——资源释放完整）
 */

import type { Command } from '../command/index.ts'
import { eventName, EVENT_RE } from '../field/events.ts'
import { RefRegistry } from '../field/ref.ts'
import { disposeComponent } from '../node/component.ts'
import type { CommandApplier } from './index.ts'
import { applyAttrs, applySetProp } from './fields.ts'

export type WfNode = HTMLElement | Text | Comment

/** create 处理器（元素创建——幂等——data-wf-id 标记） */
export function procCreate(applier: CommandApplier, cmd: Extract<Command, { op: 'create' }>): void {
  applier.touched.add(cmd.id)
  const existing = applier.nodes.get(cmd.id)
  if (existing && existing.nodeType === 1 && (existing as HTMLElement).tagName.toLowerCase() === cmd.tag) {
    applyAttrs(existing as HTMLElement, cmd.attrs)
  } else if (applier.absorb.queue && !existing) {
    // SSR 吸收：匹配下一个 SSR 元素节点（同 tag）——复用（焦点/状态保持）

    const ssrEl = applier.absorb.next('element', cmd.tag)
    if (ssrEl) {
      applyAttrs(ssrEl as HTMLElement, cmd.attrs)
      applier.nodes.set(cmd.id, ssrEl)
    } else {
      const el = applier.doc.createElement(cmd.tag)
      applyAttrs(el, cmd.attrs)
      applier.nodes.set(cmd.id, el)
    }
  } else {
    const el = applier.doc.createElement(cmd.tag)
    applyAttrs(el, cmd.attrs)
    if (existing) {
      // 类型不符 → 替换（同构保持）——旧节点卸载资源释放
      applier.clearNodeRefs(cmd.id)
      applier.eventRegistry.remove(cmd.id)
      existing.replaceWith(el)
    }
    applier.nodes.set(cmd.id, el)
  }
  const el = applier.nodes.get(cmd.id)
  if (el && el.nodeType === 1) (el as HTMLElement).setAttribute('data-wf-id', cmd.id)
}

/** createText 处理器（幂等） */
export function procCreateText(applier: CommandApplier, cmd: Extract<Command, { op: 'createText' }>): void {
  applier.touched.add(cmd.id)
  const existing = applier.nodes.get(cmd.id)
  if (existing && existing.nodeType === 3) {
    if (existing.textContent !== cmd.value) existing.textContent = cmd.value
  } else if (applier.absorb.queue && !existing) {
    // SSR 吸收：匹配下一个文本节点——复用
    const ssrText = applier.absorb.next('text')
    if (ssrText) {
      if (ssrText.textContent !== cmd.value) ssrText.textContent = cmd.value
      applier.nodes.set(cmd.id, ssrText)
    } else {
      const t = applier.doc.createTextNode(cmd.value)
      applier.nodes.set(cmd.id, t)
    }
  } else {
    const t = applier.doc.createTextNode(cmd.value)
    if (existing) existing.replaceWith(t)
    applier.nodes.set(cmd.id, t)
  }
}

/** createAnchor 处理器（占位锚——幂等） */
export function procCreateAnchor(applier: CommandApplier, cmd: Extract<Command, { op: 'createAnchor' }>): void {
  applier.touched.add(cmd.id)
  const existing = applier.nodes.get(cmd.id)
  if (existing && existing.nodeType === 8) {
    const detail = cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole'
    if (existing.textContent !== detail) existing.textContent = detail
  } else if (applier.absorb.queue && !existing) {
    // SSR 吸收：匹配下一个注释节点（锚）——复用
    const ssrAnchor = applier.absorb.next('comment')
    if (ssrAnchor) {
      applier.nodes.set(cmd.id, ssrAnchor)
    } else {
      const anchor = applier.doc.createComment(cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole')
      applier.nodes.set(cmd.id, anchor)
    }
  } else {
    const anchor = applier.doc.createComment(cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole')
    if (existing) existing.replaceWith(anchor)
    applier.nodes.set(cmd.id, anchor)
  }
}

/** insert 处理器（挂载——ref 查表触发）
 *  **ref=null 语义 = 容器头部**（diff 逐槽对照首项/新增首项——位置 0
 *  ——append 会把位置 0 的新项追加到末尾——错位——真实 bug） */
export function procInsert(applier: CommandApplier, cmd: Extract<Command, { op: 'insert' }>): void {
  const el = applier.nodes.get(cmd.id)
  if (!el) return
  if (el.isConnected) return
  const parent = applier.parentOf(cmd)
  if (!parent) return
  // **Text 父防御（导航崩溃修复）**：insert 的 parent 解析到 Text 节点
  // （导航流 id 与旧树残留冲突——SSR 吸收的 Text id 被新流引用）——
  // insertBefore 到 Text 抛 DOMException——改插到父容器 Text 之后——
  // 残留 Text 由 done.full 清理（未 touched）
  if (parent.nodeType === 3) {
    const container = parent.parentElement
    if (!container) return
    const after = parent.nextSibling && parent.nextSibling.parentNode === container ? parent.nextSibling : null
    container.insertBefore(el, after)
    if (el.nodeType === 1) applier.refRegistry.mount(cmd.id, el as HTMLElement)
    return
  }
  if (cmd.ref) {
    const prev = applier.nodes.get(cmd.ref) ?? null
    // ref 有效性（导航流引用旧树残留——已脱离——NotFoundError 防御）
    if (prev && prev.parentNode === parent) {
      parent.insertBefore(el, prev.nextSibling)
    } else if (prev) {
      parent.appendChild(el)
    } else {
      parent.insertBefore(el, parent.firstChild)
    }
  } else {
    // 容器头部（空容器 = append——等价）
    parent.insertBefore(el, parent.firstChild)
  }
  if (el.nodeType === 1) applier.refRegistry.mount(cmd.id, el as HTMLElement)
}

/** move 处理器（顺移 remap / 移动 + 重映射） */
export function procMove(applier: CommandApplier, cmd: Extract<Command, { op: 'move' }>): void {
  const el = applier.nodes.get(cmd.id)
  if (!el) return
  if (!cmd.noMove) {
    const parent = applier.parentOf(cmd)
    if (!parent) return
    const prev = cmd.ref ? (applier.nodes.get(cmd.ref) ?? null) : null
    if (prev) parent.insertBefore(el, prev.nextSibling)
    else if (cmd.first) parent.insertBefore(el, parent.firstChild)
    else parent.appendChild(el)
  }
  applier.remapSubtree(cmd.id, cmd.newId)
}

/** remove 处理器（卸载——ref(null) + 事件表 + 节点移除） */
export function procRemove(applier: CommandApplier, cmd: Extract<Command, { op: 'remove' }>): void {
  applier.clearNodeRefs(cmd.id)
  applier.eventRegistry.remove(cmd.id)
  applier.nodes.get(cmd.id)?.remove()
  // **子树 nodes 记录清理（真实 bug——PatternLive 场景——SPA 导航 demo 混合）**：
  // transform 组件→X 只发首节点 remove（无旧 vnode 引用无法递归发命令）——
  // 子节点记录残留——procCreate 同 tag 复用残留记录（旧 DOM 对象——含旧
  // 子树 children）→ 插入 DOM 时旧子树复活（workspace 页残留 AppShell 导航
  // ——data-wf-id 相同实证）——按 id 路径前缀清全部后代记录（keyed 子树
  // root.0.1.k3.0 同样路径前缀——事件/ref 表同步清）
  const prefix = cmd.id + '.'
  for (const id of [...applier.nodes.keys()]) {
    if (id.startsWith(prefix)) {
      applier.clearNodeRefs(id)
      applier.eventRegistry.remove(id)
      applier.nodes.delete(id)
    }
  }
  applier.nodes.delete(cmd.id)
}

/** setText 处理器（就地更新） */
export function procSetText(applier: CommandApplier, cmd: Extract<Command, { op: 'setText' }>): void {
  const t = applier.nodes.get(cmd.id)
  if (t && t.nodeType === 3) t.textContent = cmd.value
}

/** setProp 处理器（ref 生命周期 / 事件代理 / 三通道） */
export function procSetProp(applier: CommandApplier, cmd: Extract<Command, { op: 'setProp' }>): void {
  const el = applier.nodes.get(cmd.id)
  if (!el || el.nodeType !== 1) return
  const el2 = el as HTMLElement
  if (cmd.key === 'ref') {
    const prev = applier.refRegistry['refs'].get(cmd.id) as unknown
    applier.refRegistry.set(cmd.id, cmd.value, prev)
    if (el2.isConnected) applier.refRegistry.mount(cmd.id, el2)
    return
  }
  if (EVENT_RE.test(cmd.key)) {
    const name = eventName(cmd.key)
    if (name) applier.eventRegistry.set(cmd.id, name, cmd.value)
    return
  }
  applySetProp(applier.eventRegistry, cmd.id, el2, cmd.key, cmd.value)
}

/** ref 指令（挂载完成——insert 后） */
export function procRef(applier: CommandApplier, cmd: Extract<Command, { op: 'ref' }>): void {
  const el = applier.nodes.get(cmd.id)
  if (el && el.nodeType === 1 && typeof cmd.fn === 'function') {
    applier.refRegistry.set(cmd.id, cmd.fn)
    applier.refRegistry.mount(cmd.id, el as HTMLElement)
  }
}

/** unref 指令（ref(null)） */
export function procUnref(applier: CommandApplier, cmd: Extract<Command, { op: 'unref' }>): void {
  applier.clearNodeRefs(cmd.id)
}

/** mount 指令（组件初始化完成——审计标记） */
export function procMount(applier: CommandApplier, cmd: Extract<Command, { op: 'mount' }>): void {
  const rec = applier.registry?.get(cmd.compId)
  if (rec) (rec as { mounted?: boolean }).mounted = true
}

export function procUnmount(applier: CommandApplier, cmd: Extract<Command, { op: 'unmount' }>): void {
  if (applier.registry) disposeComponent(cmd.compId, applier.registry)
}

/** done 处理器（full 清理——旧树多余节点——资源释放完整） */
export function procDone(applier: CommandApplier, cmd: Extract<Command, { op: 'done' }>): void {
  if (cmd.full) {
    // SSR 吸收收尾（剩余节点 = SSR 输出多于命令——mismatch）
    applier.absorb.end()
  }
  if (cmd.full && applier.touched.size > 0) {
    for (const [id, el] of [...applier.nodes]) {
      if (!applier.touched.has(id)) {
        applier.clearNodeRefs(id)
        applier.eventRegistry.remove(id)
        el.remove()
        applier.nodes.delete(id)
      }
    }
  }
  applier.touched.clear()
}

/** 命令分发（中转——switch → 处理器） */
export function dispatch(applier: CommandApplier, cmd: Command): void {
  switch (cmd.op) {
    case 'create': procCreate(applier, cmd); break
    case 'createText': procCreateText(applier, cmd); break
    case 'createAnchor': procCreateAnchor(applier, cmd); break
    case 'insert': procInsert(applier, cmd); break
    case 'move': procMove(applier, cmd); break
    case 'remove': procRemove(applier, cmd); break
    case 'setText': procSetText(applier, cmd); break
    case 'setProp': procSetProp(applier, cmd); break
    case 'ref': procRef(applier, cmd); break
    case 'unref': procUnref(applier, cmd); break
    case 'mount': procMount(applier, cmd); break
    case 'unmount': procUnmount(applier, cmd); break
    case 'done': procDone(applier, cmd); break
    case 'close': break
  }
}

/** RefRegistry 内部访问（procSetProp 的 prev 查询——同包约定） */
export type { RefRegistry }
