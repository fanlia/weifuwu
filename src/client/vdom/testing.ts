/**
 * vdom — 测试不变量 helper（覆盖标准 §1.2/§2——禁止手抄/禁止只查存在性）
 *
 * 每个渲染测试强制断言的不变量：
 * - **同构**：childNodes.length === 期望形态序列长度（占位锚 ↔ 真实节点
 *   互换长度恒定——塌缩即 bug）
 * - **位置**：数组第 i 项 ⟷ childNodes 第 i 个（位置错位即 bug）
 * - **引用**：同 key/同位置复用项 DOM 节点引用不变（重建即 bug）
 * - **资源**：remove/done 后事件表/ref 表/portal 容器清理（残留即 bug）
 */

/** 简易断言（browser 平台——不依赖 node:assert——测试基建 bundle 安全） */
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function assertEqual(a: unknown, b: unknown, msg?: string): void {
  if (a !== b) throw new Error(`${msg ?? 'assertEqual'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`)
}
function assertOk(cond: unknown, msg?: string): asserts cond {
  if (!cond) throw new Error(msg ?? 'assertOk')
}

export type Shape = 'element' | 'text' | 'hole' | 'comment'

/** 节点形态判定（跨 realm 安全——nodeType 而非 instanceof） */
export function shapeOf(node: Node): Shape {
  if (node.nodeType === 1) return 'element'
  if (node.nodeType === 3) return 'text'
  if (node.nodeType === 8) return 'hole'
  return 'comment'
}

/**
 * 同构断言：container.childNodes 与期望形态序列**逐位一致**
 * （长度 + 位置 + 类型）——childNodes.length 恒等于序列长度
 */
export function assertIsomorphic(
  container: HTMLElement,
  expectShapes: Shape[],
  msg = '同构（childNodes 长度 + 位置 + 类型）',
): void {
  assertEqual(container.childNodes.length, expectShapes.length, `${msg}——长度（塌缩/多余即 bug）`)
  for (let i = 0; i < expectShapes.length; i++) {
    assertEqual(
      shapeOf(container.childNodes[i]),
      expectShapes[i],
      `${msg}——位置 ${i}（第 i 项 ⟷ childNodes 第 i 个）`,
    )
  }
}

/** 位置断言：第 i 个 childNode 是期望类型（边界位置——位置 0/末尾重点） */
export function assertSlot(
  container: HTMLElement,
  index: number,
  expect: Shape,
  msg = `位置 ${index}`,
): void {
  assertOk(container.childNodes[index], `${msg}——存在`)
  assertEqual(shapeOf(container.childNodes[index]), expect, `${msg}——类型`)
}

/** 引用断言：复用项 DOM 节点引用不变（重建即 bug——焦点/状态丢失） */
export function assertKept<T extends Node>(
  container: HTMLElement,
  selector: string,
  before: T,
  msg = '复用项 DOM 引用保持（不重建）',
): asserts before is T {
  const after = container.querySelector(selector)
  assertOk(after, `${msg}——新项存在`)
  assertEqual(after, before, msg)
}

/** 往返断言：状态切换后回到原 DOM 形态（可逆性——状态不漂移） */
export async function assertRoundTrip(
  toggle: () => void,
  assertOff: () => void,
  assertOn: () => void,
  waitFor: (fn: () => boolean) => Promise<void>,
  rounds = 2,
  msg = '往返可逆（状态不漂移）',
): Promise<void> {
  for (let r = 0; r < rounds; r++) {
    toggle()
    await waitFor(assertOn as unknown as () => boolean)
    toggle()
    await waitFor(assertOff as unknown as () => boolean)
  }
}

// ═══════════════════════════════════════════════════════════════
// 组件测试原语（P2 组件库迁移——同签名 ui-dom/testing 兼容——
// 测试代码零改动迁移：import 路径替换即可）
// ═══════════════════════════════════════════════════════════════

