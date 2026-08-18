/**
 * vdom4 build — 纯展开（组件展开——查影子复用实例——**无副作用**）
 *
 * 组件复用：同位置同类型（路径 compId）→ 查影子实例（工厂不重跑——renderFn/
 * lastOutput 保持）——props 未变 → 复用 lastOutput（零展开）；props 变 → 重跑
 * renderFn（同步——类型强制）→ nextOutput 暂存（diff 后 commit）。
 * 工厂（mount 一次）可 await ctx.data（管道保证——不挂起）。
 *
 * 路径约定（确定性 compId/节点 id——同声明同路径——SSR/客户端一致）：
 *   root              根
 *   {P}.{i}           父 P 的 children 槽位 i 的内容（native 元素/组件实例）
 *   {P}.t{i}          槽位 i 的文本
 *   {P}.a{i}          槽位 i 的锚
 *   {P}.c             组件输出空间（输出根）
 *   {P}.c.{i}         输出空间 children 槽位
 *   {P}.c.f{i}        Fragment 输出内部槽位（f = fragment 空间）
 */

import type { VNode, VNodeChild, Component, RenderFn, Ctx } from './types.ts'
import { Fragment, childrenOf } from './types.ts'
import type { ShadowState } from './shadow.ts'
import { deepFreeze } from './util.ts'

/** props 浅比较（剪枝——引用比较——冻结保证内容不变） */
export function propsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a)
  const kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  for (const k of ka) if (a[k] !== b[k]) return false
  return true
}

/** 构建（纯展开——写 shadow 的 nextOutput/实例——不写 DOM 不 emit）
 *  vnode：入参声明；oldV：旧树同位置对照；compPath：当前路径（组件/输出空间）；
 *  shadow：影子（读实例/写 nextOutput）；ctx：组件 ctx 注入 */
export async function buildVNode(
  vnode: VNode,
  ctx: Ctx,
  shadow: ShadowState,
  oldV?: VNode | null,
  compPath = 'root',
  createCompCtx?: (compId: string) => Ctx,
  isRoot = false,
): Promise<VNode> {
  // 组件
  if (typeof vnode.type === 'function') {
    const v = { ...vnode }
    const reuse = oldV != null && typeof oldV === 'object' && oldV.type === vnode.type && oldV.key === vnode.key
      if (reuse) {
      const inst = shadow.getInstance(compPath)
      if (!inst) throw new Error(`[vdom4] 组件实例缺失：${compPath}（影子未注册——复用判定与实例表失配）`)
      // 剪枝：props 未变 → 复用 lastOutput（零展开零 RENDER）——nextOutput 设同引用
      // （diff 判定：nextOutput === lastOutput = 剪枝——区别于「输出 null」（null））
      // 根组件不剪枝（isRoot——内部状态（闭包 let）变化时 props 不变——剪枝跳过
      // renderFn = 读旧闭包值——根必须重跑——vdom3 同款语义）
      if (!isRoot && propsEqual(inst.lastProps, vnode.props)) {
        inst.nextOutput = inst.lastOutput
        return v // 纯数据 vnode——输出在影子（lastOutput）——diff 自然零命令
      }
      // props 变/根重跑 → 重跑 renderFn（await——ctx.data 管道保证——无竞速）
      const output = await inst.renderFn(vnode.props)
      inst.lastProps = { ...vnode.props }
      if (output) {
        const built = await buildVNode(output, ctx, shadow, inst.lastOutput, `${compPath}.c`, createCompCtx, false)
        inst.nextOutput = built // 暂存（diff 后 commit——旧对照保持）
        inst.outputNull = false
      } else {
        inst.nextOutput = null
        inst.outputNull = true // 输出 null——diff 用旧 lastOutput 判定——commit 时清
      }
      return v
    }
    // mount（工厂——可 await ctx.data——管道保证不挂起）——**per-component ctx**
    // （render 闭包绑定 compId——事件回调/工厂内 ctx.render 都是本组件级更新）
    const compCtx = createCompCtx ? createCompCtx(compPath) : ctx
    const renderFn = await (vnode.type as Component)(vnode.props, compCtx)
    if (!renderFn) throw new Error(`[vdom4] 工厂未返回 renderFn：${compPath}`)
    const inst: import('./shadow.ts').CompInstance = { type: vnode.type, renderFn, lastProps: { ...vnode.props }, lastOutput: null, nextOutput: null }
    shadow.setInstance(compPath, inst)
    const output = await renderFn(vnode.props)
    if (output) {
      const built = await buildVNode(output, ctx, shadow, null, `${compPath}.c`, createCompCtx, false)
      inst.nextOutput = built
    }
    return v
  }
  // Portal：内容构建（路径 .p 空间——与 diff 的 portal 分支一致——内容组件实例注册）
  if (typeof vnode.type === 'symbol' && vnode.props?.portalKey != null) {
    const content = childrenOf(vnode)[0] ?? null
    const oldContent = oldV && typeof oldV.type === 'symbol' && oldV.props?.portalKey != null ? (childrenOf(oldV)[0] ?? null) : null
    if (content != null && typeof content === 'object' && !Array.isArray(content)) {
      const built = await buildVNode(content as VNode, ctx, shadow, oldContent != null && typeof oldContent === 'object' ? oldContent as VNode : null, `${compPath}.p`, createCompCtx, false)
      return { ...vnode, children: [built] }
    }
    return vnode
  }
  // Fragment：展开在父空间（f 空间——输出内部）
  // 结构判定（symbol 且非 portal——兼容组件库的 v3 Fragment symbol——不依赖恒等）
  if (typeof vnode.type === 'symbol' && vnode.props?.portalKey == null) {
    const r = await buildChildren(vnode, ctx, shadow, oldV ?? null, compPath, true, createCompCtx)
    if (r.unchanged && oldV != null && propsEqual(oldV.props, vnode.props)) return oldV
    return { ...vnode, children: r.newKids }
  }
  // native：children 递归（槽位路径 / keyed 业务路径）
  const r = await buildChildren(vnode, ctx, shadow, oldV ?? null, compPath, false, createCompCtx)
  // 结构共享：无变化 + props 相同 → 复用旧 vnode（零克隆——diff 零命令）
  if (r.unchanged && oldV != null && propsEqual(oldV.props, vnode.props) && childrenOf(oldV).length === childrenOf(vnode).length) return oldV
  return { ...vnode, children: r.newKids }
}

