/**
 * weifuwu/ui-dom/testing — 组件测试原语（vue/test-utils 模式）
 *
 * 收敛组件测试脚手架的官方工具：94 个测试文件曾手抄 renderVNode（3 种变体）、
 * 114 个手抄 mockCtx、20 个手抄 VNode 树遍历、25 个手抄同实例 mount 模式。
 *
 * 用法（node --test 直跑，零依赖）：
 * ```ts
 * import { renderVNode, mountComponent, findByClass, createTestCtx, createPopupMock } from '../../ui-dom/testing.ts'
 * // 或 npm 用户：import { ... } from 'weifuwu/ui-dom/testing'
 * ```
 *
 * 纪律（AGENTS.md 测试节）：
 * - `renderVNode`：两阶段组件渲染到 VNode 层（**只一层**——子组件保留函数引用，断言 type 而非 DOM）
 * - `mountComponent`：**同实例 re-render**（内部 `let` 状态流转测试）——`renderVNode` 每次是新 mount，状态会丢
 * - `findByClass`：class token 精确匹配（`split(' ')`——`includes` 会误匹配 `wf-a` ⊃ `wf-a-b`）
 * - `walkVNode`：处理嵌套数组 children（渲染器不展开嵌套数组——Select optgroup 教训）
 */

import type { VNode } from './vnode.ts'
import type { WfuiContext } from './types.ts'
import { mountCommand } from './vdom/mount.ts'
import { patchValue } from './vdom/diff.ts'
import { buildVNode } from './vdom/build.ts'
import { createRegistry } from './vdom/registry.ts'

/**
 * 组件 DOM 级测试辅助（vdom 引擎）：
 * - mountToDom：buildVNode（await 工厂）→ renderValue → append（等挂载完成）
 * - patchToDom：同树 patch（patchValue 兼容签名——第 5 参 ctx）
 * - buildToDom：buildVNode 预构建（vdom 签名：reg 参数可省略）
 */
export function mountToDom(container: Element, vnode: VNode, ctx: any): Promise<void> {
  return new Promise<void>((resolve) => {
    mountCommand(container as HTMLElement, vnode, ctx, { onMounted: resolve })
  })
}
export async function patchToDom(container: Element, node: Node | null, prev: any, next: any, ctx: any): Promise<any> {
  // vdom 不变量：diff 前必须 buildVNode（组件 _render 已设——否则 renderValue 抛「not built」）
  await buildVNode(next, ctx, prev, (ctx as any).__registry)
  return patchValue(container, node, prev, next, {
    browser: ctx.browser ?? (ctx as any).__browser,
    registry: (ctx as any).__registry,
  })
}
export function buildToDom(vnode: VNode, ctx: any): Promise<any> {
  const reg = (ctx as any).__registry ?? ((ctx as any).__registry = createRegistry())
  return buildVNode(vnode, ctx, undefined, reg)
}

// ── 两阶段组件渲染 ──────────────────────────────────────

/**
 * 渲染两阶段异步组件到 VNode 层：await 工厂（mount）+ render 一次（内层）。
 * **只渲染一层**——子组件 VNode 的 type 是组件函数（断言 === Comp），不展开 DOM。
 * 统一 async 签名（weifuwu 只支持 async 两阶段组件）——总是返回 Promise<VNode>。
 * 注意：每次调用是**新 mount**——内部 `let` 状态不保留；测状态流转用 `mountComponent`。
 */
export async function renderVNode(Comp: any, props: Record<string, any>, ctx: WfuiContext): Promise<VNode | null> {
  const renderFn = await Comp(props, ctx)
  return typeof renderFn === 'function' ? renderFn(props) : renderFn
}

/**
 * 同实例渲染器：await 工厂（mount 一次），之后每次调用重跑内层 render（保留内部 `let` 状态）。
 * 交互测试（点击/输入后状态流转）必须用这个——`renderVNode` 每次是新 mount 会丢状态。
 */
export async function mountComponent(Comp: any, props: Record<string, any>, ctx: WfuiContext): Promise<() => VNode | null> {
  const inner = await Comp(props, ctx)
  return () => (typeof inner === 'function' ? inner(props) : inner)
}

// ── VNode 树遍历/查询 ───────────────────────────────────

/**
 * 深度遍历 VNode 树（含嵌套数组 children——渲染器不展开嵌套数组，
 * 测试遍历必须处理：`[[div, div]]` 一层层深入）。
 * visitor 对每个节点调用（含根）。
 */
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

/** 收集所有 class token 精确匹配的节点（split(' ')——includes 会误匹配前缀） */
export function findByClass(vnode: unknown, cls: string): any[] {
  const out: any[] = []
  walkVNode(vnode, (n) => {
    if (typeof n?.props?.class === 'string' && n.props.class.split(' ').includes(cls)) out.push(n)
  })
  return out
}

// ── ctx 构造 ───────────────────────────────────────────

/**
 * 标准测试 ctx：`{ ui: { render, ready: true } }` + 覆盖。
 * overrides.ui 部分覆盖（可注入 usePopup/useScrollPosition 等任意原语 mock）。
 */
export function createTestCtx(overrides?: { ui?: Partial<WfuiContext['ui']>; browser?: WfuiContext['browser'] }): WfuiContext {
  const base: any = {
    ui: {
      render: () => {},
      ready: true,
      // useExternal 默认 no-op：订阅记录但不触发渲染（测试用 renderVNode 手动断言）
      useExternal: () => undefined,
    },
  }
  const merged = overrides
    ? { ui: { ...base.ui, ...(overrides.ui ?? {}) }, ...(overrides.browser ? { browser: overrides.browser } : {}) }
    : base
  return merged as WfuiContext
}

/**
 * usePopup 标准 mock：`get open()`（渲染期读最新）+ setOpen（默认 no-op；
 * 传第二个参数可转发到组件传入的 setOpen——Escape/外部点击关闭测试需要真实写 $）+ refresh + portal
 * （按 isOpen 条件渲染——closed 返回 null，模拟真实 popup 不挂载面板）。
 * ```ts
 * const ctx = createTestCtx({ ui: { usePopup: (opts: any) => createPopupMock(() => opts.isOpen(), opts.setOpen) } })
 * ```
 */
export function createPopupMock(isOpen: () => boolean = () => false, setOpen?: (v: boolean) => void) {
  return {
    get open() { return isOpen() },
    setOpen: setOpen ?? ((_v: boolean) => {}),
    refresh: () => {},
    portal: (content: any, _key?: string) => (isOpen() ? content : null),
    wrapProps: {},
  }
}
