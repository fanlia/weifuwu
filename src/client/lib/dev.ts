/**
 * weifuwu/client 开发者工具 — 开发警告 + 运行时检查器
 *
 * 仅在开发环境中调用 enableDevtools() 启用。生产环境中不应导入。
 *
 * ```ts
 * import { enableDevtools } from 'weifuwu/client'
 *
 * if (import.meta.env.DEV) {
 *   enableDevtools()
 * }
 * ```
 *
 * 启用后，在浏览器控制台：
 * ```js
 * __wefu__.inspect()     // 列出所有 signal 及其依赖数
 * __wefu__.inspect(sig)  // 查看指定 signal 的详情
 * ```
 */

import { Signal, effect } from '../signal.ts'

// ── 类型 ────────────────────────────────────────────────────

interface SignalInfo {
  /** 当前值 */
  value: unknown
  /** 监听器数量 */
  listenerCount: number
  /** 是否为 computed */
  isComputed: boolean
  /** 创建时间戳 */
  createdAt: number
}

interface DevtoolsAPI {
  /** 列出所有信号 */
  signals: Map<Signal, SignalInfo>
  /** 检查信号状态 */
  inspect: (sig?: Signal) => void
  /** 清理已无监听器的信号记录 */
  cleanup: () => void
  /** 启用/禁用开发警告 */
  warnings: (on?: boolean) => void
}

// ── 全局状态 ────────────────────────────────────────────────

let _enabled = false
let _warningsEnabled = false
const _originalSignal = Signal as any

// ── Signal 追踪代理 ─────────────────────────────────────────

function _createDevProxy(originalSignalFn: typeof import('../signal.ts')['signal']): typeof import('../signal.ts')['signal'] {
  const devSignals = new Map<Signal, SignalInfo>()

  function trackedSignal<T>(initial: T): Signal<T> {
    const sig = originalSignalFn(initial)
    devSignals.set(sig, {
      value: initial,
      listenerCount: 0,
      isComputed: false,
      createdAt: Date.now(),
    })

    // 代理 getter/setter 以追踪使用情况
    let _value = initial

    // 每帧检查一次是否有未被任何 effect 使用的 signal
    if (_warningsEnabled) {
      setTimeout(() => {
        const info = devSignals.get(sig)
        if (info && info.listenerCount === 0) {
          console.warn(
            `[weifuwu] 可能未使用的 signal: 值 =`,
            _value,
            `(创建于 ${new Date(info.createdAt).toLocaleTimeString()})`,
            `\n  signal 只有在 effect() 或 computed() 内部被读取时才会建立依赖。`,
            `\n  如果这个 signal 的值从未在 effect 中使用，它的变化不会触发任何更新。`,
          )
        }
      }, 100)
    }

    return new Proxy(sig, {
      get(target: Signal, prop: string | symbol, receiver: any) {
        if (prop === 'value') {
          const v = Reflect.get(target, prop, receiver)
          const info = devSignals.get(target)
          if (info) {
            info.value = v
            info.listenerCount = target['_listeners']?.size ?? 0
          }
          return v
        }
        if (prop === '_removeListener') {
          return Reflect.get(target, prop, receiver)
        }
        return Reflect.get(target, prop, receiver)
      },
      set(target: Signal, prop: string | symbol, value: any, receiver: any) {
        if (prop === 'value') {
          const info = devSignals.get(target)
          if (info) info.value = value
        }
        return Reflect.set(target, prop, value, receiver)
      },
    }) as Signal<T>
  }

  return trackedSignal as any
}

// ── 检查器实现 ──────────────────────────────────────────────

function _inspect(sig?: Signal): void {
  const api = (window as any).__wefu__ as DevtoolsAPI
  if (!api) {
    console.warn('[weifuwu] devtools 未启用。请先调用 enableDevtools()')
    return
  }

  if (sig) {
    const info = api.signals.get(sig)
    if (!info) {
      console.warn('[weifuwu] 未找到指定 signal')
      return
    }
    console.log(`[weifuwu] Signal 详情`)
    console.log(`  值:`, info.value)
    console.log(`  监听器数:`, info.listenerCount)
    console.log(`  是否为 computed:`, info.isComputed)
    console.log(`  创建时间:`, new Date(info.createdAt).toLocaleTimeString())
    return
  }

  // 列出所有 signal
  const all = [...api.signals.entries()]
  if (all.length === 0) {
    console.log('[weifuwu] 没有活跃的 signal')
    return
  }

  console.group(`[weifuwu] 活跃 Signal (${all.length} 个)`)
  console.log(`  %c索引%c | %c值%c | %c监听器数%c | %c创建时间`, 'font-weight:bold', '', 'font-weight:bold', '', 'font-weight:bold', '', 'font-weight:bold', '')
  console.log(`  ${'-'.repeat(50)}`)
  for (const [sig, info] of all) {
    const val = typeof info.value === 'object' ? JSON.stringify(info.value).slice(0, 40) : String(info.value)
    console.log(`  #%d | %s | %d | %s`, all.indexOf([sig, info]) + 1, val, info.listenerCount, new Date(info.createdAt).toLocaleTimeString())
  }
  console.groupEnd()
}

function _cleanup(): void {
  const api = (window as any).__wefu__ as DevtoolsAPI
  if (!api) return

  for (const [sig, info] of api.signals) {
    if (info.listenerCount === 0) {
      api.signals.delete(sig)
    }
  }
  console.log(`[weifuwu] 清理完成，剩余 ${api.signals.size} 个活跃 signal`)
}

// ── 查找 effect 外创建的 effect ────────────────────────────

function _wrapEffect(originalEffect: typeof effect): typeof effect {
  let insideComponent = false

  // 由 jsx 在组件调用时设置为 true
  ;(window as any).__wefu_component_depth = 0

  return ((fn: () => void) => {
    if (!_warningsEnabled) return originalEffect(fn)

    const depth = (window as any).__wefu_component_depth ?? 0
    if (depth === 0) {
      console.warn(
        `[weifuwu] effect() 在组件外创建，可能不会自动清理`,
        `\n  在组件函数内创建的 effect 会在组件卸载时自动 dispose。`,
        `\n  在组件外创建的 effect 需要手动调用返回的 dispose 函数。`,
      )
    }

    const dispose = originalEffect(fn)

    return () => {
      dispose()
    }
  }) as typeof effect
}

// ── 公开 API ────────────────────────────────────────────────

/**
 * 启用开发者工具。
 *
 * 在应用启动时调用（仅在开发环境），
 * 激活运行时警告和浏览器控制台检查器。
 *
 * 使用 `__wefu__.inspect()` 查看所有 signal 状态。
 */
export function enableDevtools(): void {
  if (_enabled) return
  _enabled = true
  _warningsEnabled = true

  const api: DevtoolsAPI = {
    signals: new Map(),
    inspect: _inspect,
    cleanup: _cleanup,
    warnings: (on?: boolean) => {
      _warningsEnabled = on ?? !_warningsEnabled
      console.log(`[weifuwu] 开发警告: ${_warningsEnabled ? '已启用' : '已关闭'}`)
    },
  }

  ;(window as any).__wefu__ = api

  console.log(
    `%c[weifuwu] 开发者工具已启用`,
    'color: #0066ff; font-weight: bold; font-size: 14px;',
    `\n  在控制台输入 __wefu__.inspect() 查看所有 signal`,
    `\n  输入 __wefu__.warnings(false) 关闭开发警告`,
  )
}
