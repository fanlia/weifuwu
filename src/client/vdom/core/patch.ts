/**
 * vdom core — patch 阶段（command 事件流 → DOM——**唯一 DOM 接触点**）
 *
 * 设计（design/vdom-plan.md §3）：serve 消费 Response body（command 事件流）
 * → 逐条 apply。**对照现有 DOM 节点**（2026-12 决策——diff/patch 的标准
 * 就是现有 DOM 节点——就地更新——不重建整树）：
 *
 * 幂等语义（跨流保持节点表——ctx.render() 全量流重放时就地更新）：
 * - create：id 已存在且同标签 → **attrs 就地更新**（不重建）；类型不符 →
 *   replaceWith 替换（div ↔ 锚/文本互换——同构保持）
 * - createText/createAnchor：已存在同类节点 → 复用（锚 detail 更新）；
 *   类型不符 → 替换
 * - insert：已挂载 → 跳过（位置调整后续）；未挂 → insertBefore（ref 前兄弟）
 * - setText/setProp：就地更新（不重建——焦点保持）
 * - remove：移除 + 节点表删除
 * - done：**清理本流未触及的节点**（旧树多余——组件输出变化后的残留）
 *
 * 属性三通道（field/）：on[A-Z] → events；PROPERTY_KEYS → props；
 * ref → ref.ts；其余 → attributes（enumerated 白名单显式 true/false）。
 */

import type { Command } from './command/index.ts'
import { applyAttribute } from './field/attributes.ts'
import { applyStyle } from './field/style.ts'
import { applyProperty, isPropertyKey } from './field/props.ts'
import { RefRegistry } from './field/ref.ts'
import { EventRegistry, eventName, EVENT_RE } from './field/events.ts'
import { PORTAL_CONTAINER_ID, PORTAL_ID_PREFIX, portalContainerId } from './node/portal.ts'
import { disposeComponent, type ComponentRegistry } from './node/component.ts'

export type WfNode = HTMLElement | Text | Comment

/** create 携带的 attrs——静态可序列化面（class/id/style/data-*） */
export function applyAttrs(el: HTMLElement, attrs: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style') {
      applyStyle(el, v)
    } else {
      applyAttribute(el, k, v)
    }
  }
}

/** setProp 三通道分发（事件 → **代理注册**（事件表——不直接绑定）） */
export function applySetProp(
  registry: EventRegistry, nodeId: string, el: HTMLElement, key: string, value: unknown, prev?: unknown,
): void {
  if (key === 'ref') {
    // ref 由 RefRegistry 管理（patch 处理——此处不直接应用）
    return
  } else if (EVENT_RE.test(key)) {
    const name = eventName(key)
    if (name) registry.set(nodeId, name, value)
  } else if (isPropertyKey(key)) {
    applyProperty(el, key, value)
  } else {
    applyAttribute(el, key, value)
  }
}

export class CommandApplier {
  private nodes = new Map<string, WfNode>()
  private container: HTMLElement
  private doc: Document
  private registry: ComponentRegistry | null
  private portalContainers = new Map<string, HTMLElement>()
  /** 本流已创建 id（done 清理——旧树多余节点） */
  private touched = new Set<string>()
  /** 属性 prev 记忆（id:key → 上次值——事件解绑/属性还原——重复绑定根治） */
  private propPrev = new Map<string, unknown>()
  /** ref 全局注册表（挂载/卸载查表触发——对齐事件代理模式） */
  private refRegistry = new RefRegistry()
  /** 事件代理注册表（document 捕获监听——分发） */
  private eventRegistry: EventRegistry

  constructor(container: HTMLElement, doc: Document, registry?: ComponentRegistry) {
    this.container = container
    this.doc = doc
    this.registry = registry ?? null
    this.eventRegistry = new EventRegistry(doc)
  }

  /** 卸载清理（移除根代理监听 + ref 表——serve unmount 调用） */
  dispose(): void {
    this.eventRegistry.dispose()
    this.refRegistry.dispose()
  }

  /** portal 容器（#__wf_portal 下按 key——惰性创建——挂 body） */
  private portalContainer(key: string): HTMLElement {
    let c = this.portalContainers.get(key)
    if (c) return c
    let host = this.doc.getElementById(PORTAL_CONTAINER_ID)
    if (!host) {
      host = this.doc.createElement('div')
      host.id = PORTAL_CONTAINER_ID
      this.doc.body.appendChild(host)
    }
    c = this.doc.createElement('div')
    c.id = portalContainerId(key)
    host.appendChild(c)
    this.portalContainers.set(key, c)
    return c
  }

