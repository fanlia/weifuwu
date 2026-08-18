/**
 * services/hook-env — HookEnv 实现（引擎无关——vdom4 端口化 UI-3）
 *
 * 共享表（媒体查询/popup tracker/输入态/打开态——跨组件）与语义 id 服务
 * （render(['id']) 跨组件精准渲染——vdom2 能力补全）的宿主。
 * 引擎（engines/）经 createHookEnv 注入 compId/scheduleRender/卸载清理——
 * hooks 只消费 contracts/hooks.ts 的接口——v5 换引擎本模块零改动。
 */

import type { HookEnv, MediaRegistryItem, PopupTracker, ScrollTracker } from '../contracts/hooks.ts'
import { createClientBrowser } from '../browser.ts'
import { createPopupTrackerSystem } from '../popup-tracker.ts'

// ── 跨组件共享表（hooks 契约——模块级——vdom2 时代同构） ──
const mediaRegistry = new Map<string, MediaRegistryItem>()
const warned = new Set<string>()
const uncontrolledValues = new Map<string, unknown>()
const inputStates = new Map<string, { keyword: string; selectedLabel: string }>()
const openStates = new Map<string, boolean>()

// ── 语义 id 服务（跨组件精准渲染——render(['id'])——UI-3 补全 vdom3 缺失能力） ──
const semanticIds = new Map<string, string>()     // 语义 id → compId（selfId 注册）
const compRenders = new Map<string, () => void>() // compId → 组件级渲染调度（引擎注入）

/** 组件级渲染调度注册（引擎 createHookEnv 时注入——卸载自动注销） */
export function registerCompRender(compId: string, fn: () => void): void {
  compRenders.set(compId, fn)
}
export function unregisterCompRender(compId: string): void {
  compRenders.delete(compId)
  for (const [name, id] of [...semanticIds]) if (id === compId) semanticIds.delete(name)
}

/** 跨组件精准渲染（render(['id'])——语义 id → compId → 组件级调度——未注册 id 静默跳过） */
export function renderSemanticIds(ids: string[]): void {
  for (const name of ids) {
    const compId = semanticIds.get(name)
    if (compId) compRenders.get(compId)?.()
  }
}

/** 测试隔离（跨测试残留——semanticIds/compRenders 清空） */
export function resetSemanticService(): void {
  semanticIds.clear()
  compRenders.clear()
}

/** 语义 id 注册（selfId——冲突明确抛错——防错位静默） */
export function registerSemanticId(name: string, compId: string): void {
  const prev = semanticIds.get(name)
  if (prev && prev !== compId) {
    throw new Error(`[ui-dom] 语义化 ID 冲突：'${name}' 已注册（compId ${prev} vs ${compId}）——selfId 必须全局唯一`)
  }
  semanticIds.set(name, compId)
}

// ── 弹层/滚动跟踪系统（rAF 节流 + 重算后精准刷新目标组件） ──
const trackerSystem = createPopupTrackerSystem((ids) => {
  for (const id of ids) compRenders.get(id)?.()
})

/** 创建 HookEnv（引擎注入调度能力——组件实例级） */
export function createHookEnv(
  compId: string,
  scheduleRender: () => void,
  onUnmountCb: (fn: () => void) => void,
): HookEnv {
  registerCompRender(compId, scheduleRender)
  return {
    compId,
    scheduleRender,
    onUnmount: (fn) => {
      onUnmountCb(() => { try { fn() } catch { /* 清理失败隔离 */ } unregisterCompRender(compId) })
      return () => { /* 退订由卸载钩子管理 */ }
    },
    registerSemanticId: (name: string) => registerSemanticId(name, compId),
    browser: createClientBrowser(),
    mediaRegistry,
    popupTrackers: trackerSystem.popupTrackers as Map<string, PopupTracker>,
    scrollTrackers: trackerSystem.scrollTrackers as Map<string, ScrollTracker>,
    warned,
    uncontrolledValues,
    inputStates,
    openStates,
    ensurePopupListeners: trackerSystem.ensurePopupListeners,
  }
}
