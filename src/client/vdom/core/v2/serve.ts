/**
 * vdom v2 — serve（uiServeV2——v2 引擎驱动真实 DOM——切换前提最终验证）
 *
 * VDOM-V2-BLUEPRINT 阶段 2B：
 * - **v1 骨架复用**（router.resolve/CommandApplier/渲染队列——服务层不变）
 * - **引擎替换**：ctx.stream = v2（renderV2/diffV2——流段复用 + 调度流）→
 *   命令直接 applier.apply（不走 Response 编码——浏览器端直连）
 * - **渲染队列 → 调度流**（render$ batching——同拍合并）
 * - 阶段 2B 验证：真实浏览器——渲染/交互/重渲染（流段复用实证）
 */
import type { VNode } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'


import { spyEvent } from './spy.ts'
import { createFnTable, defaultErrorFallback, type RenderCtx, type UiServeOptions, type UiServeHandle } from '../serve.ts'
import { UIRouter, frontRequest } from '../router.ts'
import { createDevVerifier } from '../patch/verify.ts'
import { createClientBrowser } from '../../browser/create-client-browser.ts'
import { CommandApplier } from '../patch/index.ts'
import { createComponentRegistry } from '../node/component.ts'
import { createDataPipe } from '../../context/data.ts'
import { renderV2 } from './render.ts'
import { diffV2, disposeSegment } from './diff.ts'
import type { SegmentMap } from './diff.ts'
import { createRenderScheduler } from './schedule.ts'
import { collectCommands } from './integrate.ts'
import { asyncDataPreload } from '../../hooks/env.ts'


