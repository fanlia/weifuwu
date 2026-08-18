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
// vdom3 引擎（vdom2 删除后——mount/patch/build 的 vdom3 实现——同 API）
import { mount as v3Mount, patch as v3Patch, registry as v3Registry } from './vdom3/render.ts'
import { NodeRegistry } from './vdom3/registry.ts'
import { buildVNode as v3Build } from './vdom3/build.ts'
import type { V3Ctx } from './vdom3/types.ts'

/**
 * 组件 DOM 级测试辅助（vdom 引擎）：
 * - mountToDom：buildVNode（await 工厂）→ renderValue → append（等挂载完成）
 * - patchToDom：同树 patch（patchValue 兼容签名——第 5 参 ctx）
 * - buildToDom：buildVNode 预构建（vdom 签名：reg 参数可省略）
 */
/** vdom3 版（vdom2 删除后——同 API——组件测试零改动）
 *  vdom3 build 纯函数式（prev 不就地修改）——patch 对照需「上次 built」——
 *  按容器缓存（测试的 prev = renderFn 输出（原始）——缓存补全对照链） */
const builtCache = new WeakMap<Element, unknown>()
const regCache = new WeakMap<Element, NodeRegistry>()

export function mountToDom(container: Element, vnode: any, _ctx: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    void (async () => {
      try {
        // vdom3 portal 容器为全局单例（#__wf_portal）——并发测试残留会污染断言
        // （open=false 无 DOM 断言找到他文件残留）——挂载前清理
        document.getElementById('__wf_portal')?.remove()
        // per-container 独立 registry（并发测试隔离——vdom2 per-app 模型对齐）
        const reg = new NodeRegistry()
        const built = await v3Build(vnode, {} as V3Ctx)
        v3Mount(built, container as HTMLElement, reg)
        builtCache.set(container, built)
        regCache.set(container, reg)
        resolve()
      } catch (e) {
        reject(e)
      }
    })()
  })
}
export async function patchToDom(container: Element, _node: Node | null, _prev: any, next: any, _ctx: any): Promise<any> {
  const oldBuilt = builtCache.get(container) ?? null
  const reg = regCache.get(container) ?? v3Registry
  // renderFn 返回 null（条件移除——测试语义）→ 清空容器
  if (next == null) {
    container.innerHTML = ''
    builtCache.set(container, null)
    return null
  }
  const built = await v3Build(next, {} as V3Ctx, oldBuilt as any)
  if (oldBuilt) v3Patch(oldBuilt as any, built, container as HTMLElement, undefined, reg)
  else v3Mount(built, container as HTMLElement, reg)
  builtCache.set(container, built)
  return built
}
export function buildToDom(vnode: any, _ctx: any): Promise<any> {
  return v3Build(vnode, {} as V3Ctx)
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
      // 常用 hooks mock（组件消费面——vdom3 补测）
      useVisualViewport: () => ({ keyboardOpen: false, height: 0, offsetTop: 0 }),
      useScrollPosition: () => ({ y: 0 }),
      useStableRef: () => () => {},
      useGlobalKey: () => () => {},
      useReducedMotion: () => false,
      useControlledInput: (opts: any) => ({
        value: opts.value ?? '', setValue: opts.onChange ?? (() => {}),
        keyword: opts.value ?? '', setKeyword: () => {}, setSelectedLabel: () => {},
      }),
      useOpen: (opts: any) => ({ get open() { return !!opts.open }, setOpen: opts.onOpenChange ?? (() => {}), triggerProps: {} }),
      // §5.4 弹窗纪律：usePopup 标准 mock（默认关闭——portal 按 isOpen 条件渲染——
      // 组件测试可用 overrides.ui.usePopup 注入 createPopupMock）
      usePopup: (_opts: any) => ({ open: false, setOpen: (_v: boolean) => {}, refresh: () => {}, portal: (_c: any, _k?: string) => null, wrapProps: {} }),
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