  /** 父节点解析（root/portal 容器/节点表）——portal 子节点在节点表
   *  （id 前缀 portal:——'portal:menu.0' 是内容节点；'portal:menu' 是容器） */
  private parentOf(cmd: { parent: string }): HTMLElement | null {
    if (cmd.parent === 'root') return this.container
    if (cmd.parent.startsWith(PORTAL_ID_PREFIX)) {
      const node = this.nodes.get(cmd.parent)
      if (node) return node as HTMLElement
      return this.portalContainer(cmd.parent.slice(PORTAL_ID_PREFIX.length))
    }
    return (this.nodes.get(cmd.parent) as HTMLElement | null) ?? null
  }

  /** 子树 ref 清理（卸载指令——ref(null) + 表删除——remove/done 共用） */
  private clearNodeRefs(id: string): void {
    this.refRegistry.unmount(id)
  }

  /** 子树 id 重映射（move——旧前缀 → 新前缀——nodes/refs/propPrev/pending） */
  private remapSubtree(oldPrefix: string, newPrefix: string): void {
    const remap = (map: Map<string, unknown>, key: string): void => {
      const v = map.get(key)
      if (v === undefined) return
      map.delete(key)
      map.set(newPrefix + key.slice(oldPrefix.length), v)
    }
    for (const id of [...this.nodes.keys()]) {
      if (id === oldPrefix || id.startsWith(oldPrefix + '.')) remap(this.nodes as unknown as Map<string, unknown>, id)
    }
    this.refRegistry.remap(oldPrefix, newPrefix)
    // 事件表重映射（旧前缀 → 新前缀——移动后查表定位正确）
    for (const id of [...this.eventRegistry['table'].keys()]) {
      if (id === oldPrefix || id.startsWith(oldPrefix + '.')) {
        const v = this.eventRegistry['table'].get(id)!
        this.eventRegistry['table'].delete(id)
        this.eventRegistry['table'].set(newPrefix + id.slice(oldPrefix.length), v)
      }
    }
  }

