/**
 * 终态等价验证 helper（KEYED-MOVE M2 提取——2027-10）
 *
 * **提取动机**：verifyEquivalence 原在 reconcile.test.ts 内——key-move
 * 等新契约 import 它会传染其顶层 test()（node:test import 即注册）——
 * helper 独立化 = 单跑某文件不拖家带口。
 *
 * 参考世界隔离（C1 测试纪律）+ 双树对账（维度 7）语义不变——单一实现源。
 */
import type { VNode } from '../../../client/vdom/core/vnode.ts'
import { renderToStreamV2, diffToStreamV2 } from '../../../client/vdom/core/v2/integrate.ts'
import { createComponentRegistry, type ComponentRegistry } from '../../../client/vdom/core/node/component.ts'
import { childrenOf, slotCount } from '../../../client/vdom/core/node/children.ts'
import { pathId } from '../../../client/vdom/core/node/native.ts'
import { Sim, drainStream } from '../sim.ts'

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
  const refSegs = new Map<string, import('../../../client/vdom/core/v2/diff.ts').Segment>()
  for (const c of await drainStream(renderToStreamV2(newTree, {}, createComponentRegistry(), refSegs))) ref.apply(c)
  // **段表共享（2027-08——v2 桥迁移关键）**：build/diff 同一段表——组件
  // 段跨渲染复用（工厂不重跑）——各建新表 = 段断裂 = 全量重挂载 = 不等价
  const segs: Map<string, import('../../../client/vdom/core/v2/diff.ts').Segment> = new Map()
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

