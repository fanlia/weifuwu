/**
 * vdom core — uiServe（渲染落地——公共面——双端一体）
 *
 * 设计（design/vdom-plan.md §3/§4）：
 * - UIRouter 唯一应用入口——uiServe(router, { root }) 收养渲染（真实浏览器全局
 *   document/window——2026-12 删除 browser 注入——测试与生产同环境）
 * - 渲染循环：初始 URL resolve → Response（command 事件流）→ patch
 * - **ctx.render() = 重新渲染**（事件触发/fetch 结束/定时器回调的唯一入口）：
 *   重新 resolve（handler 重跑——registry 复用——组件工厂不重跑——
 *   renderFn 重调读最新状态）→ **新的 Response command 事件流** → 消费
 *   （patch 对照现有 DOM 节点——幂等——就地更新）
 * - 函数面传输：同进程共享函数表——编码时函数 → {$fn: n} 标记——
 *   解码时查表还原（事件绑定跨 Response 保持）
 *
 * 服务端面（SSR——同一 handler 同一 Response——body 经 commandToHtml()
 * TransformStream 流式吐 HTML）后续实现。
 */

import { UIRouter, frontRequest } from './router.ts'
import { commandToHtml, htmlDocument } from './ssr/html.ts'
import { CommandApplier } from './patch/index.ts'
import { createDevVerifier } from './patch/verify.ts'
import { renderToStream } from './build.ts'
import { diffStream } from './diff/index.ts'
import type { VNode } from './vnode.ts'
import { h } from './vnode.ts'
import { createComponentRegistry, disposeAllComponents } from './node/component.ts'
import { createDataPipe } from '../context/data.ts'
import type { UIContext, DataPipe } from '../context/UIContext.ts'
import type { Command } from './command/index.ts'
import type { Browser } from '../browser/Browser.ts'
import { createClientBrowser } from '../browser/create-client-browser.ts'

/** 函数表还原（$fn 标记 → 函数——编码/解码同进程共享） */
export function reviveFn(fnTable: Map<number, unknown>) {
  return (k: string, v: unknown): unknown => {
    if (v && typeof v === 'object' && typeof (v as { $fn?: unknown }).$fn === 'number') {
      const fn = fnTable.get((v as { $fn: number }).$fn)
      if (!fn) console.error(`[vdom] 传输违例：$fn:${(v as { $fn: number }).$fn} 无对应函数（函数表已清/跨流引用）`)
      return fn
    }
    return v
  }
}

/** R1 熔断默认回退 UI（core 内建——inline style 零样式系统依赖——
 *  errorFallback 未配置时使用——错误文案 + 重试按钮（恢复路径）） */
function defaultErrorFallback(err: Error, ctx: UIContext): VNode {
  return h('div', {
    class: 'wf-error-fallback',
    style: 'padding:40px 24px;text-align:center;font-family:var(--wf-font-sans,system-ui);',
  }, [
    h('div', { style: 'font-size:21px;font-weight:600;margin-bottom:8px;' }, '页面渲染失败'),
    h('div', { style: 'font-size:13px;color:var(--wf-color-text-secondary,#64748b);margin-bottom:16px;max-width:520px;margin-inline:auto;word-break:break-all;' }, String(err?.message ?? err)),
    h('button', {
      class: 'wf-btn wf-btn--primary',
      onClick: () => { void ctx.render?.() },
      style: 'padding:8px 20px;border-radius:6px;border:none;cursor:pointer;',
    }, '重试'),
  ])
}

/** NDJSON 命令流解析（行缓冲——命令可能跨 chunk——函数表还原——
 * 导出（测试——跨 chunk 边界/畸形行合规断言）） */
export function commandReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  fnTable: Map<number, unknown>,
): AsyncGenerator<Command> {
  const decoder = new TextDecoder()
  let buf = ''
  const revive = reviveFn(fnTable)
  const pump = async (): Promise<IteratorResult<Command>> => {
    while (true) {
      const nl = buf.indexOf('\n')
      if (nl >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) return { value: JSON.parse(line, revive) as Command, done: false }
        continue
      }
      const { value, done } = await reader.read()
      if (done) {
        if (buf.trim()) {
          const line = buf.trim()
          buf = ''
          return { value: JSON.parse(line, revive) as Command, done: false }
        }
        return { value: undefined as never, done: true }
      }
      buf += decoder.decode(value, { stream: true })
    }
  }
  return { [Symbol.asyncIterator]() { return { next: pump } } } as AsyncGenerator<Command>
}

