/**
 * vdom transform — 节点转换状态机（节点类型之间的转换渲染）
 *
 * 场景（diff 重渲染——旧节点 × 新节点类型不同）：
 *   null <-> component / null <-> fragment / component <-> fragment /
 *   element <-> component / hole <-> element / text <-> element ...
 *
 * 核心不变量（设计规则 §4.0/§6.3——占位法）：
 * - **childNodes 长度恒等于 children 数组长度**——任何转换保持节点数 1:1
 *   （空洞占位锚是 DOM 里的真实节点——转换 = 锚 ↔ 真实节点 replaceChild 互换——
 *   禁止 removeChild 塌缩）
 * - 组件输出多根 = 隐式 Fragment——锚点管理（首/尾锚——_childAnchors 语义）
 * - 组件卸载 = unmountComp（onUnmounts 清理）+ 输出节点移除
 *
 * 转换表（table.ts）：oldKind × newKind → 策略函数（各状态文件实现）
 *   text.ts / hole.ts / element.ts / component.ts / fragment.ts
 */

import type { VNodeChild } from '../vnode.ts'
import type { ComponentRegistry } from '../node/component.ts'

export type NodeState = 'text' | 'hole' | 'element' | 'component' | 'fragment' | 'array'

/** 转换上下文（diff 调用——命令发射 + 新侧渲染 + 位置信息） */
export interface TransformContext {
  /** 命令发射（旧侧让位：remove/unmountComp——diff 生成的命令序列） */
  emit(cmd: unknown): void
  /** **新侧渲染（记录——不构造）**（2027-09 流化：延迟构造归 transformV2
   *  ——订阅时构造——C1 fuzz seed=11 的顺序语义结构性保证——旧段 dispose
   *  在前——不再有 await 时序不保的 pendingSink hack） */
  emitNode(v: VNodeChild, parent: string, index: number, ref: string | null): void
  /** 旧节点锚/元素 id（旧树 id——diff 的 oldId 空间） */
  oldId: string
  /** 新节点 id（新树 id——diff 的 newId 空间） */
  newId: string
  /** 父节点 id（'root' = 根容器） */
  parent: string
  /** 新侧位置 index（emitNode 用） */
  index: number
  /** 前一个兄弟 id（插入位置——null = 尾部） */
  ref: string | null
  /** 旧组件实例 id（component 转换时——卸载/复用） */
  oldCompId?: string
  /** 组件实例注册表（区间清理查 lastOutput——组件多根完整移除——G2） */
  registry?: ComponentRegistry | null
}

/** 转换策略函数（各状态文件实现——**完整转换**：旧侧让位命令 + ctx.emitNode
 *  新侧记录——同步执行——新侧构造由 transformV2 延迟（订阅时）） */
export type TransitionFn = (
  oldNode: unknown,
  nextNode: VNodeChild,
  ctx: TransformContext,
) => void | Promise<void>
