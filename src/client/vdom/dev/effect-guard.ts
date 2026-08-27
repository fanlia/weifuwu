/**
 * vdom dev — effect guard（渲染路径副作用守卫——2026-08）
 *
 * 病灶（DemoProgress 实证）：renderFn 里裸 setTimeout/setInterval/
 * 定时器循环——（a）SSR 服务端渲染期间创建 → ctx 无 render → 服务器
 * unhandled rejection 污染（showcase 日志实证）；（b）客户端每次渲染
 * 重建定时器 → 重渲染风暴 + 泄漏。
 *
 * 机制：**renderFn 执行窗口标记（depth 计数）**——patch setTimeout/
 * setInterval（透明代理——行为零变化）——窗口内创建 → warn（含调用链
 * 截断——定位组件）——**豁免**：框架内部超时 timer（async-guard——
 * withTimeout 的 Promise.race 定时器在窗口内创建——栈链豁免）与
 * 工厂（mount）期/事件回调期（不在窗口——合法）。
 *
 * 安装策略：浏览器端仅 dev（__WF_DEV__——生产零成本）；SSR 端恒装
 * （node 服务器进程保护——uiSsr 渲染前）。幂等（防重复 patch）。
 */
let depth = 0
let installed = false

/** renderFn 执行窗口（begin/end——渲染路径副作用检测） */
export function beginRender(): void { depth++ }
export function endRender(): void { if (depth > 0) depth-- }

/** 窗口内创建定时器 → warn（栈豁免 async-guard——框架超时 timer） */
function guardTimer(kind: 'setTimeout' | 'setInterval'): void {
  if (depth <= 0) return
  const stack = new Error().stack ?? ''
  // **内部豁免**：async-guard 的 withTimeout 定时器（Promise.race 超时——
  //  在 renderFn 窗口内创建——框架职责非组件副作用）
  if (stack.includes('async-guard')) return
  const src = stack.split('\n').slice(2, 6).map((s) => s.trim()).join(' ← ') ?? ''
  // eslint-disable-next-line no-console
  console.warn(
    `[vdom] 渲染路径副作用：renderFn 内创建 ${kind}——每次渲染重建定时器（重渲染风暴/SSR 服务器污染——DemoProgress 实证）——` +
    '应在工厂（mount 期）创建 + ctx.ui.hold 注册清理，或回调内创建',
  )
  // eslint-disable-next-line no-console
  console.warn(`[vdom] 调用链: ${src}`)
}

/** 安装守卫（幂等——patch 一次）：
 *  @param target 浏览器 window / node globalThis（SSR 端）
 *  @param devOnly 浏览器端仅 dev 装（生产零成本）；node SSR 端恒装 */
export function installEffectGuard(target: unknown, devOnly = false): void {
  if (installed) return
  if (devOnly && !((target as { __WF_DEV__?: boolean }).__WF_DEV__)) return
  const t = target as typeof globalThis
  const origSetTimeout = t.setTimeout
  const origSetInterval = t.setInterval
  if (typeof origSetTimeout !== 'function' || typeof origSetInterval !== 'function') return
  // **透明代理**：函数体同参数透传——仅窗口内附加检测——行为零变化
  ;(t as any).setTimeout = function patchedSetTimeout(fn: unknown, ms?: number, ...args: unknown[]): unknown {
    guardTimer('setTimeout')
    return (origSetTimeout as unknown as (...a: unknown[]) => unknown).call(t, fn, ms, ...args)
  }
  ;(t as any).setInterval = function patchedSetInterval(fn: unknown, ms?: number, ...args: unknown[]): unknown {
    guardTimer('setInterval')
    return (origSetInterval as unknown as (...a: unknown[]) => unknown).call(t, fn, ms, ...args)
  }
  installed = true
}