/** v2 真实浏览器 serve（uiServe 等价——引擎替换） */
export function uiServeV2(router: UIRouter, opts: UiServeOptions): UiServeHandle {
  const doc = document
  const win = window
  const rootEl = typeof opts.root === 'string'
    ? (doc.querySelector(opts.root) as HTMLElement | null)
    : opts.root
  if (!rootEl) throw new Error(`uiServeV2: root 未找到 — ${String(opts.root)}`)


  const dataSeed = (win as unknown as { __DATA__?: Record<string, unknown> }).__DATA__
  if (dataSeed) asyncDataPreload(dataSeed)


  // ── serve 级单例（跨渲染保持） ──
  const fnTable = createFnTable()
  const registry = createComponentRegistry() // 挂载通路（阶段 2 过渡——段承载复用）
  const segments: SegmentMap = new Map() // v2 流段（组件复用载体）
  const applier = new CommandApplier(rootEl, doc, registry)
  if ((win as unknown as { __WF_DEV__?: boolean }).__WF_DEV__) {
    applier.devVerify = createDevVerifier()
  }
  const scheduler = createRenderScheduler()
  const vt = (win as unknown as { __wfV2?: Record<string, number> }).__wfV2 ??= { builds: 0, diffs: 0 }
  // **浏览器面（v2 完整性——hooks 需要）**：真实 createClientBrowser
  const afterRenderFns: Array<() => void> = []
  const serveUnmounts: Array<() => void> = []
  // **渲染完成冲刷（applyV2 尾部调用——清空并执行）**
  const flushAfterRender = (): void => {
    const fns = afterRenderFns.splice(0)
    for (const fn of fns) { try { fn() } catch (e) { console.error('[vdom] v2 afterRender:', e) } }
  }
  const ctx = {
    browser: createClientBrowser(),
    /** 数据管道（组件工厂取数——唯一异步边界——缓存/并发合并/失败缓存） */
    data: createDataPipe(),
    /** serve 级卸载注册（unmount 时执行——组件外清理） */
    onUnmount(fn: () => void): void { serveUnmounts.push(fn) },
    /** 渲染完成回调注册（hook 挂载后动作——元素已挂载） */
    afterRender(fn: () => void): void { afterRenderFns.push(fn) },
    // 中间件注入面（可选——ctx.api/auth/ws/i18n/toast/confirm/notification——
    // **v1 对齐（2027-08——opts 未注入实证——notification demo 静默失效）**）
    ...(opts.api ? { api: opts.api } : {}),
    ...(opts.auth ? { auth: opts.auth } : {}),
    ...(opts.ws ? { ws: opts.ws } : {}),
    ...(opts.i18n ? { i18n: opts.i18n } : {}),
    ...(opts.toast ? { toast: opts.toast } : {}),
    ...(opts.confirm ? { confirm: opts.confirm } : {}),
    ...(opts.notification ? { notification: opts.notification } : {}),
  } as Record<string, unknown>


  let currentTree: VNode | null = null
  let active = true
  // **首帧判定一次性（2027-08——错误后重建误清 DOM 实证）**：渲染错误 →
  // currentTree=null（影子树重置——自愈语义）——若重建仍依「!currentTree」
  // 判首帧 → rootEl.innerHTML=''（无 SSR 标记分支）清空 root——触发按钮
  // 丢失（R1 熔断场景 T2 实证——错误链断）——v1 语义：首帧吸收判定仅在
  // mount 时一次——错误后重建走 build 自愈（done.full 清理旧树——DOM 保留）
  let booted = false


  /** v2 渲染（首帧 build / 后续 diff——命令直接 apply）
   *  **R1 错误熔断（2027-08——v1 机制对齐）**：渲染错误（工厂 throw——
   *  collectCommands reject）→ 影子树重置（下次全量自愈）→ 连续 3 次 →
   *  fallback（errorFallback 可配 / 默认内置）——成功渲染重置计数 */
  let errorCount = 0
  const MAX_RENDER_ERRORS = 3
  const renderErrorFallback = (err: Error): void => {
    currentTree = null
    const fb = opts.errorFallback?.(err, ctx as unknown as UIContext) ?? defaultErrorFallback(err, ctx as unknown as UIContext)
    void (async () => {
      try {
        const cmds = await collectCommands(renderV2(fb, ctx as unknown as UIContext, registry, segments, () => scheduler.request()))
        if (!active) return
        for (const c of cmds) applier.apply(c)
        currentTree = fb
      } catch (e2) { console.error('[vdom] v2 error fallback 渲染失败:', e2) }
    })()
  }
  const applyV2 = async (vnode: VNode): Promise<void> => {
    if (!active) return
    try {
      await applyV2Inner(vnode)
      errorCount = 0 // 成功渲染 → 计数重置（连续错误语义）
    } catch (e) {
      console.error('[vdom] v2 render:', e)
      currentTree = null // 影子树重置（下次全量——自愈）
      errorCount++
      if (errorCount >= MAX_RENDER_ERRORS) {
        errorCount = 0 // 熔断已触发——计数重置（回退 UI 常驻——交互重试）
        renderErrorFallback(e instanceof Error ? e : new Error(String(e)))
      }
    }
  }
  const applyV2Inner = async (vnode: VNode): Promise<void> => {
    if (!active) return
    if (!booted) {
      booted = true
      // **首帧 SSR 接管（v2 适配——蓝图缺口 1「吸收是消费端——v2 同构命令
      //  已兼容」落地）**：root 含 SSR 吸收标记（<!--wf--> 锚注释）→
      //  absorb.begin（procCreate/procCreateText 逐节点结构吸收——无标记
      //  （静态预置 HTML/骨架屏）→ 清空重建——跨结构错配防护（v1 同判定）
      //  ——否则 SSR 内容与客户端渲染共存（双份 DOM——tag 页面按钮无
      //  data-wf-id 点击失效实证）
      const hasSsrMark = Array.from(rootEl.querySelectorAll('*')).some((el) =>
        [...el.childNodes].some((n) => n.nodeType === 8 && (n as Comment).textContent?.includes('wf')))
      if (hasSsrMark) applier.absorb.begin(rootEl)
      else rootEl.innerHTML = ''
    }
    const stream = currentTree
      ? (currentTree.type !== vnode.type
        ? (() => {
          // **root 整树替换**（组件/元素切换——v1 serve 语义——旧段清空 +
          // 全量渲染——root 异型走转换表会违例（component→component 同态））
          vt.builds++
          rootEl.innerHTML = ''
          currentTree = null
          for (const [sid] of [...segments]) disposeSegment(sid, segments)
          return renderV2(vnode, ctx as unknown as UIContext, registry, segments, () => scheduler.request())
        })()
        : (vt.diffs++, diffV2(currentTree, vnode, ctx as unknown as UIContext, segments, registry, () => scheduler.request())))
      : (vt.builds++, renderV2(vnode, ctx as unknown as UIContext, registry, segments, () => scheduler.request()))
    const cmds = await collectCommands(stream)
    spyEvent('cmd:render', cmds.length + '条')
    if (!active) return
    for (const cmd of cmds) {
      try {
        applier.apply(cmd)
      } catch (e) {
        console.error('[vdom] v2 apply:', e)
        currentTree = null // 影子树重置（下次全量——自愈）
        break
      }
    }
    // **段清理（2027-08——unmount 命令统一信号）**：transform（v1 表）/removeTreeV2
    // 发出的 unmount → 段 dispose（onUnmounts/destroy$——popup 关闭等资源清理——
    // 不依赖 v1 registry 的消费端行为——段是 v2 权威生命周期）
    for (const cmd of cmds) {
      if (cmd.op === 'unmount' && segments.has(cmd.compId)) disposeSegment(cmd.compId, segments)
    }
    currentTree = vnode
    // **渲染完成信号（v1 对齐）**：afterRender 回调（hook 挂载后动作）
    flushAfterRender()
  }


  /** v2 stream（页面作者入口——handler 调 ctx.stream(vnode)）：
   *  v2 引擎直接应用（不走 Response 编码——浏览器直连）——返回空 Response
   *  （v1 接口兼容——runRender 消费空流立即完成） */
  const renderCtx = ctx as unknown as RenderCtx
  renderCtx.stream = (vnode: VNode, init?: ResponseInit): Response => {
    void applyV2(vnode)
    return new Response(null, { status: init?.status ?? 200 })
  }


  // 渲染（resolve router → handler 调 ctx.stream → applyV2——**redirect 语义**）
  let req = frontRequest(win.location.pathname)
  let renderPhase: 'idle' | 'rendering' = 'idle'
  const render = async (): Promise<void> => {
    if (renderPhase === 'rendering') return // 渲染中——合并（调度流已 batching）
    renderPhase = 'rendering'
    try {
      let res = await router.resolve(req, ctx as unknown as UIContext)
      // **redirect（3xx + Location——replaceState——不 push 历史）**
      let guard = 0
      while (res.status >= 300 && res.status < 400 && res.headers?.get('Location') && guard++ < 5) {
        const loc = res.headers.get('Location')!
        win.history.replaceState({}, '', loc)
        req = frontRequest(loc)
        res = await router.resolve(req, ctx as unknown as UIContext)
      }
    } finally {
      renderPhase = 'idle'
    }
  }


  // 调度流接入（batching：同拍 N 次 render → 1 次）
  scheduler.renders$.subscribe({
    next: () => {
      void render().catch((e) => console.error('[vdom] v2 render:', e))
    },
  })


  // 页面作者 render（ctx.render——经调度流合并）
  ctx.render = () => { scheduler.request() }

  // **导航（v1 对齐——pushState + req 更新 + 渲染）**
  const navigate = async (path: string): Promise<void> => {
    win.history.pushState({}, '', path)
    req = frontRequest(path)
    await render()
  }
  ;(ctx as Record<string, unknown>).app = { navigate }

  // **链接拦截（同源 a[href]——外链/锚点不拦截）**
  const onDocClick = (e: Event): void => {
    const target = e.target as HTMLElement | null
    const a = target?.closest?.('a[href]')
    if (!a) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('http') || href.startsWith('#')) return
    e.preventDefault()
    void navigate(href)
  }
  doc.addEventListener('click', onDocClick)

  // **popstate（前进/后退 → 渲染当前 URL）**
  const onPopstate = (): void => {
    req = frontRequest(win.location.pathname)
    void render()
  }
  win.addEventListener('popstate', onPopstate)

  // **首帧 boot**（v1 ready 等价）
  void render().catch((e) => console.error('[vdom] v2 首帧:', e))

  let disposed = false
  const handle = {
    ready: Promise.resolve(),
    render: () => render(),
    __apply: (vnode: VNode) => applyV2(vnode) as never,
    navigate,
    unmount: () => {
      disposed = true
      active = false
      doc.removeEventListener('click', onDocClick)
      win.removeEventListener('popstate', onPopstate)
      for (const [sid] of [...segments]) disposeSegment(sid, segments) // 段销毁（hooks 清理）
      applier.dispose() // 事件代理根监听移除（资源释放完整——v1 对齐）
      for (const fn of serveUnmounts.reverse()) { try { fn() } catch (e) { console.error('[vdom] v2 unmount:', e) } }
      serveUnmounts.length = 0
      rootEl.innerHTML = '' // root 清空（v1 对齐——unmount-dispose 场景断言）
    },
  } as UiServeHandle & { render: () => Promise<void>; __apply: (vnode: VNode) => Promise<void> }
  void disposed
  return handle
}
