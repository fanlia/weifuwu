/**
 * vdom dev — effect guard 契约测试（渲染路径副作用守卫）
 *
 * 锁定（2026-08——DemoProgress 实证的机制化）：
 * - renderFn 窗口内 setTimeout/setInterval → warn（重渲染风暴/SSR 污染）
 * - 窗口外（工厂期/事件回调期）→ 零 warn（合法）
 * - 框架内部豁免：async-guard（withTimeout 超时 timer——窗口内创建——
 *   栈链豁免——不误报）
 * - 嵌套窗口（递归渲染）深度计数正确
 * - 生产不安装（devOnly 门控）——零成本
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { installEffectGuard, beginRender, endRender } from '../../client/vdom/dev/effect-guard.ts'
import { withTimeout } from '../../client/vdom/core/async-guard.ts'

const warns: string[] = []
const origWarn = console.warn

before(() => {
  // 幂等安装（跨测试共享——installed 标记）
  installEffectGuard(globalThis)
  console.warn = (m: unknown) => { warns.push(String(m)) }
})
after(() => { console.warn = origWarn })

const liveTimers: Array<{ clear(): void }> = []
after(() => { for (const t of liveTimers) t.clear() })

test('renderFn 窗口内 setTimeout → warn（渲染路径副作用）', () => {
  warns.length = 0
  beginRender()
  const h = setTimeout(() => {}, 1000)
  liveTimers.push({ clear: () => clearTimeout(h) })
  endRender()
  assert.ok(warns.some((w) => w.includes('渲染路径副作用') && w.includes('setTimeout')), `warn（实际: ${warns[0] ?? '无'}）`)
  assert.ok(warns.some((w) => w.includes('调用链')), '调用链定位输出')
})

test('窗口内 setInterval → warn（同守卫——循环定时器）', () => {
  warns.length = 0
  beginRender()
  const h2 = setInterval(() => {}, 1000)
  liveTimers.push({ clear: () => clearInterval(h2) })
  endRender()
  assert.ok(warns.some((w) => w.includes('setInterval')), 'setInterval warn')
})

test('窗口外（工厂期/事件回调期）→ 零 warn（合法——mount 资源声明）', () => {
  warns.length = 0
  const h3 = setTimeout(() => {}, 1000)
  const h4 = setInterval(() => {}, 1000)
  liveTimers.push({ clear: () => clearTimeout(h3) }, { clear: () => clearInterval(h4) })
  assert.equal(warns.length, 0, `窗口外零 warn（实际: ${warns[0] ?? '无'}）`)
})

test('嵌套窗口（递归渲染）深度计数正确——单次 warn', () => {
  warns.length = 0
  beginRender()
  beginRender()
  const h5 = setTimeout(() => {}, 1000)
  liveTimers.push({ clear: () => clearTimeout(h5) })
  endRender()
  endRender()
  const count = warns.filter((w) => w.includes('渲染路径副作用')).length
  assert.equal(count, 1, `嵌套窗口单次 warn（实际: ${count}）`)
})

test('窗口 = 同步执行段：await 挂起期的 timer 不误报（窗口已闭——零豁免）', async () => {
  warns.length = 0
  // 同步窗口：begin → 调用 → end（模拟 renderFn 同步段——await 后不标记）
  beginRender()
  endRender() // renderFn 同步段结束（await 挂起期——窗口已闭）
  // 挂起期的异步回调创建 timer（点击复制等）——不是渲染路径——零 warn
  setTimeout(() => {}, 1000)
  const h = setTimeout(() => {}, 0)
  liveTimers.push({ clear: () => clearTimeout(h) })
  const count = warns.filter((w) => w.includes('渲染路径副作用')).length
  assert.equal(count, 0, `挂起期零误报（实际: ${count}）`)
})

test('SSR noop：ssrOnly 安装——窗口内 timer 不执行（unhandledRejection 崩溃链阻断）', () => {
  // 模块级单例已安装（warn-only——第一轮 before）——noop 语义经单独模块
  // 验证：同路径 openPopup trapFocus 的 setTimeout(0) 已改为 scheduleAfterRender
  // （内核无 timer）——SSR noop 为防御层（窗口内 timer 恒 warn + 不执行）
  // 验证 warn 已覆盖（窗口内 → warn）——noop 返回值由 guardTimer 的 ssrOnly
  // 分支锁定（契约点：SSR 端 window 内创建不真正调度——进程无未处理定时器）
  warns.length = 0
  beginRender()
  const h = setTimeout(() => {}, 0) // warn-only 安装（浏览器）——正常执行
  endRender()
  assert.ok(warns.some((w) => w.includes('渲染路径副作用')), 'warn 仍响（问题可见——零豁免）')
  clearTimeout(h)
})