/** children 构建（keyed 配对 / 位置配对——路径：keyed 项 .k{key}（业务身份——
 *  重排稳定——组件实例复用）；unkeyed 项 .{i}/.f{i}（位置身份）） */
async function buildChildren(
  vnode: VNode, ctx: Ctx, shadow: ShadowState, oldV: VNode | null,
  compPath: string, isFrag: boolean, createCompCtx?: (compId: string) => Ctx,
): Promise<{ newKids: VNodeChild[]; unchanged: boolean }> {
  const kids = childrenOf(vnode)
  const oldKids = oldV ? childrenOf(oldV) : []
  const newKids: VNodeChild[] = []
  let changed = false
  const isVNodeObj = (x: VNodeChild): x is VNode => x != null && typeof x === 'object' && !Array.isArray(x)
  // keyed 判定：全部带 key 即 keyed（不依赖长度——单 keyed 项也走 .k{key} 路径——
  // 长度依赖会导致路径格式翻转（.0 → .k1——组件实例漂移——Toast 增删抓出））
  const isKeyed = kids.length > 0 && kids.every((k) => isVNodeObj(k) && (k as VNode).key != null)

  if (isKeyed) {
    // keyed：同 key 配对（旧 vnode 对照——重排后组件实例复用）
    const oldMap = new Map<string, VNode>()
    oldKids.forEach((k, i) => { if (isVNodeObj(k) && (k as VNode).key != null) oldMap.set((k as VNode).key!, k as VNode) })
    let idx = 0
    for (const c of kids) {
      const vn = c as VNode
      const oc = oldMap.get(vn.key!) ?? null
      const built = await buildVNode(vn, ctx, shadow, oc, `${compPath}.k${vn.key}`, createCompCtx, false)
      newKids.push(built)
      if (built !== c) changed = true
      idx++
    }
  } else {
    let i = 0
    for (const c of kids) {
      if (isVNodeObj(c)) {
        const oc = oldKids[i]
        const built = await buildVNode(c, ctx, shadow, oc != null && typeof oc === 'object' ? oc : null, isFrag ? `${compPath}.f${i}` : `${compPath}.${i}`, createCompCtx, false)
        newKids.push(built)
        if (built !== c) changed = true
      } else {
        newKids.push(c)
      }
      i++
    }
  }
  return { newKids, unchanged: !changed }
}

export { deepFreeze }
