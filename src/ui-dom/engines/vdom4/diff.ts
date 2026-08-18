/**
 * vdom4 diff — 纯 diff（新树 vs 影子 → Command[]——不写 DOM/不写影子——可独立测试）
 *
 * 锚点法（复用 vdom3 P1 验证语义）：每 children 槽位恒一锚（wf-anchor——内容在后）；
 * 槽位游标推进（逻辑容器锚列表 = 数组项锚——O(1) 定位——无宽度推导）。
 * 节点 id = 确定性路径（build 约定）：
 *   {P}.{i} 内容 / {P}.t{i} 文本 / {P}.a{i} 锚 / {P}.c 组件输出 / {P}.c.f{i} Fragment
 * 旧锚从影子读——新锚从路径推导——同声明同路径（SSR/客户端一致）。
 */

import type { VNode, VNodeChild, Command } from './types.ts'
import { Fragment, childrenOf } from './types.ts'
import type { ShadowState } from './shadow.ts'

/** 顶层 diff（root 挂载/整树 patch——新树 vs 影子 → 命令） */
export function diffTree(newV: VNode, shadow: ShadowState): Command[] {
  const cmds: Command[] = []
  genVNode(newV, 'root', null, cmds, shadow)
  return cmds
}

/** 组件级 diff（组件路径 → 输出 patch——统一渲染原语的 comp target） */
export function diffComponent(compId: string, shadow: ShadowState): Command[] {
  const inst = shadow.getInstance(compId)
  if (!inst) return []
  const cmds: Command[] = []
  const out = inst.nextOutput
  if (out) {
    genVNode(out, `${compId}.c`, inst.lastOutput, cmds, shadow)
  } else if (inst.lastOutput && inst.nextOutput === null) {
    // 输出变 null——清空组件槽位（锚保留——槽位锚 = 输出锚？——组件路径 → 槽位锚
    // 不在 diff 范围（组件级更新不动父槽位——父的 clearSlot 由父 diff 处理）——
    // 组件输出 null 且父未重渲染：锚后的内容需要清除——最小闭环：组件级输出 null
    // 直接由父 diff 处理（父重建时）——此处仅当 lastOutput 存在且无父重建时兜底）
    const parentId = `${compId}`.slice(0, `${compId}`.lastIndexOf('.'))
    const aid = `${parentId}.a${compSlotOf(compId)}`
    cmds.push({ op: 'clearSlot', anchorId: aid, parent: parentId, nextAnchorId: null })
  }
  return cmds
}

/** 组件在父槽位号（路径 {P}.{i} → i） */
function compSlotOf(compId: string): number {
  const seg = compId.slice(compId.lastIndexOf('.') + 1)
  return /^\d+$/.test(seg) ? Number(seg) : 0
}

/** 渲染 vnode——path = 节点路径（确定性）；oldV = 旧树对照（null = 全量创建）
 *  ——纯函数（只读影子——命令是唯一输出） */
function genVNode(vnode: VNode, path: string, oldV: VNode | null, cmds: Command[], shadow: ShadowState, slotAnchor: string | null = null, domParent = parentOfPath(path)): void {
  // 组件：输出从影子实例读（build 已展开——nextOutput 暂存/lastOutput 落地）
  if (typeof vnode.type === 'function') {
    const inst = shadow.getInstance(path)
    if (!inst) throw new Error(`[vdom4] 组件实例缺失：${path}`)
    // 剪枝（nextOutput === lastOutput 同引用 = props 未变——零命令）
    if (inst.nextOutput === inst.lastOutput) return
    const out = inst.nextOutput
    if (out) {
      // 输出内联在组件容器——DOM 父 = 组件 DOM 父（非路径父——.c 是路径空间非 DOM 层）
      genVNode(out, `${path}.c`, inst.lastOutput, cmds, shadow, slotAnchor, domParent)
    }
    // 输出 null（nextOutput = null）：槽位清空由 genSlot 处理（组件路径的槽位锚）
    return
  }
  if (vnode.type === Fragment) {
    genChildren(vnode, path, oldV, cmds, shadow, true)
    return
  }
  // native
  if (oldV != null) {
    // 同类型复用：props diff + children 槽位（锚不动）
    genPatchProps(vnode, oldV, path, cmds)
    genChildren(vnode, path, oldV, cmds, shadow, false)
    return
  }
  // 全量创建（内容插槽位锚后——slotAnchor）
  cmds.push({ op: 'create', id: path, tag: vnode.type as string, vn: vnode })
  for (const [k, val] of Object.entries(vnode.props ?? {})) {
    if (k === 'key' || k === 'children') continue
    if (val != null && val !== false) cmds.push({ op: 'setProp', id: path, key: k, value: val })
  }
  cmds.push({ op: 'insert', id: path, parent: domParent, ref: slotAnchor, after: slotAnchor != null })
  genChildren(vnode, path, null, cmds, shadow, false)
}

