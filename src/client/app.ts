/**
 * weifuwu/client 应用 — createApp + ctx.ui.render
 *
 * createApp() → app.use(mw) → app.mount('#root', RootComponent)
 *
 * ctx.ui 在 mount 时注入：
 *   ctx.ui.render()        同步刷新当前组件
 *   ctx.ui.render(['#id']) 同步刷新指定组件
 *   ctx.ui.dirty()         异步刷新当前组件（微任务批处理）
 *   ctx.ui.$()             响应式状态容器（$.x = val 自动 dirty）
 *
 * render / dirty / $ 通过 prototype chain 实现组件级 scope：
 *   每个组件 mount 时创建 childCtx.ui = Object.create(ctx.ui)
 *   并设置 childCtx.ui._selfId = 组件 ID
 *   render() 无参时从 this._selfId 取当前组件 ID
 */

import type { WfuiContext, AppMiddleware } from './types.ts'
import { render, patchValue, idRegistry } from './render.ts'
import type { VNode, Component } from './vnode.ts'

// ── createApp ──────────────────────────────────────────

export function createApp() {
  const middlewares: AppMiddleware[] = []
  let ctx: WfuiContext = {} as WfuiContext
  let container: Element | null = null
  let rootComponent: Component | null = null
  let oldVNode: VNode | null = null
  let _rendering = false

  // ── 异步渲染批处理 ──────────────────────────────────
  let _dirtyBatch = new Set<string>()
  let _dirtyScheduled = false

  // ── 响应式媒体查询注册表（组件级，避免重复注册 listener） ──
  const _mediaRegistry = new Map<string, { mql: MediaQueryList; handler: (e: MediaQueryListEvent) => void }>()

  // ── 核心：按 ID 列表渲染组件 ───────────────────────
  function renderByIds(ids: string[]) {
    if (_rendering) return
    _rendering = true

    for (const id of ids) {
      const vnode = idRegistry.get(id)
      if (!vnode || !vnode._render) continue
      const oldChild = vnode._child
      const newChild = vnode._render(vnode.props)
      vnode._child = newChild
      // 如果 _parentNode 未设置（组件未被原生元素包裹渲染），从 _refNode 推导
      if (!vnode._parentNode && vnode._refNode) {
        ;(vnode as any)._parentNode = vnode._refNode.parentNode
      }
      if (vnode._parentNode) {
        const newNode = patchValue(
          vnode._parentNode,
          vnode._refNode ?? null,
          oldChild, newChild, ctx,
        )
        // patch 后更新 _refNode（可能被替换）
        if (newNode && newNode !== vnode._refNode) {
          vnode._refNode = newNode
        }
      }
    }

    _rendering = false

    // 渲染过程中可能积累了 dirty 标记
    flushDirtyBatch()
  }

  function flushDirtyBatch() {
    if (_dirtyBatch.size > 0 && !_dirtyScheduled) {
      _dirtyScheduled = true
      queueMicrotask(() => {
        _dirtyScheduled = false
        const batch = [..._dirtyBatch]
        _dirtyBatch.clear()
        if (batch.length > 0) renderByIds(batch)
      })
    }
  }

    /** 获取调用者（组件）的 selfId — 优先从 this，其次从 app 层 ctx */
  function getSelfId(uiObj: any): string | undefined {
    return uiObj?._selfId ?? (ctx as any).ui?._selfId
  }

  const app = {
    get ctx() { return ctx },

    use(mw: AppMiddleware) {
      middlewares.push(mw)
      return app
    },

    async mount(rootSelector: string, RootComponent: Component) {
      rootComponent = RootComponent

      for (const mw of middlewares) {
        ctx = await mw(ctx)
      }

      const el = typeof rootSelector === 'string'
        ? document.querySelector(rootSelector)
        : rootSelector
      if (!el) throw new Error(`mount target not found: ${rootSelector}`)
      container = el as Element
      container.innerHTML = ''

      // ── 注入 ctx.ui ──────────────────────────────────
      ;(ctx as any).ui = {
        _selfId: '_wf_root',

        /** 同步刷新（无参 = 当前组件，传参 = 指定组件列表） */
        render: function (ids?: string[]) {
          if (!ids || ids.length === 0) {
            const selfId = getSelfId(this)
            if (selfId) ids = [selfId]
            else return
          }
          renderByIds(ids)
        },

        /** 异步刷新（微任务批处理，无参 = 当前组件） */
        dirty: function (ids?: string[]) {
          if (_rendering) return
          if (!ids || ids.length === 0) {
            const selfId = getSelfId(this)
            if (selfId) ids = [selfId]
            else return
          }
          for (const id of ids) {
            if (id) _dirtyBatch.add(id)
          }
          if (!_dirtyScheduled) {
            _dirtyScheduled = true
            queueMicrotask(() => {
              _dirtyScheduled = false
              const batch = [..._dirtyBatch]
              _dirtyBatch.clear()
              if (batch.length > 0) renderByIds(batch)
            })
          }
        },

        /** 创建响应式状态容器：$.x = val 自动触发 dirty() */
        $: function () {
          const selfId = getSelfId(this)
          return createReactiveState(() => {
            if (selfId) (ctx as any).ui.dirty([selfId])
          })
        },

        /**
         * 响应式媒体查询：注册监听，值变化时自动 dirty
         *
         * 用法：
         *   const $ = ctx.ui.$()
         *   ctx.ui.useMedia('(max-width: 640px)', (v) => { $.isMobile = v })
         *
         * callback 会立即执行一次（取当前值），之后在变化时再次执行
         */
        useMedia: function (query: string, callback: (matches: boolean) => void) {
          const selfId = getSelfId(this)
          const key = `media:${selfId}:${query}`
          if (!_mediaRegistry.has(key)) {
            const mql = window.matchMedia(query)
            // 立即回调当前值
            callback(mql.matches)
            // 注册变化监听
            const handler = (e: MediaQueryListEvent) => callback(e.matches)
            mql.addEventListener('change', handler)
            _mediaRegistry.set(key, { mql, handler })
          }
        },

        /**
         * 响应式断点：注册命名断点监听，值变化时自动 dirty
         *
         * 用法：
         *   const $ = ctx.ui.$()
         *   ctx.ui.useBreakpoint((vp) => { $.vp = vp })
         *   // vp: 'mobile' | 'tablet' | 'desktop'
         *
         * 自定义断点：
         *   ctx.ui.useBreakpoint(
         *     { narrow: '(max-width: 480px)', wide: '(min-width: 1200px)' },
         *     (vp) => { $.size = vp }
         *   )
         */
        useBreakpoint: function (
          bpsOrCallback: Record<string, string> | ((vp: string) => void),
          callback?: (vp: string) => void,
        ) {
          const bps: Record<string, string> =
            typeof bpsOrCallback === 'function'
              ? { mobile: '(max-width: 639px)', tablet: '(min-width: 640px) and (max-width: 1023px)', desktop: '(min-width: 1024px)' }
              : bpsOrCallback
          const cb = typeof bpsOrCallback === 'function' ? bpsOrCallback : callback!
          const selfId = getSelfId(this)
          const key = `bp:${selfId}`

          function evaluate(): string {
            for (const [name, query] of Object.entries(bps)) {
              if (window.matchMedia(query).matches) return name
            }
            return Object.keys(bps)[0] ?? ''
          }

          if (!_mediaRegistry.has(key)) {
            // 立即回调当前值
            cb(evaluate())
            // 为每个断点注册 change 监听，变化时重新求值
            const handlers: Array<() => void> = []
            for (const query of Object.values(bps)) {
              const mql = window.matchMedia(query)
              const handler = () => cb(evaluate())
              mql.addEventListener('change', handler)
              handlers.push(() => mql.removeEventListener('change', handler))
            }
            _mediaRegistry.set(key, { mql: null as any, handler: null as any })
          }
        },

        /** 注册组件实例的自定义 ID（用于跨组件精准刷新） */
        selfId: function (name: string) {
          if (typeof name !== 'string' || !name) {
            throw new Error(`[weifuwu] selfId requires a non-empty string, got ${typeof name}`)
          }
          if (idRegistry.has(name)) {
            throw new Error(
              `[weifuwu] Duplicate component ID: "${name}". ` +
              `Each component must have a unique custom ID.`
            )
          }
          const vnode = (this as any)._selfVNode
          if (!vnode) return
          vnode._customId = name
          idRegistry.set(name, vnode)
        },
      }

      // ── 首次渲染 ──────────────────────────────────────
      _rendering = true
      oldVNode = wrapComponent(RootComponent, ctx)
      oldVNode._id = '_wf_root'
      oldVNode._parentNode = container
      oldVNode._refNode = null
      idRegistry.set('_wf_root', oldVNode)

      const node = render(oldVNode, ctx)
      if (node instanceof Node) container.appendChild(node)

      // 更新根节点 _refNode 为首个 DOM 节点
      oldVNode._refNode = container.firstChild

      _rendering = false

      // 消化 mount 过程中积累的 dirty 标记
      flushDirtyBatch()
    },

    destroy() {
      if (container) container.innerHTML = ''
      container = null
      ctx = {} as WfuiContext
    },
  }

  return app
}

function wrapComponent(Comp: Component, _ctx: WfuiContext): VNode {
  return { type: Comp, props: {}, key: undefined }
}

/** 创建响应式状态容器：深度 Proxy，任意层级属性赋值自动触发 render */
function createReactiveState(dirty: () => void): Record<string, any> {
  const proxyCache = new WeakMap()

  const reactive = (target: any): any => {
    if (target === null || typeof target !== 'object') return target

    // 相同底层对象返回同一 Proxy 实例，保证引用稳定、减少 GC
    if (proxyCache.has(target)) return proxyCache.get(target)

    const proxy = new Proxy(target, {
      set(target, key, value) {
        const old = Reflect.get(target, key)
        if (old === value) return true
        Reflect.set(target, key, value)
        dirty()
        return true
      },
      get(target, key) {
        const value = Reflect.get(target, key)
        // 返回深度包装的 Proxy，确保深层赋值也能触发 dirty
        if (typeof value === 'object' && value !== null) return reactive(value)
        return value
      },
      deleteProperty(target, key) {
        if (Reflect.has(target, key)) {
          Reflect.deleteProperty(target, key)
          dirty()
        }
        return true
      },
    })

    proxyCache.set(target, proxy)
    return proxy
  }

  return reactive({})
}
