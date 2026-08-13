/**
 * ui-dom/middleware/serve — uiServe（UIRouter + vdom2 引擎）前端中间件
 *
 * 渲染管线（vdom2）：buildVNode（async 预构建 await 全部）→ renderValue/patchValue（同步落地）
 * 分层：vdom2/ 纯引擎 + ui-dom/context.ts 组装 ctx（hooks/popup/data/route）——
 * 本文件只做「路由 → 渲染」接线（不触碰 vdom 引擎内部）。
 */

import { createClientBrowser } from '../browser.ts'
import { h } from '../vnode.ts'
import { uiLog } from '../debug.ts'
import { trace, traceEnabled, nextTraceId, initVdomTrace } from '../vdom2/trace.ts'
import type { UIRouter } from '../router.ts'
import { isNative, type VNode } from '../vnode.ts'
import type { WfuiContext, UIContext } from '../types.ts'
import { buildVNode } from '../vdom2/build.ts'
import { renderValue } from '../vdom2/render.ts'
import { patchValue } from '../vdom2/patch.ts'
import { createVdomContext } from '../context.ts'
import { hydrateVNode } from '../vdom2/hydrate.ts'
import { createRouteController } from '../vdom2/route.ts'
import { installVdomInspect } from '../vdom2/trace.ts'
import { installEventRing, beginSession, endSession } from '../vdom2/events.ts'
import { installMountInvariantAudit } from '../vdom2/audit.ts'
import type { VNodeChild } from '../vnode.ts'

/** uiServe 选项 */
export interface UIServeOptions {
  root: string | Element
  hydrate?: boolean
  /** loading 模式：不清空 root（信任调用方预置骨架屏 HTML）——首帧原子替换 */
  loading?: boolean
}

/** serve 句柄 */
export interface UIServeHandle<C extends object = {}> {
  /** 释放全部资源（监听/渲染状态/注册表） */
  close(): void
  /** 首帧完成 Promise：await 全部工厂 + DOM 落地后 resolve */
  ready: Promise<void>
  /** 当前 ctx（调试/测试用）——含 UIRouter ctx 注入的类型扩展 */
  ctx: WfuiContext & C
}

