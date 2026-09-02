/**
 * vdom hooks — 健壮性契约（R5—— P4）
 *
 * 覆盖（mock 环境直跑——零浏览器——行为/清理/边界断言）：
 * - useTween：duration 边界（0/负值直落不 NaN）/ 目标变化补间 / unmount 取消
 *   rAF（无泄漏）/ reduced-motion 直落
 * - useDrag：完整生命周期（down/move/up）+ **pointercancel 清理（R5 修复
 *   回归——拖拽中触摸中断监听残留）/ 多指 pointerId 匹配 / 拖拽中 unmount
 *   释放监听
 * - useVisualViewport：vv 监听注册/更新触发/卸载清理（含 window fallback）
 * - useReducedMotion：matchMedia 直落（reduce/无偏好）
 * - ai-stream：真实 HTTP fixture——SSE 事件分发 / HTTP 错误码映射 /
 *   abort 静默取消 / 记录上限环
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import type { HookEnv } from '../../client/vdom/hooks/env.ts'
import { createUi } from '../../client/vdom/hooks/env.ts'
import { useTween, useDrag, useVisualViewport, useReducedMotion } from '../../client/vdom/hooks/stable.ts'
import { aiStream } from '../../client/vdom/hooks/ai-stream.ts'

// ── fake 浏览器环境（零浏览器——行为断言） ──────────────────────────

class FakeWindow {
  listeners = new Map<string, Array<EventListener>>()
  rafs: Array<() => void> = []
  now = 0
  innerHeight = 800
  visualViewport: { height: number; offsetTop: number; listeners: Map<string, Array<EventListener>>; addEventListener: any; removeEventListener: any } | null = null
  matchMediaImpl: ((q: string) => { matches: boolean }) | null = null

  addEventListener(type: string, fn: EventListener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type)!.push(fn)
  }
  removeEventListener(type: string, fn: EventListener): void {
    const arr = this.listeners.get(type)
    if (arr) { const i = arr.indexOf(fn); if (i >= 0) arr.splice(i, 1) }
  }
  requestAnimationFrame(cb: () => void): number { this.rafs.push(cb); return this.rafs.length }
  cancelAnimationFrame(_id: number): void { this.rafs = [] }
  performance = { now: () => this.now }
  matchMedia(q: string) {
    // **Mql 形状契约（2026-08——useMedia 消费面）**：matches +
    // addEventListener/removeEventListener('change')——change 监听同步进
    // window.listeners['change']（测试 dispatch 通道——浏览器语义近似）
    const self = this
    const ls: Array<() => void> = []
    return {
      // **getter 语义（浏览器 Mql.matches 是活的）**：动态读——change 后
      // matches 立即反映
      get matches(): boolean { return self.matchMediaImpl?.(q)?.matches ?? false },
      addEventListener: (t: string, cb: () => void) => {
        ls.push(cb)
        // 同步进 window 监听表（dispatch 通道——浏览器语义近似）
        if (!self.listeners.has(t)) self.listeners.set(t, [])
        self.listeners.get(t)!.push(cb)
      },
      removeEventListener: (t: string, cb: () => void) => {
        const i = ls.indexOf(cb); if (i >= 0) ls.splice(i, 1)
        const arr = self.listeners.get(t); const j = arr?.indexOf(cb) ?? -1; if (arr && j >= 0) arr.splice(j, 1)
      },
    } as any
  }
  dispatch(type: string, ev: any = {}): void {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(ev as EventListener)
  }
  listenerCount(type: string): number { return (this.listeners.get(type) ?? []).length }
}

function makeEnv(win?: FakeWindow): HookEnv & { onUnmounts: Array<() => void> } {
  const onUnmounts: Array<() => void> = []
  let renders = 0
  const instData = new Map<unknown, unknown>()
  const hookSlots = new Map<number, unknown>()
  let hookIdx = 0
  return {
    onUnmounts,
    requestRender: () => { renders++ },
    onUnmount: (fn) => { onUnmounts.push(fn) },
    getBrowser: () => (win ? { window: win as any } as any : null),
    getInstanceData: () => instData,
    // hook 槽位（G14 useTween 槽位记忆化——mock 同实现：每渲染 pass 从 0 递增）
    nextHookIndex: () => hookIdx++,
    getHookState: <T>(idx: number) => hookSlots.get(idx) as T | undefined,
    setHookState: <T>(idx: number, v: T) => { hookSlots.set(idx, v) },
  } as any
}

function pointer(id: number, x = 0, y = 0): any {
  return { pointerId: id, clientX: x, clientY: y, preventDefault: () => {} }
}

// ── useTween ─────────────────────────────────────────────────────────

test('useTween：duration ≤ 0 直落终值（无 NaN——除零防护回归）', () => {
  const env = makeEnv(new FakeWindow())
  const h = useTween(env, 100, { duration: 0 })
  assert.equal(Number.isNaN(h.value), false)
  assert.equal(h.value, 100, 'duration 0 = 直落终值')
  const h2 = useTween(env, 50, { duration: -10 })
  assert.equal(h2.value, 50)
})

test('useTween：目标变化补间 + unmount 取消 rAF（无泄漏）', () => {
  const win = new FakeWindow()
  const env = makeEnv(win)
  const h = useTween(env, 200, { duration: 400 })
  assert.ok(win.rafs.length > 0, '补间启动 rAF')
  // 推进动画至完成（t=400 → 200——快照取走 + 清空——真实 rAF 一次性）
  win.now = 400
  { const q = [...win.rafs]; win.rafs = []; for (const raf of q) raf(win.now) }
  assert.equal(h.value, 200, 't=400 到终值')
  assert.equal(win.rafs.length, 0, '终值后无残留帧')
  // 目标变化（200 → 400）重新补间（先清旧帧——reset 推新帧——逐帧推进）
  win.rafs = []
  h.reset(400)
  win.now = 800
  for (let k = 0; k < 10 && win.rafs.length > 0; k++) {
    const q = [...win.rafs]
    win.rafs = []
    for (const raf of q) raf(win.now)
  }
  assert.equal(h.value, 400, '目标变化补间到新值')
  assert.equal(win.rafs.length, 0, '补间完成无残留帧')
  // unmount 取消
  for (const fn of env.onUnmounts) fn()
  assert.equal(win.rafs.length, 0, 'unmount 后 rAF 清空')
})

test('useTween：reduced-motion 直落终值（跳过补间）', () => {
  const win = new FakeWindow()
  win.matchMediaImpl = () => ({ matches: true })
  const env = makeEnv(win)
  const h = useTween(env, 42, { duration: 400 })
  assert.equal(h.value, 42, 'reduced 直落 target')
  assert.equal(win.rafs.length, 0, 'reduced 无 rAF')
})

// ── getter 化契约（2026-08——useMedia/useExternal/useBreakpoint） ────
// **返回值形态 = 语义的载体**：`() => T`（getter）——任何位置调用返回最新
// 值——mount 闭包持有永远最新——「调用位置规则」在 API 形状不存在——
// **登记幂等**：按业务 key（query/store 引用）——任意位置任意次数调用
// 不重复订阅/监听（旧快照返回 + idx 顺序注册：mount 闭包失效 + 重复
// 调用重复订阅双缺陷）
import { useMedia, useBreakpoint } from '../../client/vdom/hooks/drag-media.ts'
import { createStore, createSignal } from '../../client/vdom/store.ts'

test('useMedia：getter 形态——mount 闭包持有永远最新 + 登记幂等（按 query）', () => {
  const win = new FakeWindow()
  let narrow = false
  win.matchMediaImpl = () => ({ matches: narrow })
  const env = makeEnv(win)
  // mount 闭包调用（getter 化后合法——旧快照形态此处即静默失效）
  const readNarrow = useMedia(env, '(max-width: 700px)')
  assert.equal(readNarrow(), false, '初始 宽')
  // 重复调用（任意位置任意次数）——不重复监听（登记幂等）
  const readAgain = useMedia(env, '(max-width: 700px)')
  assert.equal(readAgain(), false)
  const subCount = win.listenerCount('change')
  // 事件驱动 → getter 最新
  narrow = true
  ;(win as any).dispatch('change', {} as Event)
  assert.equal(readNarrow(), true, 'change 后 getter 立即最新')
  // 卸载清理监听（不泄漏）
  for (const fn of env.onUnmounts) fn()
  assert.equal(win.listenerCount('change'), 0, 'unmount 清理')
  assert.ok(subCount >= 1, 'change 监听已注册')
})

test('useExternal：getter 形态——store 变化 → getter 最新 + 订阅幂等（按引用）', () => {
  const store = createStore({ count: 0 })
  const env = makeEnv()
  const ui = createUi(env as any)
  const getCount = ui.useExternal(store)
  assert.equal(getCount().count, 0)
  // 重复调用不重复订阅（实例级 keyed）
  ui.useExternal(store)
  store.update((s) => { s.count += 1 })
  assert.equal(getCount().count, 1, 'update 后 getter 立即最新')
})

test('createSignal：getter 读 + set/update 写 + ExternalStore 兼容', () => {
  const sig = createSignal({ n: 1 })
  assert.equal(sig().n, 1)
  sig.set({ n: 2 })
  assert.equal(sig().n, 2)
  sig.update((s) => { s.n += 1 })
  assert.equal(sig().n, 3)
  // ExternalStore 兼容（useExternal 同源消费）
  let pushed = 0
  sig.subscribe(() => { pushed++ })
  sig.set({ n: 4 })
  assert.equal(pushed, 1, '订阅通知')
  assert.equal(sig.store.state.n, 4, 'store 面同步')
})

test('useBreakpoint：getter 形态——断点遍历最新（min-width 最大匹配）', () => {
  const win = new FakeWindow()
  win.matchMediaImpl = () => ({ matches: true })
  const env = makeEnv(win)
  const bp = useBreakpoint(env, { mobile: 0, tablet: 768, desktop: 1024 })
  assert.equal(bp(), 'desktop', '全部匹配 → 最大断点')
})

// ── useDrag ──────────────────────────────────────────────────────────

test('useDrag：完整生命周期（down→move→up 清理监听）', () => {
  const win = new FakeWindow()
  const env = makeEnv(win)
  const moves: Array<{ x: number; y: number }> = []
  let ends = 0
  const drag = useDrag(env, { onMove: (_e, d) => moves.push(d), onEnd: () => { ends++ } })
  drag.onPointerDown(pointer(1, 10, 10))
  assert.equal(win.listenerCount('pointermove'), 1)
  win.dispatch('pointermove', pointer(1, 30, 20))
  assert.deepEqual(moves, [{ x: 20, y: 10 }])
  win.dispatch('pointerup', pointer(1, 30, 20))
  assert.equal(ends, 1)
  assert.equal(win.listenerCount('pointermove'), 0, 'up 后监听释放')
})

test('useDrag：pointercancel 清理（R5 修复回归——触摸中断无残留）', () => {
  const win = new FakeWindow()
  const env = makeEnv(win)
  let ends = 0
  const drag = useDrag(env, { onMove: () => {}, onEnd: () => { ends++ } })
  drag.onPointerDown(pointer(1, 0, 0))
  assert.equal(win.listenerCount('pointermove'), 1)
  win.dispatch('pointercancel', pointer(1, 0, 0))
  assert.equal(ends, 1, 'cancel 触发 onEnd')
  assert.equal(win.listenerCount('pointermove'), 0, 'cancel 后监听释放（修复前残留）')
  assert.equal(win.listenerCount('pointerup'), 0)
  assert.equal(win.listenerCount('pointercancel'), 0)
  // 后续 move 不回调（active=false）
  win.dispatch('pointermove', pointer(1, 100, 100))
  assert.equal(win.listenerCount('pointermove'), 0)
})

test('useDrag：多指 pointerId 匹配（非起始指 up/cancel 不结束）', () => {
  const win = new FakeWindow()
  const env = makeEnv(win)
  let moves = 0
  let ends = 0
  const drag = useDrag(env, { onMove: () => { moves++ }, onEnd: () => { ends++ } })
  drag.onPointerDown(pointer(1, 0, 0))
  win.dispatch('pointermove', pointer(2, 10, 0)) // 第二指 move（忽略——active 期间 down 有 guard，此 move 走 onPointerMove 但 delta 会算——**修复前不匹配 pointerId 也允许？**——R5 语义：move 只认起始指）
  // up 第二指（不结束）
  win.dispatch('pointerup', pointer(2, 0, 0))
  assert.equal(ends, 0, '非起始指 up 不结束')
  assert.equal(win.listenerCount('pointermove'), 1, '拖拽仍活跃')
  win.dispatch('pointerup', pointer(1, 0, 0))
  assert.equal(ends, 1, '起始指 up 正常结束')
  assert.equal(win.listenerCount('pointermove'), 0)
})

test('useDrag：拖拽中 unmount 释放监听（无泄漏）', () => {
  const win = new FakeWindow()
  const env = makeEnv(win)
  const drag = useDrag(env, { onMove: () => {}, onEnd: () => {} })
  drag.onPointerDown(pointer(1, 0, 0))
  assert.equal(win.listenerCount('pointermove'), 1)
  for (const fn of env.onUnmounts) fn()
  assert.equal(win.listenerCount('pointermove'), 0, 'unmount 释放活动期监听')
  assert.equal(win.listenerCount('pointerup'), 0)
})

// ── useVisualViewport ────────────────────────────────────────────────

test('useVisualViewport：vv 监听更新 + 卸载清理', () => {
  const win = new FakeWindow()
  win.visualViewport = {
    height: 700, offsetTop: 0,
    listeners: new Map(),
    addEventListener(type: string, fn: any) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type)!.push(fn) },
    removeEventListener(type: string, fn: any) { const a = this.listeners.get(type) ?? []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1) },
  }
  const env = makeEnv(win)
  const h = useVisualViewport(env)
  assert.equal(h.height, 700)
  // vv resize 触发更新
  win.visualViewport.height = 500
  win.visualViewport.listeners.get('resize')!.forEach((fn: any) => fn())
  assert.equal(h.height, 500)
  assert.equal(h.keyboardOpen, true, '500 < 800*0.9 → 键盘开')
  // 卸载清理
  for (const fn of env.onUnmounts) fn()
  assert.equal(win.visualViewport.listeners.get('resize')?.length ?? 0, 0, 'unmount 清理 vv 监听')
})

test('useVisualViewport：vv 不可用 → window resize fallback（含清理）', () => {
  const win = new FakeWindow()
  const env = makeEnv(win)
  const h = useVisualViewport(env)
  assert.equal(h.height, 800, 'fallback innerHeight')
  assert.equal(win.listenerCount('resize'), 1)
  win.innerHeight = 600
  win.dispatch('resize')
  assert.equal(h.height, 600, 'fallback resize 更新（读内高）')
  for (const fn of env.onUnmounts) fn()
  assert.equal(win.listenerCount('resize'), 0)
})

// ── useReducedMotion ─────────────────────────────────────────────────

test('useReducedMotion：matchMedia 直落（reduce / 无偏好 / 无环境）', () => {
  const win = new FakeWindow()
  win.matchMediaImpl = (q) => ({ matches: q.includes('reduce') })
  assert.equal(useReducedMotion(makeEnv(win)), true)
  const win2 = new FakeWindow()
  win2.matchMediaImpl = () => ({ matches: false })
  assert.equal(useReducedMotion(makeEnv(win2)), false)
  assert.equal(useReducedMotion(makeEnv(undefined as any)), false, '无环境安全直落')
})

// ── ai-stream（真实 HTTP fixture——SSE） ─────────────────────────────

let server: Server
let base = ''

before(() => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname === '/sse') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('event: wf:token\ndata: {"text":"你"}\n\n')
      res.write('event: wf:token\ndata: {"text":"好"}\n\n')
      setTimeout(() => {
        res.write('event: wf:done\ndata: {"cost":1}\n\n')
        res.end()
      }, 10)
    } else if (url.pathname === '/sse-error') {
      res.writeHead(500, { 'content-type': 'text/plain' })
      res.end('boom')
    } else if (url.pathname === '/sse-malformed') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('event: wf:token\ndata: {not-json}\n\n')
      res.write('event: wf:usage\ndata: {"in":1}\n\n')
      res.end()
    } else if (url.pathname === '/sse-slow') {
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      // 永不结束（abort 测试——释放前不响应）
      req.on('close', () => res.end())
    } else {
      res.writeHead(404); res.end()
    }
  })
  return new Promise<void>((r) => server.listen(0, '127.0.0.1', () => {
    const addr = server.address() as { port: number }
    base = `http://127.0.0.1:${addr.port}`
    r()
  }))
})

after(() => new Promise<void>((r) => server.close(() => r())))

test('ai-stream：SSE 事件分发（token 累积 + done + events 记录）', async () => {
  const tokens: string[] = []
  let done: unknown
  const handle = aiStream(`${base}/sse`, {}, { onToken: (t) => tokens.push(t), onDone: (d) => { done = d } })
  await handle.done
  assert.deepEqual(tokens, ['你', '好'])
  assert.deepEqual(done, { cost: 1 })
  assert.ok(handle.events.length >= 3, 'events 记录')
})

test('ai-stream：HTTP 错误映射（500 → provider_error）', async () => {
  const errors: any[] = []
  const handle = aiStream(`${base}/sse-error`, {}, { onError: (e) => errors.push(e) })
  await handle.done
  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'provider_error')
})

test('ai-stream：abort 静默取消（无 onError——主动取消语义）', async () => {
  const errors: any[] = []
  const handle = aiStream(`${base}/sse-slow`, {}, { onError: (e) => errors.push(e) })
  handle.abort()
  await handle.done
  assert.deepEqual(errors, [], '主动取消静默（不报错）')
})

test('ai-stream：malformed 事件不中断（非 JSON 跳过——流继续）', async () => {
  const usages: any[] = []
  const handle = aiStream(`${base}/sse-malformed`, {}, { onUsage: (u) => usages.push(u) })
  await handle.done
  assert.deepEqual(usages, [{ in: 1 }], '非 JSON 块跳过——后续事件正常分发')
})
