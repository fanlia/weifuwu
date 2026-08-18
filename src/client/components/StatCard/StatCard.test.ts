import { describe, it, test } from 'node:test'
import assert from 'node:assert'
import { StatCard } from './StatCard.ts'
import { Icon } from '../Icon/Icon.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const f = findVNode(k, pred)
      if (f) return f
    }
  } else if (kids && typeof kids === 'object') return findVNode(kids, pred)
  return null
}

function createTestCtx(): WfuiContext {
  return { ui: {
    $: {}, render: () => {}, dirty: () => {}, ready: true,
    useReducedMotion: () => false,
    useTween: (target: number) => {
      const handle: any = { value: target, reset: (to: number) => { handle.value = to } }
      return handle
    },
  } } as any
}

describe('StatCard', () => {
  it('renders label and value', async () => {
    const vnode = await renderVNode(StatCard, { label: '用户数', value: 128 }, createTestCtx())!
    assert.match(vnode.props.class, /wf-stat/)
    const valueEl = vnode.props.children[0]
    const labelEl = vnode.props.children[1]
    assert.equal(valueEl.props.children, '128')
    assert.equal(labelEl.props.children, '用户数')
  })

  it('renders icon when provided', async () => {
    const vnode = await renderVNode(StatCard, { label: '收入', value: '¥899', icon: '💰' }, createTestCtx())!
    const icon = vnode.props.children[0]
    assert.equal(icon.props.class, 'wf-stat-icon')
    assert.equal(icon.props.children, '💰')
  })

  it('renders up trend', async () => {
    const vnode = await renderVNode(StatCard, { label: '用户', value: '100', trend: 'up', trendLabel: '12%' }, createTestCtx())!
    const trend = vnode.props.children[vnode.props.children.length - 1]
    assert.match(trend.props.class, /wf-stat-trend--up/)
    const arrow = trend.props.children[0]
    assert.equal(arrow.props.children.type, Icon, 'up 趋势应渲染箭头图标')
  })

  it('renders down trend', async () => {
    const vnode = await renderVNode(StatCard, { label: '用户', value: '100', trend: 'down' }, createTestCtx())!
    const trend = vnode.props.children[vnode.props.children.length - 1]
    assert.match(trend.props.class, /wf-stat-trend--down/)
  })

  it('animate + reduced-motion：直接渲染终值', async () => {
    const orig = globalThis.matchMedia
    globalThis.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as any
    try {
      const vnode = await renderVNode(StatCard, { label: 'x', value: 42, animate: true }, createTestCtx())!
      const valueEl = vnode.props.children[0]
      assert.equal(valueEl.props.children, '42', 'reduced-motion 直落终值')
      assert.match(valueEl.props.class, /wf-nums/, '数值用 tabular-nums')
    } finally {
      globalThis.matchMedia = orig
    }
  })

  it('非 animate 时字符串值原样渲染', async () => {
    const vnode = await renderVNode(StatCard, { label: 'x', value: '1.2k' }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.children, '1.2k')
  })

  it('可点击 StatCard：Enter/Space 触发 onClick（键盘可达）', async () => {
    let clicks = 0
    const vnode = await renderVNode(StatCard, { label: 'x', value: 1, onClick: () => clicks++ }, createTestCtx())!
    assert.equal(vnode.props.role, 'button')
    assert.match(vnode.props.class, /wf-elevate/)
    vnode.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.equal(clicks, 1)
  })

  it('animate：动画步进中的 render 不重启动画（值必须收敛到目标，不冻结在低档）', async () => {
    // 回归：Dashboard 等页面实测动画冻结在 4/0/0/8（应为 8/4/4/12）——
    // 每个 step 调 ctx.ui.render() → 组件重渲染 → 旧实现每次重渲染都重启动画
    // （新 t0 + cancel 待调度帧），eased 进度永远只前进 ~11.5%/帧 → Math.round 平台期。
    const rafCallbacks: Array<(t: number) => void> = []
    const origRaf = globalThis.requestAnimationFrame
    const origCaf = globalThis.cancelAnimationFrame
    const origPerf = performance.now
    let now = 0
    globalThis.requestAnimationFrame = ((cb: any) => {
      rafCallbacks.push(cb)
      return rafCallbacks.length
    }) as any
    globalThis.cancelAnimationFrame = ((id: number) => { rafCallbacks[id - 1] = undefined as any }) as any
    performance.now = (() => now) as any
    try {
      // mock useTween：精确复刻真实现（幂等 reset + rAF 步进 + easeOutCubic）——
      // 测试验证组件在 render 重渲染风暴下动画收敛（组件+原语协作）
      const ctx: any = {
        ui: {
          $: {}, dirty: () => {},
          useReducedMotion: () => false,
          useTween: (target: number) => {
            const duration = 400
            let rafId: number | undefined
            let currentTarget = target
            const handle: any = { value: target }
            handle.reset = (to: number) => {
              if (to === currentTarget && rafId) return
              currentTarget = to
              if (to === handle.value) return
              if (rafId) cancelAnimationFrame(rafId)
              const from = handle.value
              const t0 = performance.now()
              const step = (t: number) => {
                const p = Math.min(1, (t - t0) / duration)
                handle.value = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)))
                if (p < 1) rafId = requestAnimationFrame(step)
                else rafId = undefined
              }
              rafId = requestAnimationFrame(step)
            }
            return handle
          },
        },
      }
      let renderFn: (p: any) => any
      renderFn = await StatCard({ label: 'x', value: 0, animate: true }, ctx)

      // 首帧（无数据）：value=0
      await renderFn({ label: 'x', value: 0, animate: true })
      assert.equal(rafCallbacks.length, 0, 'value=0 不启动动画')

      // 数据到达：value=8 → 启动动画（调度一个 rAF）
      now = 1000
      await renderFn({ label: 'x', value: 8, animate: true })
      assert.equal(rafCallbacks.length, 1, '动画启动时调度一个 rAF')

      // 真实链路：step 内 ctx.ui.render() 会同步重渲染组件（同 props）
      ctx.ui.render = async () => { await renderFn({ label: 'x', value: 8, animate: true }) }

      // 模拟 60 帧（960ms > 400ms 动画时长）
      for (let i = 0; i < 60; i++) {
        now += 16
        const cb = rafCallbacks.shift()
        if (cb) cb(now)
      }

      const vnode = await renderFn({ label: 'x', value: 8, animate: true })
      const valueEl = vnode.props.children[0]
      assert.equal(valueEl.props.children, '8', '动画结束后值必须收敛到目标（不冻结在 4）')
    } finally {
      globalThis.requestAnimationFrame = origRaf
      globalThis.cancelAnimationFrame = origCaf
      performance.now = origPerf
    }
  })
})

