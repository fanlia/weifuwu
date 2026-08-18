/**
 * weifuwu/ui-dom — 渲染管线调试工具（__UI_DEBUG 开关，默认全关——零开销）
 *
 * 用途：定位渲染循环/死循环——所有渲染管线入口打日志（带递归深度），
 * 卡死时最后一条日志 = 递归点。节流：每个 label 前 N 次 + 每 100 次。
 *
 * 开关（任一开启即生效）：
 *   - localStorage.__UI_DEBUG = '1'（浏览器 eval 设置）
 *   - globalThis.__UI_DEBUG = true
 *   - process.env.UI_DEBUG（Node/SSR）
 */

let _enabled: boolean | null = null
export function uiDebugEnabled(): boolean {
  if (_enabled !== null) return _enabled
  _enabled =
    (typeof process !== 'undefined' && process.env?.UI_DEBUG === '1') ||
    (globalThis as any).__UI_DEBUG === true ||
    (typeof localStorage !== 'undefined' && localStorage.getItem('__UI_DEBUG') === '1')
  return _enabled
}

/** 手动开关（测试用） */
export function setUiDebug(v: boolean): void {
  _enabled = v
}

/** 渲染管线递归深度（renderValue 进入 +1 / 退出 -1）——卡死时最后深度定位递归点 */
let _depth = 0
export function pushDepth(): number {
  return ++_depth
}
export function popDepth(): number {
  return --_depth
}
export function currentDepth(): number {
  return _depth
}

const counters = new Map<string, number>()
export function uiLog(label: string, msg: string, opts?: { depth?: number; throttle?: number }): void {
  if (!uiDebugEnabled()) return
  const n = (counters.get(label) ?? 0) + 1
  counters.set(label, n)
  const first = 10 // 前 10 次
  const every = opts?.throttle ?? 100 // 之后每 100 次
  if (n > first && n % every !== 0) return
  const d = opts?.depth !== undefined ? opts.depth : _depth
  const indent = '  '.repeat(Math.min(d, 30))
  // eslint-disable-next-line no-console
  console.log(`[ui-debug] ${indent}${label}#${n} ${msg}`)
}
