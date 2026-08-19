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

/** ctx.ui hooks 安全默认（组件 mount 时调用——不抛——可 overrides 覆盖） */
function defaultUi(): Ui {
  return {
    useExternal: (() => undefined) as never,
    useStableRef: ((init: unknown) => ({ current: init })) as never,
    useOpen: ((_init: boolean, controlled?: { open?: boolean; onOpenChange?: (v: boolean) => void }) => ({
      get open() { return controlled?.open ?? false },
      setOpen: (v: boolean) => controlled?.onOpenChange?.(v),
      toggle: () => controlled?.onOpenChange?.(!controlled.open),
    })) as never,
    onUnmount: () => {},
    // useGlobalKey mock：handler 收集到全局通道（测试直接触发——对齐旧测试
    // globalKeys 模式——globalThis.__wf_test_global_keys）
    useGlobalKey: ((matchOrHandler: string | ((e: unknown) => boolean) | ((e: unknown) => void), handler?: (e: unknown) => void) => {
      const fn = handler ?? (typeof matchOrHandler === 'function' ? matchOrHandler as (e: unknown) => void : () => {})
      const keys = ((globalThis as { __wf_test_global_keys?: Array<(e: unknown) => void> }).__wf_test_global_keys ??= [])
      keys.push(fn)
      return () => {}
    }) as never,
    // usePopup 标准 mock：open 读 opts（函数/值）——portal 按 isOpen 条件渲染
    // （open 时返回面板内容——组件测试断言 panel 结构）
    usePopup: ((opts: { isOpen?: boolean | (() => boolean); setOpen?: (v: boolean) => void }) =>
      createPopupMock(() => (typeof opts?.isOpen === 'function' ? opts.isOpen() : (opts?.isOpen ?? false)), opts?.setOpen)) as never,
    usePopupPosition: () => ({ top: 0, left: 0, refresh: () => {} }),
    // useControlled mock：对齐真实语义（受控 → onChange 唯一出口；非受控 →
    // 内部态——不调 onChange——组件 wasControlled 判定依赖 controlled 字段）
    useControlled: ((controlled: { value?: unknown; onChange?: (v: unknown) => void }, def: unknown) => {
      const state = { value: def }
      const isControlled = controlled?.value !== undefined
      return {
        get value() { return controlled?.value ?? state.value },
        controlled,
        setValue: (v: unknown) => { if (isControlled) controlled?.onChange?.(v); else state.value = v },
      }
    }) as never,
    useScrollPosition: () => ({ y: 0, x: 0, refresh: () => {} }),
    useInView: () => ({ isIn: false, ready: false, ref: () => {}, observe: () => {}, disconnect: () => {} }),
    // useControlledInput mock：keyword/selectedLabel 可变（组件输入态——
    // onInput → setKeyword 驱动发送/回填）
    useControlledInput: ((controlled: { value?: string; onChange?: (v: string) => void }) => {
      const state = { keyword: controlled?.value ?? '', selectedLabel: '', composing: false }
      return {
        controlled,
        get value() { return controlled?.value ?? state.keyword },
        setValue: (v: string) => controlled?.onChange?.(v),
        get keyword() { return state.keyword },
        setKeyword: (v: string) => { state.keyword = v },
        get selectedLabel() { return state.selectedLabel },
        setSelectedLabel: (v: string) => { state.selectedLabel = v },
        get isComposing() { return state.composing },
        onCompositionStart: () => { state.composing = true },
        onCompositionEnd: () => { state.composing = false },
      }
    }) as never,
    useDragDrop: (() => ({ draggableProps: {}, dropProps: {} })) as never,
    useMedia: () => false,
    useBreakpoint: () => '',
    useChat: () => ({ messages: [], status: 'idle', send: async () => {}, stop: () => {}, reset: () => {}, approve: () => {}, subscribe: () => () => {} }) as never,
    // useTween mock：直落（reduced 语义）——value 普通可写属性（组件直接
    // 赋值 `(tween as any).value = target`——非动画直落路径）+ reset 更新
    useTween: ((target: number) => {
      const handle: { value: number; reset: (to: number) => void } = { value: target, reset: () => {} }
      handle.reset = (to: number) => { handle.value = to }
      return handle
    }) as never,
    useDrag: () => ({ onPointerDown: () => {} }),
    useVisualViewport: () => ({ height: 0, offsetTop: 0, keyboardOpen: false }),
    useReducedMotion: () => false,
  }
}