test('countdown 模式：显示剩余 MM:SS 格式', async () => {
  const ctx = createTestCtx()
  ctx.ui.useTween = () => ({ value: 0, reset: () => {} })
  const future = Date.now() + 95 * 1000 // 95s → 01:35
  const factory = await StatCard({}, ctx)
  const vnode = await factory({ label: '超时', countdown: future })
  const val = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-stat-value'))
  assert.equal(val.props.children, '01:35', '倒计时格式化 MM:SS')
  factory({ label: '超时' }) // 清理定时器（测试不卸载）
})

test('countdown 结束 → onFinish 回调 + 定时器清理', async () => {
  const ctx = createTestCtx()
  ctx.ui.useTween = () => ({ value: 0, reset: () => {} })
  let finished = 0
  const past = Date.now() - 1000 // 已过时 → 0
  const factory = await StatCard({}, ctx)
  const vnode = await factory({ label: 'x', countdown: past, onFinish: () => finished++ })
  assert.equal(finished, 0, 'render 期不直接触发 onFinish')
  const val = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-stat-value'))
  assert.equal(val.props.children, '00:00', '已过时显示 00:00')
  factory({ label: 'x' }) // 清理定时器
})

test('countdown 模式 value 可选；无 value 不渲染 undefined', async () => {
  const ctx = createTestCtx()
  ctx.ui.useTween = () => ({ value: 0, reset: () => {} })
  const factory = await StatCard({}, ctx)
  // countdown 模式无需 value
  const v1 = await factory({ label: 'x', countdown: Date.now() + 60_000 })
  assert.ok(findVNode(v1, (v: any) => v.props?.class?.includes('wf-stat-value')))
  factory({ label: 'x' }) // 清理
  // 无 value 无 countdown：空串而非 'undefined'
  const v2 = await factory({ label: 'x' })
  const val = findVNode(v2, (v: any) => v.props?.class?.includes('wf-stat-value'))
  assert.notEqual(val.props.children, 'undefined')
  assert.equal(val.props.children, '')
})
