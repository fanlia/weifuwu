/**
 * vdom v2 — serve（uiServeV2——v2 引擎驱动真实 DOM——切换前提最终验证）
 *
 * v2 引擎蓝图 阶段 2B：
 * - **v1 骨架复用**（router.resolve/CommandApplier/渲染队列——服务层不变）
 * - **引擎替换**：ctx.stream = v2（renderV2/diffV2——流段复用 + 调度流）→
 *   命令直接 applier.apply（不走 Response 编码——浏览器端直连）
 * - **渲染队列 → 调度流**（render$ batching——同拍合并）
 * - 阶段 2B 验证：真实浏览器——渲染/交互/重渲染（流段复用实证）
 */
import type { VNode } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'


import { Subject, scan, fromPromise, create, switchMap, type Observable } from '../../observable/index.ts'
import { fromArray } from './render.ts'
import { spyEvent } from './spy.ts'
import { createFnTable, defaultErrorFallback, type RenderCtx, type UiServeOptions, type UiServeHandle } from '../protocol.ts'
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
import { createRenderCycle } from './cycle.ts'
import { enableRenderHealth } from '../../dev/render-health.ts'
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
  // **渲染完成冲刷（applyV2 尾部调用——清空并执行）——波次 1：由周期
  //  complete$ 驱动（applyV2Inner 手写调用已删除）**
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


  let active = true


  /** **渲染周期（波次 1——applyV2Inner 管线化）**：build/diff → cmds$ →
   *  toArray（原子性）→ apply → cleanup → applied$/complete$——周期拥有
   *  影子树（currentTree）+ 三者度量——serve 注入 DOM/引擎依赖 */
  const cycle = createRenderCycle({
    boot: () => {
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
    },
    resetRoot: () => {
      // **root 整树替换**（组件/元素切换——v1 serve 语义——旧段清空 + 全量
      // 渲染——root 异型走转换表会违例（component→component 同态））
      rootEl.innerHTML = ''
      for (const [sid] of [...segments]) disposeSegment(sid, segments)
      applier.reset() // **记录表同步清（2027-09——tour 违例实证——残留锚
      // 记录越权命中（DOM 已脱离——parentOf 直中记录而非真实容器）**
    },
    build: (vnode) => renderV2(vnode, ctx as unknown as UIContext, registry, segments, () => scheduler.request('component-rerender')),
    diff: (oldTree, vnode) => diffV2(oldTree, vnode, ctx as unknown as UIContext, segments, registry, () => scheduler.request('component-rerender')),
    apply: (cmd) => { applier.apply(cmd) },
    dispose: (compId, beforeEpoch) => {
      // **纪元守卫（2027-10）**：unmount 目标永远是旧树段（生成期已 dispose
      // 的除外）——同周期新挂载同 id 段（槽位复用）不作为目标——否则
      // nav 链残留（accordion→index→actionsheet 组件列表残留实证）
      const seg = segments.get(compId)
      if (seg && !seg.disposed && seg.epoch < beforeEpoch) { disposeSegment(compId, segments); return true }
      return false
    },
    active: () => active,
  })
  // **度量同步（__wfV2 兼容——周期计数为源——删除手写 vt.builds/diffs）**
  const syncVt = (): void => {
    const m = cycle.metrics()
    vt.builds = m.builds
    vt.diffs = m.diffs
  }
  // **afterRender 冲刷（周期完成信号——v1 对齐——渲染完成回调）**
  // **SSR 吸收失败回退闭环（波次 4——failed$ 事件驱动——现状缺口补全）**：
  //  吸收失败（SSR 与命令不匹配——next 耗尽 / end 剩余）→ 标记——周期
  //  完成（命令全量应用后）→ 原子回退：清空 root + 吸收复位 + 影子树重置
  //  + 调度重渲染（全量 build——残留 SSR 节点歼灭——事件驱动无轮询）
  let absorbFailedPending = false
  applier.absorb.failed$.subscribe({
    next: () => { absorbFailedPending = true; console.warn('[vdom] SSR 吸收失败——回退清空重建（事件驱动）') },
  })
  cycle.complete$.subscribe({ next: () => {
    flushAfterRender()
    if (absorbFailedPending) {
      absorbFailedPending = false
      applier.absorb.reset() // 恢复非吸收态（队列弃用——后续 create 走新建）
      rootEl.innerHTML = ''
      cycle.reset()
      scheduler.request('error-fallback') // 下一拍全量 build（首帧语义——currentTree null）
    }
  } })
  // **渲染健康诊断器（RENDER-HEALTH-PLAN 波次 1——dev only 门控——生产零成本）**
  let renderHealth: import('../../dev/render-health.ts').RenderHealth | null = null
  if ((win as unknown as { __WF_DEV__?: boolean }).__WF_DEV__) {
    renderHealth = enableRenderHealth({ applied$: cycle.applied$, complete$: cycle.complete$, segments })
  }


  /** v2 渲染（首帧 build / 后续 diff——命令直接 apply）
   *  **R1 错误熔断（2027-08——v1 机制对齐）**：渲染错误（工厂 throw——
   *  renderV2/diffV2 reject）→ 影子树重置（下次全量自愈——cycle 内部）→
   *  连续 3 次 → fallback（errorFallback 可配 / 默认内置）——成功渲染重置计数 */
  let errorCount = 0
  const MAX_RENDER_ERRORS = 3
  const renderErrorFallback = (err: Error): void => {
    cycle.reset() // 影子树重置（下次全量——自愈语义）
    const fb = opts.errorFallback?.(err, ctx as unknown as UIContext) ?? defaultErrorFallback(err, ctx as unknown as UIContext)
    void cycle.apply(fb)
      .then(syncVt)
      .catch((e2) => console.error('[vdom] v2 error fallback 渲染失败:', e2))
  }
  const applyV2 = async (vnode: VNode): Promise<void> => {
    if (!active) return
    try {
      await cycle.apply(vnode)
      errorCount = 0 // 成功渲染 → 计数重置（连续错误语义）
      syncVt()
    } catch (e) {
      console.error('[vdom] v2 render:', e)
      errorCount++
      if (errorCount >= MAX_RENDER_ERRORS) {
        errorCount = 0 // 熔断已触发——计数重置（回退 UI 常驻——交互重试）
        renderErrorFallback(e instanceof Error ? e : new Error(String(e)))
      }
    }
  }


  /** v2 stream（页面作者入口——handler 调 ctx.stream(vnode)）：
   *  v2 引擎直接应用（不走 Response 编码——浏览器直连）——返回空 Response
   *  （v1 接口兼容——runRender 消费空流立即完成） */
  const renderCtx = ctx as unknown as RenderCtx
  renderCtx.stream = (vnode: VNode, init?: ResponseInit): Response => {
    void applyV2(vnode)
    return new Response(null, { status: init?.status ?? 200 })
  }


  // ── 导航流（波次 5——统一解析入口 + redirect 链流化）──
  // **RenderPhase（scan 折叠——诊断面——begin/end 由导航流包裹）**：
  // idle/rendering 迁移（状态机维度总表语义）——取消（新导航 switchMap
  // 旧作废）→ teardown 补 end（相位配对不悬空）
  const phaseSource = new Subject<{ kind: 'begin' } | { kind: 'end' }>()
  let renderPhase: 'idle' | 'rendering' = 'idle'
  phaseSource.asObservable().pipe(scan((s: 'idle' | 'rendering', e: { kind: 'begin' } | { kind: 'end' }): 'idle' | 'rendering' => {
    if (e.kind === 'begin') return 'rendering'
    return 'idle'
  }, 'idle')).subscribe({ next: (p) => { renderPhase = p } })
  /** 导航观测面（每次解析入口 next——时间线可观测——未来中间件监听点） */
  const navigations$ = new Subject<string>()
  navigations$.subscribe({ next: (p) => spyEvent('nav:resolve', p) })
  /** redirect 链（递归流——switchMap 取消语义——旧 redirect 作废——
   *  3xx + Location → replaceState + 递归——上限 5（循环 redirect 防护） */
  const resolveFlow = (path: string, depth: number): Observable<void> =>
    fromPromise(router.resolve(frontRequest(path), ctx as unknown as UIContext)).pipe(
      switchMap((res) => {
        const loc = res.status >= 300 && res.status < 400 && res.headers?.get('Location')
          ? res.headers.get('Location')!
          : null
        if (loc) {
          if (depth >= 5) throw new Error(`[vdom] redirect 链超限（${depth + 1}）——${path} → ${loc}`)
          win.history.replaceState({}, '', loc)
          return resolveFlow(loc, depth + 1)
        }
        // 无路由 404（未注册 notFound 且无匹配）——显式抛错（实证：视为终态
        // 成功 → 旧视图残留——stats 页点「← 填写页」URL 变但内容不变）——
        // navigate catch 兜底完整导航（填写页/列表页等服务器独立 html）
        if (res.status === 404) throw new Error(`[vdom] 无路由：${path}——回退页面级导航`)
        return fromArray([void 0]) // 终态（handler 已调 ctx.stream——渲染路径）
      }),
    )
  /** 相位包裹（begin/end 配对——取消补 end——诊断不悬空） */
  const guardedResolve = (path: string): Observable<void> =>
    create<void>((obs) => {
      phaseSource.next({ kind: 'begin' })
      let done = false
      const sub = resolveFlow(path, 0).subscribe({
        next: () => obs.next(),
        error: (e) => { done = true; phaseSource.next({ kind: 'end' }); obs.error(e) },
        complete: () => { done = true; phaseSource.next({ kind: 'end' }); obs.complete() },
      })
      return () => { sub.unsubscribe(); if (!done) phaseSource.next({ kind: 'end' }) }
    })
  /** 解析入口（统一：导航/重渲染/首帧——导航观测事件 + 完成 promise） */
  const resolvePath = (path: string): Promise<void> => {
    navigations$.next(path)
    return new Promise<void>((resolve, reject) => {
      guardedResolve(path).subscribe({ next: () => resolve(), error: (e) => reject(e), complete: () => resolve() })
    })
  }
  /** 完整 URL（pathname + search——popstate/boot/render 统一——
   *  实证：?c=A→B 只变 query——pathname 相同——路由不重解析——页面残留旧视角） */
  const currentUrl = (): string => win.location.pathname + win.location.search
  const render = async (): Promise<void> => {
    await resolvePath(currentUrl())
  }


  // 调度流接入（batching：同拍 N 次 render → 1 次——重渲染当前路径）
  scheduler.renders$.subscribe({
    next: () => {
      void render().catch((e) => console.error('[vdom] v2 render:', e))
    },
  })


  // 页面作者 render（ctx.render——经调度流合并）
  ctx.render = () => { scheduler.request('page-render') }

  /**
   * 导航滚动管理（2027-XX 用户实测：首页 160 卡列表滚到中部点组件 →
   * 详情页滚动 offset 被 clamp 在中部——视口落在详情页中下部——视觉上
   * 「感觉不到切换」——SPA pushState 不触发浏览器滚动恢复——需自管）：
   * - pushState 前先 replaceState 把「当前条目」的 scrollY 存进 history
   *   （返回时恢复——浏览器惯例）
   * - navigate 完成后滚顶（新页面从标题开始——切换感明确）
   * - popstate 恢复 history.state.scrollY（无 state 滚顶）
   * - replaceState 可能被浏览器限频拒绝（Safari 100 次/30s）——try 吞掉
   *   （降级为返回后滚顶——不阻断导航）
   */
  const saveScroll = (): void => {
    try {
      win.history.replaceState({ ...(win.history.state as object ?? {}), scrollY: win.scrollY }, '')
    } catch { /* 限频/异常——降级滚顶 */ }
  }
  const restoreScroll = (): void => {
    // 滚动是增强能力——环境缺 API（契约 fake DOM）也不抛（否则落进
    // resolvePath 的 catch 分支误触 reload——假阳性整页重载）
    try {
      const y = (win.history.state as { scrollY?: number } | null)?.scrollY
      win.scrollTo(0, typeof y === 'number' ? y : 0)
    } catch { /* 环境 不支持——跳过 */ }
  }

  // **导航（pushState + 统一解析——await 完成）**
  const navigate = async (path: string): Promise<void> => {
    saveScroll()
    win.history.pushState({ scrollY: 0 }, '', path)
    try {
      await resolvePath(path)
      win.scrollTo(0, 0)
    } catch {
      // 无路由（404）→ 完整导航（SPA router 未注册路径——服务器可能有页面——
      // 实证：stats 页「← 填写页」/「任务列表」链接——半跳转根治）
      win.location.href = path
    }
  }
  ;(ctx as Record<string, unknown>).app = { navigate }

  // **链接拦截（同源 a[href]——外链/锚点不拦截）**
  const onDocClick = (e: Event): void => {
    const target = e.target as HTMLElement | null
    const a = target?.closest?.('a[href]')
    if (!a) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('http') || href.startsWith('#')) return
    // 无匹配路由 → 不拦截——浏览器默认完整导航（服务器页面：填写页/
    // 列表页——实证：拦截+navigate 落空 = URL 变内容不变的半跳转）
    if (!router.has(href)) return
    e.preventDefault()
    void navigate(href)
  }
  doc.addEventListener('click', onDocClick)

  // **popstate（前进/后退 → 解析当前 URL + 恢复滚动位置）**
  const onPopstate = (): void => {
    void resolvePath(currentUrl())
      .then(() => restoreScroll())
      .catch(() => {
        // 无路由（back/forward 到 SPA 外服务器页面——填写页/列表页）→ reload 完整加载
        win.location.reload()
      })
  }
  win.addEventListener('popstate', onPopstate)

  // **首帧 boot**（v1 ready 等价）
  void resolvePath(currentUrl()).catch((e) => console.error('[vdom] v2 首帧:', e))

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
      renderHealth?.dispose() // 诊断器窗口停止（dev）
      for (const [sid] of [...segments]) disposeSegment(sid, segments) // 段销毁（hooks 清理）
      applier.dispose() // 事件代理根监听移除（资源释放完整——v1 对齐）
      for (const fn of serveUnmounts.reverse()) { try { fn() } catch (e) { console.error('[vdom] v2 unmount:', e) } }
      serveUnmounts.length = 0
      rootEl.innerHTML = '' // root 清空（v1 对齐——unmount-dispose 场景断言）
    },
  } as UiServeHandle & { render: () => Promise<void>; __apply: (vnode: VNode) => Promise<void> }
  void disposed
  void renderPhase
  void navigations$
  return handle
}