/** 标准测试 ctx（vdom 形状：ctx.render 顶层 + ctx.ui hooks mock）
 *  **per-ctx hook 缓存**：有状态 hooks（useControlled/useOpen/
 *  useControlledInput）跨渲染保持——对齐 vdom hook 状态缓存语义——
 *  非受控内部态在多次 render（mountComponent/同实例 render）间不丢失 */
export function createTestCtx(overrides?: { ui?: Partial<Ui>; browser?: unknown }): UIContext {
  // hook 缓存按类型固定槽（组件每次渲染同 hook 同槽——跨渲染保持——
  // 对齐 vdom「每次渲染 hook 序号从头计」语义）
  const hookCache = new Map<string, unknown>()
  const hook = <T>(type: string, initial: T): { state: T } => {
    const state = (hookCache.get(type) as T | undefined) ?? initial
    hookCache.set(type, state)
    return { state }
  }
  const baseUi = defaultUi()
  const base: any = {
    render: async () => {},
    data: { get: async () => undefined, set: () => {}, has: () => false },
    onUnmount: () => {},
    afterRender: () => {},
    params: {},
    query: {},
    ui: {
      ...baseUi,
      // 有状态 hooks：per-ctx 缓存（非受控内部态跨渲染保持）
      useControlled: ((controlled: { value?: unknown; onChange?: (v: unknown) => void }, def: unknown) => {
        const { state } = hook('useControlled', { value: def })
        const isControlled = controlled?.value !== undefined
        return {
          get value() { return controlled?.value ?? state.value },
          controlled,
          setValue: (v: unknown) => { if (isControlled) controlled?.onChange?.(v); else state.value = v },
        }
      }) as never,
      useOpen: ((init: boolean | { open?: boolean; onOpenChange?: (v: boolean) => void }, controlled?: { open?: boolean; onOpenChange?: (v: boolean) => void }) => {
        const opts = typeof init === 'object' ? init : undefined
        const ctrl = opts ?? controlled
        const { state } = hook('useOpen', { open: typeof init === 'boolean' ? init : false })
        return {
          get open() { return ctrl?.open ?? state.open },
          setOpen: (v: boolean) => { if (ctrl?.onOpenChange) ctrl.onOpenChange(v); else state.open = v },
          toggle: () => { if (ctrl?.onOpenChange) ctrl.onOpenChange(!(ctrl.open ?? state.open)); else state.open = !state.open },
        }
      }) as never,
      useControlledInput: ((controlled: { value?: string; onChange?: (v: string) => void }) => {
        const { state } = hook('useControlledInput', {
          keyword: controlled?.value ?? '', selectedLabel: '', composing: false,
        })
        return {
          controlled,
          get value() { return controlled?.value ?? state.keyword },
          setValue: (v: string) => controlled?.onChange?.(v),
          get keyword() { return state.keyword },
          setKeyword: (v: string) => { state.keyword = v },
          get selectedLabel() { return state.selectedLabel },
          setSelectedLabel: (v: string) => { state.selectedLabel = v },
          get isComposing() { return state.composing },
          onCompositionStart: () => { state.composing = true },
          onCompositionEnd: () => { state.composing = false },
        }
      }) as never,
      useTween: ((target: number) => {
        const { state } = hook('useTween', { value: target })
        const handle: { value: number; reset: (to: number) => void } = { value: state.value, reset: () => {} }
        handle.reset = (to: number) => { handle.value = to; state.value = to }
        return handle
      }) as never,
      ...(overrides?.ui ?? {}),
    },
    ...(overrides?.browser ? { browser: overrides.browser } : {}),
  }
  return base as UIContext
}

/** usePopup 标准 mock（get open 渲染期读最新——portal 按 isOpen 条件渲染） */
export function createPopupMock(isOpen: () => boolean = () => false, setOpen?: (v: boolean) => void) {
  return {
    get open() { return isOpen() },
    setOpen: setOpen ?? ((_v: boolean) => {}),
    refresh: () => {},
    portal: (content: any, _key?: string) => (isOpen() ? content : null),
    wrapProps: {},
  }
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
  const stream = renderToStream(vnode, {} as UIContext, registry)
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
    const stream = diffStream(prev, next, {} as UIContext, cached.registry)
    for await (const cmd of stream) cached.applier.apply(cmd)
  } else {
    await mountToDom(container, next, _ctx)
  }
  return next
}

/** build（无调用方语义——兼容签名：返回 vnode 本身） */
export function buildToDom(vnode: any, _ctx: any): Promise<any> {
  return Promise.resolve(vnode)
}