/** props diff（同类型复用——仅变化发 setProp——含事件 handler 更新（apply 重绑）） */
function genPatchProps(vnode: VNode, oldV: VNode, path: string, cmds: Command[]): void {
  const oldProps = oldV.props ?? {}
  const newProps = vnode.props ?? {}
  const keys = new Set([...Object.keys(oldProps), ...Object.keys(newProps)])
  for (const k of keys) {
    if (k === 'key' || k === 'children') continue
    if (oldProps[k] === newProps[k]) continue
    if (newProps[k] == null || newProps[k] === false) {
      cmds.push({ op: 'setProp', id: path, key: k, value: null, prev: oldProps[k] })
    } else if (newProps[k] !== undefined) {
      cmds.push({ op: 'setProp', id: path, key: k, value: newProps[k], prev: oldProps[k] })
    }
  }
}

/** children 槽位 diff（锚点法——每槽 [锚, 内容]——槽位游标）
 *  isFrag：Fragment 空间（路径 .f{i}）vs 内容空间（.{i}） */
function genChildren(vnode: VNode, path: string, oldV: VNode | null, cmds: Command[], shadow: ShadowState, isFrag: boolean): void {
  const kids = childrenOf(vnode)
  const oldKids = oldV ? childrenOf(oldV) : []
  const slotKey = path // 逻辑容器（native 自身 / Fragment 输出空间）
  const oldAnchors = shadow.anchorsOf(slotKey)
  let lastAnchor: string | null = null // 新序列最后已处理锚（新锚插它后）
  let cursor = 0 // 旧锚游标（每槽 +1）
  const len = Math.max(kids.length, oldKids.length)
  for (let i = 0; i < len; i++) {
    const c = i < kids.length ? kids[i] : null
    const oc = i < oldKids.length ? oldKids[i] : null
    const contentPath = isFrag ? `${path}.f${i}` : `${path}.${i}`
    const anchorId = `${path}.a${i}`
    const oldAnchor = oldAnchors[cursor] ?? null

    if (c == null && i >= kids.length) {
      // 旧项多余——移除槽位（锚 + 内容区间）
      if (oldAnchor) cmds.push({ op: 'remove', id: oldAnchor })
      cursor++
      continue
    }
    // 锚：复用旧锚（游标位）或新建（插 lastAnchor 后）
    if (!oldAnchor) {
      cmds.push({ op: 'createAnchor', id: anchorId })
      cmds.push({ op: 'insert', id: anchorId, parent: slotKey, ref: lastAnchor, after: lastAnchor != null })
    }
    lastAnchor = oldAnchor ?? anchorId
    cursor++
    const nextAnchor = oldAnchors[cursor] ?? null
    const slotAnchor = oldAnchor ?? anchorId

    // 空洞：只有锚（旧内容清除——锚保留）——组件项移除 = 实例销毁（钩子执行）
    if (c == null || c === false || c === true) {
      if (oc != null) {
        if (typeof (oc as VNode).type === 'function') {
          cmds.push({ op: 'unmountComp', compId: contentPath })
        }
        cmds.push({ op: 'clearSlot', anchorId: slotAnchor, parent: slotKey, nextAnchorId: nextAnchor })
      }
      continue
    }
    // 文本
    if (typeof c === 'string' || typeof c === 'number') {
      const textId = `${path}.t${i}`
      if (oc != null && typeof oc !== 'object') {
        cmds.push({ op: 'setText', id: textId, value: String(c) })
      } else {
        if (oc != null) cmds.push({ op: 'clearSlot', anchorId: slotAnchor, parent: slotKey, nextAnchorId: nextAnchor })
        cmds.push({ op: 'createText', id: textId, value: String(c) })
        cmds.push({ op: 'insert', id: textId, parent: slotKey, ref: slotAnchor, after: true })
      }
      continue
    }
    // vnode 项
    const vn = c as VNode
    if (typeof vn.type === 'function') {
      const inst = shadow.getInstance(contentPath)
      if (!inst) throw new Error(`[vdom4] 组件实例缺失：${contentPath}`)
          if (inst.nextOutput === inst.lastOutput) {
        // 剪枝（props 未变——输出复用——零命令）
        continue
      }
      const out = inst.nextOutput
      if (out) {
        genVNode(out, `${contentPath}.c`, inst.lastOutput, cmds, shadow, slotAnchor, slotKey)
      } else {
        // 输出变 null——清空槽位内容（锚保留）
        if (inst.lastOutput) cmds.push({ op: 'clearSlot', anchorId: slotAnchor, parent: slotKey, nextAnchorId: nextAnchor })
      }
      continue
    }
    // native/Fragment：同类型 patch 或异类型重建
    if (oc != null && typeof oc === 'object' && !Array.isArray(oc) && (oc as VNode).type === vn.type && (oc as VNode).key === vn.key) {
      genVNode(vn, contentPath, oc as VNode, cmds, shadow, slotAnchor, slotKey)
    } else {
      if (oc != null) cmds.push({ op: 'clearSlot', anchorId: slotAnchor, parent: slotKey, nextAnchorId: nextAnchor })
      genVNode(vn, contentPath, null, cmds, shadow, slotAnchor, slotKey)
    }
  }
}

/** 父路径（路径约定——去掉最后一段） */
export function parentOfPath(path: string): string {
  const idx = path.lastIndexOf('.')
  return idx < 0 ? 'root' : path.slice(0, idx)
}