/** 命令流编码（函数面 → {$fn: n}——函数表——同进程共享） */
export function encodeCommands(
  stream: ReadableStream<Command>,
  fnTable: Map<number, unknown>,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  // 函数 → 序号（WeakMap——同函数流内复用同序号——减少重复条目；
  // 渲染流消费完清表（fnTable.clear()——历史函数已解码到事件表——
  // $fn 仅传输层——跨流不需要——长会话零累积））
  const fnToId = new WeakMap<object, number>()
  const mark = (k: string, v: unknown): unknown => {
    if (typeof v === 'function') {
      const known = fnToId.get(v as object)
      if (known !== undefined) return { $fn: known }
      const n = fnTable.size + 1
      fnTable.set(n, v)
      fnToId.set(v as object, n)
      return { $fn: n }
    }
    return v
  }
  return stream.pipeThrough(new TransformStream<Command, Uint8Array>({
    transform(cmd, controller) {
      controller.enqueue(enc.encode(JSON.stringify(cmd, mark) + '\n'))
    },
  }))
}

/** 函数表（serve 级共享——编码/解码同进程） */
export function createFnTable(): Map<number, unknown> {
  return new Map()
}

export interface UiServeOptions {
  /** 根容器（选择器或元素——'#root'） */
  root: string | HTMLElement
  /** 中间件注入面（ctx.api/auth/ws/i18n——组件/页面可用——可选） */
  api?: import('../middlewares/api.ts').ApiClient
  auth?: import('../middlewares/auth-i18n.ts').AuthClient
  ws?: import('../middlewares/ws.ts').WsClient
  i18n?: import('../middlewares/auth-i18n.ts').I18nState
  /** 命令式轻提示（ctx.toast——应用装配） */
  toast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void
  /** 命令式确认（ctx.confirm——应用装配——返回 Promise<boolean>） */
  confirm?: (message: string, options?: Record<string, unknown>) => Promise<boolean>
  /** 命令式通知（ctx.notification——应用装配） */
  notification?: unknown
  /**
   * 渲染错误回退 UI（R1 熔断——连续渲染错误达阈值后显示——应用可配置——
   * 缺省内置：错误文案 + 重试按钮（独立于应用路由——不依赖 router.resolve））
   */
  errorFallback?: (error: Error, ctx: UIContext) => VNode
}

export interface UiServeHandle {
  /** 首帧渲染完成 Promise（await 精确等待） */
  ready: Promise<void>
  /** 编程式导航（URL 变化 → 重新 resolve → 新命令事件流 → 消费——
   *   root 异类型 = 整树替换；同类型 = diff 精准） */
  navigate(path: string): Promise<void>
  /** 卸载（清理 DOM/监听） */
  unmount(): void
}

/** serve 生命周期状态机（**全部状态机化——2026-XX**）：
 *  active → unmounted（unmount 消费——迁移后 render/navigate 违例报错） */
export type ServePhase = 'active' | 'unmounted'

/** 渲染队列状态机（**替代裸 rendering boolean**）：
 *  idle → rendering（render 启动）→ idle（runRender 完成/错误/队列空）
 *  - rendering 中 render() → 入队（合法——FIFO 确定性——非违例）
 *  - unmounted 中 render()/navigate() → 违例报错（DOM 已清——静默渲染
 *    是隐藏错误——审计 2026-XX） */
export type RenderPhase = 'idle' | 'rendering'

/** 页面作者渲染入口（ctx 面——vnode → Response command 事件流——
 *  公共面仍只有 h/jsx/uiServe/UIRouter——本入口经 ctx 提供） */
export interface RenderCtx extends UIContext {
  /** vnode → Response（command 事件流——函数表编码——事件绑定跨流保持） */
  stream(vnode: VNode, init?: ResponseInit): Response
}