import type { VNode } from './core/vnode.ts'
import type { UIContext, Ui } from './context/UIContext.ts'
import { renderToStream } from './core/build.ts'
import { diffStream } from './core/diff/index.ts'
import { CommandApplier } from './core/patch/index.ts'
import { createComponentRegistry, type ComponentRegistry } from './core/node/component.ts'
import { createUi } from './hooks/env.ts'
import type { Browser } from './browser/Browser.ts'

/** 两阶段组件渲染到 VNode 层（只一层——子组件保留函数引用——断言 type） */
export async function renderVNode(Comp: any, props: Record<string, any>, ctx: UIContext): Promise<VNode | null> {
  const renderFn = await Comp(props, ctx)
  return typeof renderFn === 'function' ? renderFn(props) : renderFn
}

/** 同实例渲染器（mount 一次——re-render 保留内部 let 状态） */
export async function mountComponent(Comp: any, props: Record<string, any>, ctx: UIContext): Promise<() => VNode | null> {
  const inner = await Comp(props, ctx)
  return () => (typeof inner === 'function' ? inner(props) : inner)
}

/** 深度遍历 VNode 树（含嵌套数组 children） */
export function walkVNode(vnode: unknown, visit: (n: any) => void): void {
  if (vnode == null || typeof vnode !== 'object') return
  if (Array.isArray(vnode)) { for (const c of vnode) walkVNode(c, visit); return }
  visit(vnode)
  const kids = (vnode as any)?.props?.children
  if (kids != null) walkVNode(kids, visit)
}

/** 按谓词查询第一个匹配节点（深度优先） */
export function findVNode(vnode: unknown, pred: (n: any) => boolean): any {
  let found: any
  walkVNode(vnode, (n) => { if (!found && pred(n)) found = n })
  return found
}

/** 收集所有 class token 精确匹配的节点（split(' ')——includes 误匹配前缀） */
export function findByClass(vnode: unknown, cls: string): any[] {
  const out: any[] = []
  walkVNode(vnode, (n) => {
    if (typeof n?.props?.class === 'string' && n.props.class.split(' ').includes(cls)) out.push(n)
  })
  return out
}

// ── DOM 级测试辅助（vdom 引擎：renderToStream/diffStream + CommandApplier）──

const domCache = new WeakMap<Element, { registry: ComponentRegistry; applier: CommandApplier }>()

/** mount：vnode → 全量命令流 → apply（容器内渲染——等挂载完成） */
export async function mountToDom(container: Element, vnode: any, _ctx: any): Promise<void> {
  const doc = (container as HTMLElement).ownerDocument
  container.innerHTML = ''
  const registry = createComponentRegistry()
  const applier = new CommandApplier(container as HTMLElement, doc, registry)
  domCache.set(container, { registry, applier })
  const stream = renderToStream(vnode, _ctx ?? ({} as UIContext), registry)
  for await (const cmd of stream) applier.apply(cmd)
}

/** patch：prev → next diff 精准（同树 patch——容器缓存 registry） */
export async function patchToDom(container: Element, _node: Node | null, prev: any, next: any, _ctx: any): Promise<any> {
  const cached = domCache.get(container)
  if (next == null) {
    container.innerHTML = ''
    return null
  }
  if (cached) {
    const stream = diffStream(prev, next, _ctx ?? ({} as UIContext), cached.registry)
    for await (const cmd of stream) cached.applier.apply(cmd)
  } else {
    await mountToDom(container, next, _ctx)
  }
  return next
}

/** 卸载清理（applier.dispose——移除 document 事件监听——测试防泄漏——
 *  多 mount 残留监听导致 pointerup 等触发旧实例（拖拽多次 commit——
 *  真实事故）） */
export function disposeToDom(container: Element): void {
  const cached = domCache.get(container)
  cached?.applier.dispose()
  domCache.delete(container)
}

/** build（无调用方语义——兼容签名：返回 vnode 本身） */
export function buildToDom(vnode: any, _ctx: any): Promise<any> {
  return Promise.resolve(vnode)
}
