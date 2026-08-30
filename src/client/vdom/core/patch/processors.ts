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
/** SVG 标签集（HTML 命名空间渲染异常——真实 bug——RelationGraph 事故：
 *  createElement('svg') 是 XHTML 元素——viewBox/preserveAspectRatio 属性
 *  小写化无效 + height 不映射 CSS（23px）——SVG 必须 createElementNS）
 */
const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_TAGS = new Set([
  'svg', 'path', 'circle', 'line', 'rect', 'text', 'g', 'defs', 'marker',
  'polyline', 'polygon', 'ellipse', 'use', 'symbol', 'tspan', 'textPath',
  'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'stop',
])

function createEl(doc: Document, tag: string): HTMLElement {
  return (SVG_TAGS.has(tag)
    ? doc.createElementNS(SVG_NS, tag)
    : doc.createElement(tag)) as HTMLElement
}

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
      const el = createEl(applier.doc, cmd.tag)
      applyAttrs(el, cmd.attrs)
      applier.nodes.set(cmd.id, el)
    }
  } else {
    const el = createEl(applier.doc, cmd.tag)
    applyAttrs(el, cmd.attrs)
    if (existing) {
      // 类型不符 → 替换（同构保持）——旧节点卸载资源释放（O(1) 单删——P1）
      applier.refRegistry.unmountOne(cmd.id)
      applier.eventRegistry.removeOne(cmd.id)
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
    // SSR 吸收：匹配下一个文本节点（前缀分裂——相邻文本 HTML 合流）——复用
    const ssrText = applier.absorb.next('text', undefined, cmd.value)
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
  // **防御性 return 审计（P2——状态机规格标注）**：
  //  - !el / !parent：命令流合法时不可达（insert Pre：id ∈ nodes ∧ parent ∈ 树）
  //    ——触发 = 上游生成 bug 或 SSR absorb 错配——Sim 状态机验证器在测试层
  //    捕获（reconcile insert Pre 违例 throw）——生产保留防御（环境差异兜底）
  //  - el.isConnected：合法幂等 skip（重复 insert——重建/move 路径）
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
    applier.registerChild(cmd.parent, cmd.id)
    return
  }
  // **id 空间防御（2026-XX——锚父）**：insert 到注释（锚）——真实 DOM
  // insertBefore 抛 DOMException——命令流 id 空间错位（组件输出子空间
  // 挂到锚）——显式报告（不中断——**锚后插入**——结构顺序保持——旧锚
  // 残留由 done.full 未 touched 清理——终态收敛；原 appendChild 尾部
  // 插入位置错（按钮行后——布局错位——2027-09 tour 实证修正）
  if (parent.nodeType === 8) {
    console.error(`[vdom] id 空间违例：insert ${cmd.id} 的 parent 是注释锚（${cmd.parent}）——插到锚后`)
    const container = parent.parentElement
    if (container) container.insertBefore(el, parent.nextSibling)
    if (el.nodeType === 1) applier.refRegistry.mount(cmd.id, el as HTMLElement)
    applier.registerChild(cmd.parent, cmd.id)
    return
  }
  if (cmd.ref) {
    let prev = applier.nodes.get(cmd.ref) ?? null
    // **ref 组件 id 回退（2026-08——avatar 错位根因——确定性对称补丁）**：
    // ref 指向组件 id（compId——非 DOM 节点——nodes 表无）——语义 = 「组件
    // 槽位之后」——槽位物理代表 = 其子空间最新插入的节点（id 前缀检索——
    // nodes 是插入序 Map——最后前缀命中者 = 最新=槽位代表）——与 parentOf
    // 的「组件逻辑父回退」对称（此前仅 parent 有回退——ref 无——插入点
    // 丢失——回退插头部——顺序颠倒——chat avatar 用户实证）
    if (!prev) {
      // **P2 索引化（2027-09——同族 O(N) 收敛）**：原前缀全量扫描
      // （O(N)——nodes 插入序最后命中）→ childIds DFS + 插入序 seq
      // （O(k)——k = ref 子空间大小）——语义等价（seq 单调 = 插入序）
      const sub = applier.childIds.size > 0 && applier.childIds.has(cmd.ref)
        ? applier.collectDesc(cmd.ref)
        : null
      if (sub) {
        let best = ''
        let bestSeq = -1
        for (const id of sub) {
          const s = applier.seq.get(id) ?? 0
          if (s > bestSeq) { bestSeq = s; best = id }
        }
        if (best) prev = applier.nodes.get(best) ?? null
      } else {
        // 兜底（索引未覆盖旧树——防御降级）
        const prefix = cmd.ref + '.'
        for (const [id, node] of applier.nodes) {
          if (id.startsWith(prefix)) prev = node
        }
      }
    }
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
  applier.registerChild(cmd.parent, cmd.id)
}

/** move 处理器（顺移 remap / 移动 + 重映射） */
export function procMove(applier: CommandApplier, cmd: Extract<Command, { op: 'move' }>): void {
  // 防御审计（P2）：!el / !parent = 生成层 bug（move Pre 违例——Sim 测试层
  // 捕获）——生产保留防御；noMove = 纯 remap（无 DOM 移动）
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

/** remove 处理器（卸载——ref(null) + 事件表 + 节点移除）
 *  P1 性能升级（2027-09——admin 全量 59s 实证）：原实现每次 remove 全量
 *  扫描 nodes（前缀 startsWith）——16k 条 remove × 160k 节点 = 2.6B 次
 *  匹配——O(N²)——改为 childIds 索引 DFS 收集（O(k)）。
 *  防御语义保持：子树记录清理（transform 组件→X 只发首 remove——无旧
 *  vnode 引用无法递归发命令——子节点记录残留——按 id 前缀清全部后代
 *  （keyed 子树 root.0.1.k3.0 同样路径前缀——事件/ref 表同步清）——
 *  **索引主路径 + 前缀兜底**（索引未覆盖路径——防御降级——不静默） */
export function procRemove(applier: CommandApplier, cmd: Extract<Command, { op: 'remove' }>): void {
  applier.refRegistry.unmountOne(cmd.id)
  applier.eventRegistry.removeOne(cmd.id)
  applier.nodes.get(cmd.id)?.remove()
  // 子树收集：索引 DFS（主路径）——索引未命中（漏登记旧树）→ 前缀兜底
  const sub = applier.childIds.size > 0 ? applier.collectDesc(cmd.id) : null
  const ids: string[] = sub ?? []
  if (!sub) {
    // 兜底（索引空时——历史行为）：全量前缀扫描
    const prefix = cmd.id + '.'
    for (const id of [...applier.nodes.keys()]) {
      if (id.startsWith(prefix)) ids.push(id)
    }
  }
  for (const id of ids) {
    applier.refRegistry.unmountOne(id)
    applier.eventRegistry.removeOne(id)
    applier.nodes.delete(id)
    applier.unregisterChild(id)
  }
  applier.nodes.delete(cmd.id)
  applier.unregisterChild(cmd.id)
}

/** setText 处理器（就地更新）
 *  防御审计（P2）：!t / 非文本 = setText Pre 违例（生成层 bug——Sim 状态机
 *  验证器在测试层显式 Reject（setText Pre 违例 throw）——生产保留静默防御
 *  （真实浏览器环境差异兜底——不中断渲染管线） */
export function procSetText(applier: CommandApplier, cmd: Extract<Command, { op: 'setText' }>): void {
  const t = applier.nodes.get(cmd.id)
  if (t && t.nodeType === 3) t.textContent = cmd.value
}

/** setProp 处理器（ref 生命周期 / 事件代理 / 三通道） */
export function procSetProp(applier: CommandApplier, cmd: Extract<Command, { op: 'setProp' }>): void {
  // 防御审计（P2）：!el / 非元素 = setProp Pre 违例（生成层 bug——Sim 测试
  // 层显式 Reject）——生产保留防御
  const el = applier.nodes.get(cmd.id)
  if (!el || el.nodeType !== 1) return
  const el2 = el as HTMLElement
  if (cmd.key === 'ref') {
    const prev = applier.refRegistry['refs'].get(cmd.id) as unknown
    if (cmd.value === undefined) {
      // **差集对称消费（G4）**：ref 移除——prev 退 null + 删表条目（
      // 残留 undefined 条目会在 unmount 时无谓遍历——直接删）
      applier.refRegistry.set(cmd.id, undefined, prev)
      applier.refRegistry['refs'].delete(cmd.id)
      return
    }
    applier.refRegistry.set(cmd.id, cmd.value, prev)
    if (el2.isConnected) applier.refRegistry.mount(cmd.id, el2)
    return
  }
  if (EVENT_RE.test(cmd.key)) {
    const name = eventName(cmd.key)
    if (name) {
      // **差集对称消费（G4）**：setProp undefined = 解绑（单事件删除——
      // 旧 handler 残留继续触发是行为错误——fuzz 实证）
      if (cmd.value === undefined) applier.eventRegistry.removeEvent(cmd.id, name)
      else applier.eventRegistry.set(cmd.id, name, cmd.value)
    }
    return
  }
  applySetProp(applier.eventRegistry, cmd.id, el2, cmd.key, cmd.value, cmd.prev)
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
  // **状态机（审计）**：MOUNTING → MOUNTED（mount 命令消费）
  if (rec) (rec as { phase?: 'mounting' | 'mounted' }).phase = 'mounted'
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
        applier.refRegistry.unmountOne(id)
        applier.eventRegistry.removeOne(id)
        el.remove()
        applier.nodes.delete(id)
        applier.unregisterChild(id)
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