/** uiServe — 绑定唯一根节点 + URL 驱动渲染（vdom2 引擎） */
export function uiServe<RC extends object = {}>(
  router: UIRouter<RC>,
  options: UIServeOptions,
): UIServeHandle<RC> {
  const browser = createClientBrowser()
  const el = typeof options.root === 'string'
    ? browser.query(options.root)
    : options.root
  if (!el) throw new Error(`uiServe: root not found: ${options.root}`)
  const root = el as HTMLElement
  const hydrating = !!options.hydrate
  if (!hydrating && !options.loading) root.innerHTML = ''

  // vdom debug + audit 开关（?vdom_debug=1 / localStorage）
  try {
    const q = new URLSearchParams((globalThis as any)?.location?.search ?? '')
    const debug = q.get('vdom_debug') === '1' || (globalThis as any)?.localStorage?.getItem?.('__WF_VDOM_DEBUG') === '1'
    if (debug) {
      ;(globalThis as any).__WF_VDOM_DEBUG = true
      console.log('[weifuwu] vdom debug 已开启（?vdom_debug=1）')
    }
    initVdomTrace()
  } catch { /* 环境无 location/localStorage——忽略 */ }

  // reflow debug 开关（?wf_reflow=1——定位「页面加载早期强制排版」：Chrome 警告
  // 「Forced reflow while a page is loading」来源——布局读取时记录样式表加载状态 + 调用栈；
  // styles=0 时读取 = 样式表未加载场景（FOUC 风险），styles>=1 为正常排版）
  try {
    const q = new URLSearchParams((globalThis as any)?.location?.search ?? '')
    const reflowDebug = q.get('wf_reflow') === '1' || (globalThis as any)?.localStorage?.getItem?.('__WF_REFLOW_DEBUG') === '1'
    if (reflowDebug) {
      ;(globalThis as any).__WF_REFLOW_DEBUG = true
      console.log('[weifuwu] reflow debug 已开启（?wf_reflow=1——布局读取追踪）')
      const logRead = (kind: string, target: any) => {
        const styles = typeof document !== 'undefined' ? (document.styleSheets?.length ?? 0) : -1
        const t = target?.tagName ? `<${target.tagName}${target.id ? '#' + target.id : ''}${target.className ? '.' + String(target.className).split(' ')[0] : ''}>` : ''
        const stack = (new Error().stack || '').split('\n').slice(2, 5).map(s => s.trim().split('/').pop()?.slice(0, 80)).join(' ← ')
        console.log(`[wf-reflow] ${kind}${t} styles=${styles}${styles === 0 ? ' ⚠️样式未加载（强制排版场景）' : ''} :: ${stack}`)
      }
      const ogRect = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function (this: Element, ...a: any[]) { logRead('rect', this); return ogRect.apply(this, a as any) }
      for (const prop of ['offsetWidth', 'offsetHeight', 'offsetTop', 'offsetLeft', 'clientWidth', 'clientHeight', 'scrollTop', 'scrollHeight']) {
        const desc = Object.getOwnPropertyDescriptor(Element.prototype, prop)
        if (desc?.get) {
          const getter = desc.get
          Object.defineProperty(Element.prototype, prop, {
            configurable: true,
            enumerable: true,
            get(this: Element) { logRead(prop, this); return getter.call(this) },
          })
        }
      }
    }
  } catch { /* 环境不支持 hook——忽略 */ }

  // ── 渲染上下文（vdom2 纯引擎 + context 组装层——完整 hooks/popup） ──
  const { ctx, registry, renderer, rootUi, destroyPopupListeners } = createVdomContext({
    browser,
    root: root as HTMLElement,
  })

  // ── ctx.data（数据管道：缓存 + in-flight 合并 + __DATA__ 种子） ──
  const dataCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>()
  const hydratedData = (globalThis as any).__DATA__ ?? (window as any).__DATA__
  if (hydratedData && typeof hydratedData === 'object') {
    for (const [k, v] of Object.entries(hydratedData)) dataCache.set(k, { value: v })
  }
  ctx.data = {
    async get<T = any>(key: string, fetcher?: () => Promise<T>): Promise<T> {
      const entry = dataCache.get(key)
      if (entry && 'value' in entry) return entry.value as T
      if (entry?.promise) return entry.promise as Promise<T>
      if (!fetcher) return undefined as T
      const promise = Promise.resolve()
        .then(() => fetcher())
        .then((val) => { dataCache.set(key, { value: val }); return val })
      dataCache.set(key, { promise })
      return promise
    },
    set(key: string, value: unknown) { dataCache.set(key, { value }) },
    has(key: string) { return dataCache.has(key) },
  }
  // route 快照（router 中间件读写）
  ;(ctx as any).route = { params: {}, query: {}, path: '' }

  // ── 渲染（首帧 + 导航——统一 buildVNode → patch） ──
  let currentChild: VNodeChild = null
  let currentPath = ''
  let navToken = 0
  let readyResolve!: () => void
  const ready = new Promise<void>((r) => { readyResolve = r })
  let closing = false

  // 路由生命周期状态机（四状态机架构·第一层——design/vdom-lifecycle-state-machines.md）
  const routeCtrl = createRouteController()

  async function renderPath(path: string, initial: boolean): Promise<void> {
    const token = ++navToken
    const location = { pathname: path, search: '' } as any
    ;(ctx as any).route.path = path
    routeCtrl.navigateStart(path) // idle/settled → navigating（旧树卸载 + 新树构建起点）
    const session = beginSession(initial ? 'initial' : 'nav') // 导航会话：一棵事件树
    let output: VNodeChild
    try {
      output = (await router.execute(location, ctx as UIContext, path)) as VNodeChild
    } catch (e: any) {
      routeCtrl.navigateError(path, e) // navigating → idle（导航失败回退）
      // 错误兜底（不黑屏）：handler 抛错 → 错误页
      output = h('div', { class: 'ui-dom-error' }, `页面渲染失败: ${e?.message ?? String(e)}`)
    }
    if (closing || token !== navToken) { endSession(); return } // 过期导航丢弃（串行化——快速连续导航防竞态）
    const traceOn = traceEnabled('mount')
    const traceId = traceOn ? nextTraceId('nav') : ''
    if (traceOn) trace('mount', 'info', traceId, `route path=${path} initial=${initial}`)
    let built: VNodeChild
    try {
      built = await buildVNode(output as VNodeChild, ctx, currentChild, registry)
    } catch (e: any) {
      built = h('div', { class: 'ui-dom-error' }, `组件渲染失败: ${e?.message ?? String(e)}`)
    }
    if (closing || token !== navToken) return
    if (initial) {
      if (hydrating) {
        // 水合：SSR HTML 游标收养（不重建 DOM——接线属性/事件/ref）
        await hydrateVNode(root, built as VNode, ctx)
        if (traceEnabled('mount')) trace('mount', 'debug', traceId, `hydrate done=${root.childNodes.length}`)
      } else {
        root.innerHTML = ''
        const node = renderValue(built, ctx, browser)
        if (traceEnabled('mount')) trace('mount', 'debug', traceId, `first-render node=${node?.nodeName ?? 'null'} fragKids=${node?.nodeType === 11 ? Array.from(node.childNodes).length : '-'}`)
        if (node != null) root.appendChild(node)
        if (traceEnabled('mount')) trace('mount', 'debug', traceId, `root-fill done=${root.childNodes.length} first=${root.firstChild?.nodeName}`)
      }
    } else if (currentChild !== undefined) {
      const prev = currentChild
      currentChild = built
      const pv = prev as VNode
      const prevNode = isNative(pv) ? pv.el ?? pv._refNode : pv._refNode
      patchValue(root, prevNode, prev, built, { browser, registry, ctxVersion: (ctx as any)?.ui?._ctxVersion ?? 0 })
    }
    currentChild = built
    currentPath = path
    // root 组件 id（rootUi.render() 无参精准渲染——i18n 中间件等 root 层 render 调用）
    rootUi._rootVNodeId = (built as VNode)?._id
    // 导航完成：新树 build + diff/render 全部落地 → navigating → settled
    routeCtrl.navigateDone(path)
    endSession()
  }

  // ── 首帧 ──
  const initialPath = browser.pathname()
  void renderPath(initialPath, true).finally(() => { if (!closing) readyResolve() })

  // 全局调试 API（__vdom_dump / __vdom_lc / __vdom_events——组件视角生命周期可观测）
  installVdomInspect(() => currentChild)
  // 事件 ring buffer：页面生命周期内状态机事件全程记录（__vdom_events 查询）
  installEventRing()
  // 挂载不变量 audit：订阅 render 调度 PARENT 事件——built 组件无定位在转换瞬间报错
  installMountInvariantAudit()

  // ── 导航（popstate——SPA 路由切换） ──
  // 注意：不依赖 currentPath 判断（快速连续导航时 currentPath 异步滞后——误跳第二次导航）；
  // renderPath 内部 token 串行化已处理过期导航（集成测试 T4 抓到）
  const onPopState = () => {
    const path = browser.pathname()
    void renderPath(path, false)
  }
  browser.addEventListener('popstate', onPopState)

  return {
    close() {
      closing = true
      browser.removeEventListener('popstate', onPopState)
      destroyPopupListeners()
      registry.idRegistry.clear()
    },
    ready,
    ctx: ctx as WfuiContext & RC,
  }
}

// uiLog 保留引用（v1 语义——调试用；避免未使用告警）
void uiLog
