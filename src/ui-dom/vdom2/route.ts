/**
 * vdom2 route — 路由生命周期状态机（2026-12，design/vdom-lifecycle-state-machines.md Phase 1）
 *
 * 四状态机架构的第一层（页面级·宏观）：导航状态统一管理——
 * idle → navigating（旧树卸载/新树构建中）→ settled（新树就绪）。
 *
 * 与节点状态机（lifecycle.ts）的协同：NAVIGATE_START 触发旧树 DISPOSE + 新树 BUILD；
 * NAVIGATE_DONE 表示整条链路（build → diff → render）完成。
 *
 * 统一架构模式：状态 + 事件 + 转换表 + 查表分派（无 if/else 分派链）。
 */

import { trace, traceEnabled } from './trace.ts'

/** 路由生命周期状态 */
export type RouteLifecycle = 'idle' | 'navigating' | 'settled'

/** 路由事件（导航触发点） */
export type RouteEvent = 'NAVIGATE_START' | 'NAVIGATE_DONE' | 'NAVIGATE_ERROR'

/** 转换表（状态 × 事件 → 下一状态）——非法转换保留原状态 + trace warn */
const ROUTE_TRANSITIONS: Record<RouteLifecycle, Partial<Record<RouteEvent, RouteLifecycle>>> = {
  idle:       { NAVIGATE_START: 'navigating' },
  navigating: { NAVIGATE_DONE: 'settled', NAVIGATE_ERROR: 'idle' },
  settled:    { NAVIGATE_START: 'navigating' },
}

/** 路由生命周期协调器（每 app 实例一个——serve.ts 接入） */
export interface RouteController {
  state: RouteLifecycle
  /** 导航开始（renderPath 入口）：旧树卸载 + 新树构建起点 */
  navigateStart(path: string): void
  /** 导航完成（build + diff + render 全部落地） */
  navigateDone(path: string): void
  /** 导航失败（router.execute 抛错——回退 idle） */
  navigateError(path: string, err: unknown): void
}

/** 创建路由生命周期协调器（查表分派——非法转换 trace warn 不静默） */
export function createRouteController(): RouteController {
  let state: RouteLifecycle = 'idle'
  const fire = (event: RouteEvent, path?: string): RouteLifecycle => {
    const next = ROUTE_TRANSITIONS[state]?.[event] ?? null
    if (next == null) {
      if (traceEnabled('route', 'debug')) {
        trace('route', 'debug', '', `illegal route transition ${state} --${event}--> ? path=${path ?? '-'}`)
      }
      return state
    }
    if (traceEnabled('route', 'debug')) {
      trace('route', 'debug', '', `${state} --${event}--> ${next} path=${path ?? '-'}`)
    }
    state = next
    return next
  }
  return {
    get state() { return state },
    navigateStart: (path) => { fire('NAVIGATE_START', path) },
    navigateDone: (path) => { fire('NAVIGATE_DONE', path) },
    navigateError: (path, err) => { fire('NAVIGATE_ERROR', path) },
  }
}

/** 重置（测试/清理用） */
export function __resetRouteState(): void {
  // route 状态在协调器实例内——模块级无状态
}