export function uiServe(router: UIRouter, opts: UiServeOptions): UiServeHandle {
  // 真实浏览器全局（uiServe 仅浏览器端——SSR 走 uiSsr 独立路径）
  const doc = document
  const win = window
  const rootEl = typeof opts.root === 'string'
    ? (doc.querySelector(opts.root) as HTMLElement | null)
    : opts.root
  if (!rootEl) throw new Error(`uiServe: root 未找到 — ${String(opts.root)}`)

  // ── serve 级单例（跨渲染保持——patch 幂等对照现有 DOM + 组件注册表复用） ──
  const fnTable = createFnTable()
  const registry = createComponentRegistry()
  const applier = new CommandApplier(rootEl, doc, registry)
  // **dev 验证器注入（P3b）**：window.__WF_DEV__ 开启（页面注入——场景
  // 测试 addInitScript）——每个命令消费后 Post 断言（console.error 报告
  // ——不中断渲染）——生产零开销
  if ((win as unknown as { __WF_DEV__?: boolean }).__WF_DEV__) {
    applier.devVerify = createDevVerifier()
  }
  let req = frontRequest(win.location.pathname)
  /** 影子树（当前渲染的 vnode——diff 对照——精准增量命令流） */
  let currentTree: VNode | null = null
  /** 渲染队列（用户决策 2026-12）：渲染期间发生的 render → push 入队——
   *  每次渲染完成 → shift 取队头继续——直到队列空——**确定性**：
   *  每个渲染请求最终执行（FIFO——先触发先执行——无丢失无合并歧义） */
  let servePhase: ServePhase = 'active'
  let renderPhase: RenderPhase = 'idle'
  let queue: Request[] = []
  let drainPromise: Promise<void> | null = null
  /** 连续渲染错误计数（R1 熔断——防错误风暴：组件 throw → catch → 重置 →
   *  下次交互再 throw——无限重试循环 + console.error 风暴） */
  let errorCount = 0
  const MAX_RENDER_ERRORS = 3
  /** 熔断回退渲染（独立于 router.resolve——应用可配置——缺省内置） */
  const renderErrorFallback = (err: Error): void => {
    currentTree = null
    const fb = opts.errorFallback?.(err, ctx) ?? defaultErrorFallback(err, ctx)
    const res = renderCtx.stream(fb, { status: 500 })
    const reader = res.body!.getReader()
    void (async () => {
      try {
        for await (const cmd of commandReader(reader, fnTable)) applier.apply(cmd)
      } catch (e2) { console.error('[vdom] error fallback 渲染失败:', e2) }
    })()
  }


  /** 渲染循环（ctx.render 同 URL 重渲染 / navigate 新 URL——同一机制）
   *  **队列确定性**：渲染中触发 → push 入队（FIFO）——当前渲染完成 →
   *  shift 取队头继续——直到队列空；渲染中 await 返回 drainPromise
   *  （精确等待全部队列执行完——含后续入队的渲染）
   *  **redirect 消费**：handler 返回 3xx + Location → replaceState（重定向
   *  语义——不 push 历史）+ 渲染目标 URL（不渲染空响应）
   *  **错误传播**：工厂 reject → 本轮渲染中断（console.error——CS-03——
   *  事件回调不 throw）——**队列继续**（下一个渲染目标自愈——不丢弃） */
  /** afterRender 队列（渲染完成信号——hook 注册等挂载后动作） */
  let afterRenderFns: Array<() => void> = []

  const runRender = async (initial: Request): Promise<void> => {
    let target = initial
    renderPhase = 'rendering'
    try {
      while (true) {
        try {
          req = target
          const res = await router.resolve(req, ctx)
          // **redirect 消费（3xx + Location → replaceState + 渲染目标）**
          const loc = res.headers.get('Location')
          if (res.status >= 300 && res.status < 400 && loc) {
            win.history.replaceState({}, '', loc)
            target = frontRequest(loc)
            continue // 不渲染空响应——直接渲染目标 URL
          }
          if (res.body) {
            for await (const cmd of commandReader(res.body.getReader(), fnTable)) {
              applier.apply(cmd)
            }
            // **SSR 吸收失败（mismatch）→ 原子回退**：清空 root + 影子树
            // 重置 + 重新渲染（target 不变——重跑全量 build——等价重建）
            if (applier.absorb.failed) {
              rootEl.innerHTML = ''
              currentTree = null
              applier.absorb.reset()
              continue
            }
          }
          // **首帧吸收失败（同导航流程——uiServe mount 时 root 预置静态
          // HTML 无 v3 标记——类型错位匹配失败——无回退则错位 DOM 污染
          // 影子树——后续 diff 锚失效（showcase 首页 procInsert 崩溃）**
          if (!currentTree && applier.absorb.failed) {
            rootEl.innerHTML = ''
            applier.absorb.reset()
            continue
          }
          // 请求成功渲染 → 错误计数重置（连续错误语义——成功中断链）
          errorCount = 0
        } catch (e) {
          // 渲染错误（组件工厂 reject / 流消费异常）——**请求级中断**——
          // 队列延续（R3 实证：3 连击只有 1 次计数——click2/3 遗留在队列——
          // 错误中断后无人消费——用户触发丢失）
          // **影子树重置**：ReadableStream start reject 会丢弃已缓冲命令——
          // DOM 与影子树不一致——后续 diff 全部 no-op（静默失效）——
          // 重置后下次渲染走全量 build（create 幂等/insert 幂等/done.full
          // 清理——自愈完整）
          currentTree = null
          errorCount++
          console.error('[vdom] render:', e)
          // **R1 错误熔断**：连续错误达阈值 → 回退 UI（不再风暴——成功
          // 重置计数——错误修复自愈路径）
          if (errorCount >= MAX_RENDER_ERRORS) {
            errorCount = 0 // 熔断已触发——计数重置（回退 UI 常驻——交互重试）
            renderErrorFallback(e instanceof Error ? e : new Error(String(e)))
          }
        }
        // 下一请求（**成功或失败都继续队列——FIFO 不丢弃**）
        if (queue.length > 0) {
          target = queue.shift()!
        } else {
          break
        }
      }
    } finally {
      // **渲染完成信号**：flush afterRender（hook 注册——元素已挂载）
      const fns = afterRenderFns
      afterRenderFns = []
      for (const fn of fns) { try { fn() } catch (e) { console.error('[vdom] afterRender:', e) } }
      renderPhase = 'idle'
      drainPromise = null
      // **函数表清理**：$fn 仅传输层（历史函数已解码到事件表/ref 表——
      // 跨流不需要）——消费完即清——长会话零累积
      fnTable.clear()
    }
  }

  const render = (target: Request): Promise<void> => {
    // **生命周期状态机违例（审计）**：unmount 后 render——DOM 已清——
    // 静默渲染是隐藏错误（异步回调在卸载后触发）
    if (servePhase === 'unmounted') {
      console.error('[vdom] serve 状态机违例：unmount 后 render 调用被忽略')
      return Promise.resolve()
    }
    if (renderPhase === 'rendering' && drainPromise) {
      // 渲染中触发 → push 入队（确定性：每个请求最终执行）
      queue.push(target)
      return drainPromise // await 全部队列执行完（含后续入队）
    }
    const p = runRender(target)
    drainPromise = p
    return p
  }

  /** 编程式导航（pushState + 渲染——popstate 语义） */
  const navigate = async (path: string): Promise<void> => {
    // **生命周期状态机违例（审计）**：unmount 后 navigate——同 render
    if (servePhase === 'unmounted') {
      console.error('[vdom] serve 状态机违例：unmount 后 navigate 被忽略')
      return
    }
    win.history.pushState({}, '', path)
    await render(frontRequest(path))
  }

  // ── ctx（render = 重新渲染唯一入口——事件/fetch/定时器回调） ──
  const ctx = {
    /** 重新渲染：重新 resolve（handler 重跑——registry 复用——工厂不重跑）→
     *  新的 Response command 事件流 → 消费（patch 对照现有 DOM——就地更新）
     *  **并发守卫**：渲染中触发 → 单槽位补跑——await 精确等待最终渲染 */
    async render(): Promise<void> {
      await render(req)
    },
    /** 数据管道（组件工厂取数——唯一异步边界——缓存/并发合并/失败缓存） */
    data: createDataPipe(),
    /** 浏览器环境（生产适配——惰性全局访问——SSR 安全） */
    browser: createClientBrowser(),
    /** serve 级卸载注册（unmount 时执行——组件外清理） */
    onUnmount(fn: () => void): void {
      serveUnmounts.push(fn)
    },
    /** 渲染完成回调注册（hook 挂载后动作——元素已挂载） */
    afterRender(fn: () => void): void {
      afterRenderFns.push(fn)
    },
    // 中间件注入面（可选——ctx.api/auth/ws/i18n——组件/页面消费）
    ...(opts.api ? { api: opts.api } : {}),
    ...(opts.auth ? { auth: opts.auth } : {}),
    ...(opts.ws ? { ws: opts.ws } : {}),
    ...(opts.i18n ? { i18n: opts.i18n } : {}),
    ...(opts.toast ? { toast: opts.toast } : {}),
    ...(opts.confirm ? { confirm: opts.confirm } : {}),
    ...(opts.notification ? { notification: opts.notification } : {}),
    /** 应用面导航（ctx.app.navigate——button onClick 编程式导航——
     *  与 a[href] 拦截同一 navigate——pushState + 渲染循环） */
    app: { navigate },
  } as unknown as UIContext

  // ── 页面作者渲染入口（vnode → Response 事件流——函数表编码） ──
  const renderCtx = ctx as RenderCtx
  renderCtx.stream = (vnode: VNode, init?: ResponseInit): Response => {
    // **diff 本质（2026-12）：精准生成需要 patch 的事件流**——
    // 有影子树 → diff（增量命令——counter 点击只发文本 setText）；
    // 无影子树（首帧）→ build 全量。
    // root 类型变化（导航/组件切换）→ **全量 build**（done.full 清理旧树）；
    // 同类型 → diff 精准
    if (!currentTree && rootEl.childNodes.length > 0) {
      // **SSR 接管（结构吸收）判定**：仅当 root 含 SSR 吸收标记
      // （<!--wf-hole--> 锚注释——SSR 输出端 createAnchor 序列化）才
      // 吸收——无标记（静态预置 HTML/骨架屏——showcase 首页 shellHeader+
      // hero）→ **清空重建**（吸收跳过机制跨结构错配——next 跳过非目标
      // 节点会错配到深层同类元素——错位 DOM 污染影子树——后续 diff 锚
      // 失效 procInsert 崩溃——showcase 首页 8 次报错根因）
      const hasSsrMark = Array.from(rootEl.querySelectorAll('*')).some((el) =>
        [...el.childNodes].some((n) => n.nodeType === 8 && (n as Comment).textContent?.includes('wf')),
      )
      if (hasSsrMark) {
        applier.absorb.begin(rootEl)
      } else {
        rootEl.innerHTML = ''
      }
    }
    const stream = currentTree
      ? (currentTree.type !== vnode.type
        ? (() => {
          // 整树替换（导航/root 组件切换）——**旧组件实例全部卸载**
          //（onUnmounts 清理——否则 renderComponent 复用旧 rec——类型错位）
          disposeAllComponents(registry)
          return renderToStream(vnode, ctx, registry)
        })()
        : diffStream(currentTree, vnode, ctx, registry))
      : renderToStream(vnode, ctx, registry)
    currentTree = vnode // 影子树更新（下次对照）
    return new Response(encodeCommands(stream, fnTable), {
      status: init?.status ?? 200,
      headers: init?.headers,
    })
  }

  // ── 链接拦截（同源 a[href] → 导航——外链/锚点不拦截） ──
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

  // ── popstate（浏览器前进/后退 → 渲染当前 URL） ──
  const onPopstate = (): void => {
    void render(frontRequest(win.location.pathname))
  }
  win.addEventListener('popstate', onPopstate)

  const ready = (async () => {
    await render(req)
  })()
  const serveUnmounts: Array<() => void> = []

  return {
    ready,
    navigate,
    unmount() {
      // **生命周期状态机迁移（审计）**：active → unmounted——后续
      // render/navigate 违例报错（不再静默）
      servePhase = 'unmounted'
      doc.removeEventListener('click', onDocClick)
      win.removeEventListener('popstate', onPopstate)
      applier.dispose() // 事件代理根监听移除（资源释放完整）
      for (const fn of serveUnmounts.reverse()) { try { fn() } catch (e) { console.error('[vdom] unmount:', e) } }
      serveUnmounts.length = 0
      rootEl.innerHTML = ''
    },
  }
}
