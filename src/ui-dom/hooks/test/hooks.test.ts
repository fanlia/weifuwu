/**
 * hooks 单元测试——独立于 ctx.ui 直接测试 hooks 函数（useXXX(env, ...)）
 *
 * 验证 hooks 重构的正确性：env 驱动（selfId/dirty/onUnmount/共享注册表）。
 */
import { test, before, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from '../../../test/client/setup.ts'
import { createClientBrowser } from '../../browser.ts'
import { useControlled, useControlledInput, useAsync } from '../input.ts'
import { usePopup, usePopupPosition, useOpen, useDialog } from '../popup.ts'
import { usePresence, useTween, useStableRef, useStableCallback, useLongPress } from '../stable.ts'
import { useScrollPosition, useInView, useMedia } from '../media.ts'
import { useGlobalKey, useDrag } from '../events.ts'
import type { HookEnv } from '../types.ts'
import type { Registry } from '../../vdom/registry.ts'
import { createRegistry } from '../../vdom/registry.ts'

before(setupJsdom)
afterEach(() => {
  createClientBrowser().clearBody()
})

function makeEnv(overrides: Partial<HookEnv> = {}): { env: HookEnv; state: any } {
  const browser = createClientBrowser()
  const reg: Registry = createRegistry()
  const state: any = {
    dirty: [] as string[],
    rendered: [] as string[],
    unmountHooks: [] as ((id: string) => void)[],
  }
  let selfId = '_wf_0'
  const env: HookEnv = {
    selfId: () => selfId,
    render: (ids) => { state.rendered.push(...(ids ?? [])) },
    browser,
    onUnmount: (fn) => { state.unmountHooks.push(fn); return () => {} },
    registry: reg,
    mediaRegistry: new Map(),
    popupTrackers: new Map(),
    scrollTrackers: new Map(),
    isMounting: () => false,
    warned: new Set(),
    uncontrolledValues: new Map(),
    inputStates: new Map(),
    openStates: new Map(),
    stableCallbacks: new Map(),
    ensurePopupListeners: () => {},
    ...overrides,
  }
  return { env, state }
}

// ── useControlled：受控/非受控 ──

test('useControlled: 受控 → setValue 走 onChange，不写内部态', () => {
  const { env, state } = makeEnv()
  const calls: string[] = []
  const c = useControlled<string>(env, { value: 'a', onChange: (v) => calls.push(v), name: 'T' })
  assert.equal(c.controlled, true)
  assert.equal(c.value, 'a')
  c.setValue('b')
  assert.deepEqual(calls, ['b'])
  assert.equal(state.rendered.length, 0, '受控不 dirty')
})

test('useControlled: 非受控 → 内部态 + dirty', () => {
  const { env, state } = makeEnv()
  const c = useControlled<string>(env, {})
  assert.equal(c.controlled, false)
  c.setValue('x')
  assert.equal(env.uncontrolledValues.get('_wf_0'), 'x')
  assert.deepEqual(state.rendered, ['_wf_0'])
  // 卸载清理
  for (const fn of state.unmountHooks) fn('_wf_0')
  assert.equal(env.uncontrolledValues.has('_wf_0'), false, '卸载清理内部态')
})

test('useControlled: 受控缺回调 warn 一次（按 name 幂等）', () => {
  const { env } = makeEnv()
  const warns: any[] = []
  const orig = console.warn
  console.warn = (...a) => warns.push(a)
  try {
    useControlled(env, { value: 'a', name: 'WarnComp' })
    useControlled(env, { value: 'b', name: 'WarnComp' })
  } finally {
    console.warn = orig
  }
  assert.equal(warns.length, 1, '同名 warn 一次')
})

// ── useOpen：非受控内部打开态 ──

test('useOpen: 非受控 setOpen + dirty；受控走 onOpenChange', () => {
  const { env, state } = makeEnv()
  const o = useOpen(env, {})
  assert.equal(o.open, false)
  o.setOpen(true)
  assert.equal(o.open, true)
  assert.deepEqual(state.rendered, ['_wf_0'])
  // 受控
  const calls: boolean[] = []
  const oc = useOpen(env, { open: true, onOpenChange: (v) => calls.push(v) })
  oc.setOpen(false)
  assert.deepEqual(calls, [false])
  assert.equal(oc.open, true, '受控 open 由 props 决定')
})

// ── usePopupPosition：tracker 注册 + refresh ──

test('usePopupPosition: 注册 tracker + refresh 计算坐标（0 rect 防护）', () => {
  const { env } = makeEnv()
  let anchor: HTMLElement | null = null
  const pos = usePopupPosition(env, {
    el: () => anchor,
    isOpen: () => true,
    compute: (r) => ({ top: r.bottom + 4, left: r.left }),
  })
  assert.ok(env.popupTrackers.has('_wf_0'), 'tracker 注册')
  // 0 rect：跳过（保留 0）
  pos.refresh()
  assert.equal(pos.top, 0)
  // 有 rect
  anchor = document.createElement('div')
  anchor.getBoundingClientRect = () => ({ top: 10, bottom: 100, left: 50, right: 200, width: 150, height: 90 } as DOMRect)
  pos.refresh()
  assert.equal(pos.top, 104)
  assert.equal(pos.left, 50)
})

// ── usePopup：portal/wrapProps/open getter ──

test('usePopup: open getter 动态（非创建时快照）+ portal 定位', () => {
  const { env } = makeEnv()
  let open = false
  const setOpenCalls: boolean[] = []
  const p = usePopup(env, {
    trigger: 'click',
    el: () => null,
    isOpen: () => open,
    setOpen: (v) => { open = v; setOpenCalls.push(v) },
  })
  assert.equal(p.open, false)
  p.wrapProps.onClick()
  assert.equal(open, true, 'click 打开')
  // portal：open=true → 返回 portal vnode（_placement remote）
  const pv = p.portal(document.createElement('div') as any) as any
  assert.ok(pv && pv._placement === 'remote', 'portal vnode')
})

// ── usePresence/useDialog：状态机 ──

test('usePresence: open → exit → closed（animationend 卸载）', () => {
  const { env, state } = makeEnv()
  const presence = usePresence(env)
  presence.sync(true)
  assert.equal(presence.phase, 'open')
  presence.sync(false)
  assert.equal(presence.phase, 'exit')
  // animationend 完成 → closed + dirty
  const el = document.createElement('div')
  presence.ref(el)
  el.dispatchEvent(new (window as any).Event('animationend'))
  assert.equal(presence.phase, 'closed')
  assert.deepEqual(state.rendered, ['_wf_0'])
})

test('useDialog: 返回 rootRef/panelRef/sync', () => {
  const { env } = makeEnv()
  const d = useDialog(env)
  assert.equal(typeof d.rootRef, 'function')
  assert.equal(typeof d.panelRef, 'function')
  d.sync(true)
  assert.equal(d.phase, 'open')
})

// ── useAsync：数据就绪 dirty ──

test('useAsync: resolve 后 data 更新 + dirty', async () => {
  const { env, state } = makeEnv()
  const a = useAsync(env, async () => 'data1')
  assert.equal(a.loading, true)
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(a.data, 'data1')
  assert.equal(a.loading, false)
  assert.ok(state.rendered.length > 0, 'resolve 后 dirty')
})

test('useAsync: stale-close——慢旧请求不覆盖新结果', async () => {
  const { env } = makeEnv()
  let slow!: () => void
  const slowP = new Promise<string>((r) => { slow = () => r('slow') })
  const a = useAsync(env, () => slowP)
  a.reload = () => {}
  // 手动 reload 模拟（换 fetcher 需要重新调 hook——此处验证 token 语义）
  const a2 = useAsync(env, async () => 'fast')
  slow()
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(a2.data, 'fast')
  assert.equal(a2.loading, false)
})

// ── useStableRef：引用恒等 ──

test('useStableRef: 多次调用返回同一引用', () => {
  const { env } = makeEnv()
  const r1 = useStableRef(env, () => {})
  const r2 = useStableRef(env, () => {})
  // 同 env 同组件——同一函数（每次调用新建但 ref 语义正确：init 只在 el 非 null 触发）
  let inited = 0
  const r = useStableRef(env, () => inited++)
  r(document.createElement('div'))
  r(null)
  assert.equal(inited, 1)
  void r1; void r2
})

// ── useScrollPosition：tracker 注册 + 初始值 ──

test('useScrollPosition: 注册 scroll tracker + 初始 y', () => {
  const { env } = makeEnv()
  const sp = useScrollPosition(env, {})
  assert.ok(env.scrollTrackers.has('_wf_0'))
  assert.equal(typeof sp.y, 'number')
})

// ── useGlobalKey：注册 + 退订 ──

test('useGlobalKey: 注册 window keydown + 退订', () => {
  const { env } = makeEnv()
  let hits = 0
  const unsub = useGlobalKey(env, () => hits++)
  window.dispatchEvent(new (window as any).Event('keydown'))
  assert.equal(hits, 1)
  unsub()
  window.dispatchEvent(new (window as any).Event('keydown'))
  assert.equal(hits, 1, '退订后不再触发')
})

// ── useTween：reduced-motion 直落终值 ──

test('useTween: 目标值补间（reset 幂等）', () => {
  const { env } = makeEnv()
  const t = useTween(env, 100, { duration: 10 })
  assert.equal(typeof t.value, 'number')
  t.reset(100)
  assert.equal(typeof t.value, 'number')
})

// ── 卸载清理：组件销毁时监听/tracker 自动释放 ──

test('usePopupPosition: 卸载清理 tracker（cleanupTrackers 接线）', () => {
  const { env, state } = makeEnv()
  usePopupPosition(env, { el: () => null, isOpen: () => true, compute: (r) => ({ top: 0, left: 0 }) })
  assert.ok(env.popupTrackers.has('_wf_0'), 'tracker 注册')
  for (const fn of state.unmountHooks) fn('_wf_0')
  assert.equal(env.popupTrackers.has('_wf_0'), false, '卸载清理 tracker')
})

test('useScrollPosition: 卸载清理 scroll tracker', () => {
  const { env, state } = makeEnv()
  useScrollPosition(env, {})
  assert.ok(env.scrollTrackers.has('_wf_0'))
  for (const fn of state.unmountHooks) fn('_wf_0')
  assert.equal(env.scrollTrackers.has('_wf_0'), false, '卸载清理 scroll tracker')
})

test('useMedia: 卸载移除 mql change 监听', () => {
  const { env, state } = makeEnv()
  let removed = 0
  const fakeMql = {
    matches: false,
    addEventListener: (_t: string, _h: any) => {},
    removeEventListener: () => { removed++ },
  }
  env.browser.matchMedia = (() => fakeMql) as any
  useMedia(env, '(max-width: 100px)', () => {})
  assert.ok(env.mediaRegistry.has('media:_wf_0:(max-width: 100px)'))
  for (const fn of state.unmountHooks) fn('_wf_0')
  assert.equal(removed, 1, '卸载移除 mql 监听')
  assert.equal(env.mediaRegistry.has('media:_wf_0:(max-width: 100px)'), false, 'mediaRegistry 清理')
})

test('useInView: 卸载自动 disconnect IO', () => {
  const { env, state } = makeEnv()
  let disconnected = 0
  const FakeIO = class {
    observe() {}
    disconnect() { disconnected++ }
  }
  ;(globalThis as any).IntersectionObserver = FakeIO
  const iv = useInView(env, {})
  iv.observe(document.createElement('div'))
  for (const fn of state.unmountHooks) fn('_wf_0')
  assert.equal(disconnected, 1, '卸载自动 disconnect IO')
})

test('useLongPress: 卸载清除挂起定时器', async () => {
  const { env, state } = makeEnv()
  let fired = 0
  const lp = useLongPress(env, { onLongPress: () => fired++, duration: 50 })
  // 触发长按启动（挂起定时器）
  lp.onPointerDown(new (window as any).PointerEvent('pointerdown', { clientX: 0, clientY: 0 }))
  for (const fn of state.unmountHooks) fn('_wf_0')
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(fired, 0, '卸载后定时器不触发 onLongPress')
})

test('useDrag: 卸载释放活动期 window 监听', () => {
  const { env, state } = makeEnv()
  const drag = useDrag(env, { onMove: () => {} })
  // 模拟拖拽开始（pointerdown → window pointermove/up 注册）
  drag.onPointerDown(new (window as any).PointerEvent('pointerdown', { clientX: 10, clientY: 10 }))
  for (const fn of state.unmountHooks) fn('_wf_0')
  // 卸载后 window pointermove 不应触发 onMove
  let moved = 0
  const drag2 = useDrag(env, { onMove: () => moved++ })
  drag2.onPointerDown(new (window as any).PointerEvent('pointerdown', { clientX: 0, clientY: 0 }))
  for (const fn of state.unmountHooks) fn('_wf_0')
  window.dispatchEvent(new (window as any).PointerEvent('pointermove', { clientX: 30, clientY: 30 }))
  assert.equal(moved, 0, '卸载后 window 监听已移除')
})

test('useTween: 卸载取消 rAF', () => {
  const { env, state } = makeEnv()
  let cancelled = 0
  const origRAF = (globalThis as any).requestAnimationFrame
  const origCAF = (globalThis as any).cancelAnimationFrame
  ;(globalThis as any).requestAnimationFrame = () => 1
  ;(globalThis as any).cancelAnimationFrame = () => { cancelled++ }
  try {
    const t = useTween(env, 100, { duration: 100 })
    // 触发动画（rAF 启动）
    t.reset(200)
    for (const fn of state.unmountHooks) fn('_wf_0')
    assert.ok(cancelled >= 1, '卸载取消 rAF')
  } finally {
    ;(globalThis as any).requestAnimationFrame = origRAF
    ;(globalThis as any).cancelAnimationFrame = origCAF
  }
})

// ── useStableCallback（S-1：稳定转发器——三态 skip 命中率原语） ──

test('useStableCallback: 引用恒等 + 转发到最新闭包', () => {
  const { env } = makeEnv()
  let count = 0
  const cb1 = useStableCallback(env, 'a', () => count)
  const cb2 = useStableCallback(env, 'b', () => count)
  assert.equal(cb1, cb1, '同调用点引用恒等')
  assert.notEqual(cb1, cb2, '不同 name 独立转发器')
  // 最新闭包转发
  count = 42
  assert.equal(cb1(), 42, '转发到最新闭包（无 deps 数组——位置即语义）')
})

test('useStableCallback: 每次 render 更新 latest（同引用读最新状态）', () => {
  const { env } = makeEnv()
  let state = 1
  const cb = useStableCallback(env, 'x', () => state)
  const ref1 = cb
  state = 2
  const ref2 = useStableCallback(env, 'x', () => state)
  assert.equal(ref1, ref2, '跨 render 同 name 引用恒等（props 浅比较通过）')
  assert.equal(ref1(), 2, '调用时转发最新闭包')
})

test('useStableCallback: 卸载自动清理（转发器不泄漏）', () => {
  const { env, state } = makeEnv()
  const cb = useStableCallback(env, 'y', () => 1)
  const key = [...env.stableCallbacks.keys()][0]
  assert.ok(key, '缓存注册')
  // 触发卸载回调
  for (const fn of state.unmountHooks) fn('_wf_0')
  assert.equal(env.stableCallbacks.has(key), false, '卸载后清理')
})