  apply(cmd: Command): void {
    switch (cmd.op) {
      case 'create': {
        this.touched.add(cmd.id)
        const existing = this.nodes.get(cmd.id)
        if (existing && existing.nodeType === 1 && (existing as HTMLElement).tagName.toLowerCase() === cmd.tag) {
          // 同标签已存在 → attrs 就地更新（不重建——事件/焦点保持）
          applyAttrs(existing as HTMLElement, cmd.attrs)
        } else {
          const el = this.doc.createElement(cmd.tag)
          applyAttrs(el, cmd.attrs)
          if (existing) {
            // 类型不符 → 替换（同构保持）——**旧节点卸载资源释放**
            //（ref(null) + 事件表——整树替换时旧树节点被新树同 id 覆盖）
            this.clearNodeRefs(cmd.id)
            this.eventRegistry.remove(cmd.id)
            existing.replaceWith(el)
          }
          this.nodes.set(cmd.id, el)
        }
        // data-wf-id 标记（事件代理定位——元素节点）
        const el = this.nodes.get(cmd.id)
        if (el && el.nodeType === 1) (el as HTMLElement).setAttribute('data-wf-id', cmd.id)
        break
      }
      case 'createText': {
        this.touched.add(cmd.id)
        const existing = this.nodes.get(cmd.id)
        if (existing && existing.nodeType === 3) {
          if (existing.textContent !== cmd.value) existing.textContent = cmd.value
        } else {
          const t = this.doc.createTextNode(cmd.value)
          if (existing) existing.replaceWith(t)
          this.nodes.set(cmd.id, t)
        }
        break
      }
      case 'createAnchor': {
        this.touched.add(cmd.id)
        const existing = this.nodes.get(cmd.id)
        if (existing && existing.nodeType === 8) {
          const detail = cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole'
          if (existing.textContent !== detail) existing.textContent = detail
        } else {
          const anchor = this.doc.createComment(cmd.detail ? `wf-hole: ${cmd.detail}` : 'wf-hole')
          if (existing) existing.replaceWith(anchor)
          this.nodes.set(cmd.id, anchor)
        }
        break
      }
      case 'insert': {
        const el = this.nodes.get(cmd.id)
        if (!el) return
        // 已挂载 → 跳过（全量流重放——就地更新不重建）
        if (el.isConnected) return
        const parent = this.parentOf(cmd)
        if (!parent) return
        // ref = 已插入的**前一个兄弟**（流式渲染——后一个尚未插入）——
        // 插到 prev 之后；ref null = 追加尾部
        const prev = cmd.ref ? (this.nodes.get(cmd.ref) ?? null) : null
        parent.insertBefore(el, prev ? prev.nextSibling : null)
        // **挂载完成**（insert = mount 指令）——查 ref 表触发（已连接）
        if (el.nodeType === 1) this.refRegistry.mount(cmd.id, el as HTMLElement)
        break
      }
      case 'move': {
        // **keyed 重排（DOM 不重建）**：节点移动到新位置 + 子树 id 重映射
        const el = this.nodes.get(cmd.id)
        if (!el) return
        const parent = this.parentOf(cmd)
        if (!parent) return
        const prev = cmd.ref ? (this.nodes.get(cmd.ref) ?? null) : null
        if (prev) parent.insertBefore(el, prev.nextSibling)
        else if (cmd.first) parent.insertBefore(el, parent.firstChild)
        else parent.appendChild(el)
        this.remapSubtree(cmd.id, cmd.newId)
        break
      }
      case 'setText': {
        const t = this.nodes.get(cmd.id)
        if (t && t.nodeType === 3) t.textContent = cmd.value
        break
      }
      case 'setProp': {
        const el = this.nodes.get(cmd.id)
        // nodeType 判断（jsdom 隔离环境——instanceof 跨 realm 恒 false）
        if (el && el.nodeType === 1) {
          // **ref 指令（patch 生命周期处理）**：已挂载 → 立即（prev 传递）；
          // 未挂载（create 后 insert 前）→ 挂起——insert 后执行（挂载完成）
          if (cmd.key === 'ref') {
            // 注册表（prev 旧引用退 null——diff 重绑）——已挂载立即触发——
            // 未挂载等 insert（mount 查表）
            const el2 = el as HTMLElement
            const prev = this.refRegistry['refs'].get(cmd.id) as unknown
            this.refRegistry.set(cmd.id, cmd.value, prev)
            if (el2.isConnected) this.refRegistry.mount(cmd.id, el2)
            break
          }
          // 事件 → **代理注册**（事件表——prev 解绑由表替换取代）
          applySetProp(this.eventRegistry, cmd.id, el as HTMLElement, cmd.key, cmd.value)
        }
        break
      }
      case 'remove': {
        // **卸载指令**——子树 ref(null) + propPrev + 事件表清理（资源释放完整）
        this.clearNodeRefs(cmd.id)
        this.eventRegistry.remove(cmd.id)
        this.nodes.get(cmd.id)?.remove()
        this.nodes.delete(cmd.id)
        break
      }
      case 'ref': {
        // **DOM 生命周期——挂载完成**（insert 后——已挂载——注册 + 触发）
        const el = this.nodes.get(cmd.id)
        if (el && el.nodeType === 1 && typeof cmd.fn === 'function') {
          this.refRegistry.set(cmd.id, cmd.fn)
          this.refRegistry.mount(cmd.id, el as HTMLElement)
        }
        break
      }
      case 'unref': {
        // **DOM 生命周期——卸载**（ref(null)）
        this.clearNodeRefs(cmd.id)
        break
      }
      case 'mount': {
        // **组件生命周期——初始化完成**（工厂已执行——实例已注册）
        // 标记实例已挂载（审计/配对——unmount 消费）
        const rec = this.registry?.get(cmd.compId)
        if (rec) (rec as { mounted?: boolean }).mounted = true
        break
      }
      case 'removePortal': {
        // 浮层关闭清理（portal 容器内容清空——含 ref(null) 子树清理）
        const container = this.portalContainers.get(cmd.key)
        if (container) {
          this.clearNodeRefs(PORTAL_ID_PREFIX + cmd.key)
          container.innerHTML = ''
        }
        this.portalContainers.delete(cmd.key)
        break
      }
      case 'unmount': {
        // **组件卸载指令**——onUnmounts 清理（实例注册表消费——逆序执行）
        if (this.registry) disposeComponent(cmd.compId, this.registry)
        break
      }
      case 'done': {
        // 清理仅**全量流**（done.full）——touched = 存活集合——
        // 表 − touched = 旧树多余残留（组件输出变化后的节点）；
        // diff 增量流（无 full）不清理——旧节点都是存活
        if (cmd.full && this.touched.size > 0) {
          for (const [id, el] of [...this.nodes]) {
            if (!this.touched.has(id)) {
              // 清理即卸载——ref(null) + propPrev + 事件表（资源释放完整）
              this.clearNodeRefs(id)
              this.eventRegistry.remove(id)
              el.remove()
              this.nodes.delete(id)
            }
          }
        }
        this.touched.clear()
        break
      }
    }
  }
}
