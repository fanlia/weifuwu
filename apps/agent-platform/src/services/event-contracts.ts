/**
 * 三端事件契约——中央订阅器（vdom + ai + sandbox 事件的响应式协作）
 *
 * 事件契约：明确"事件 → 动作"（注册表——动作集中——不是松散监听）——
 * 精密配合的基础：AI 工具决策 → 沙盒预热；exec 超时 → 跨层标注；
 * 排队过长 → 调度提示。
 *
 * 订阅来源：ai 事件流（aiEmit）+ sandbox 事件流（sandboxEmit）——
 * 中央订阅（emit 同步）→ 匹配契约 → 执行动作（fire-and-forget——不阻断）。
 */

import { subscribeAiEvents, type AiEvent } from './ai-events.ts'
import { subscribeSandboxEvents, type SandboxEvent } from '../sandbox/events.ts'
import { sandboxEmit } from '../sandbox/events.ts'

export type ContractEvent = AiEvent | SandboxEvent

type ContractHandler = (e: ContractEvent) => void

interface Contract {
  entity: string
  action: string
  predicate?: (payload: Record<string, unknown>) => boolean
  handler: ContractHandler
  once?: boolean
}

const contracts: Contract[] = []
let subscribed = false
let unsub: (() => void) | null = null

/** 注册事件契约（entity + action + 可选谓词 + 动作） */
export function onEvent(entity: string, action: string, handler: ContractHandler, opts?: { predicate?: (payload: Record<string, unknown>) => boolean; once?: boolean }): void {
  contracts.push({ entity, action, handler, predicate: opts?.predicate, once: opts?.once })
}

/** 启动中央订阅（ai + sandbox 事件流——emit 同步——幂等） */
export function startEventContracts(): () => void {
  if (subscribed && unsub) return unsub
  subscribed = true
  const match = (e: ContractEvent): void => {
    for (let i = 0; i < contracts.length; i++) {
      const c = contracts[i]
      if (c.entity !== e.entity || c.action !== e.action) continue
      if (c.predicate && !c.predicate(e.payload ?? {})) continue
      try { c.handler(e) } catch { /* 契约动作失败不阻断 */ }
      if (c.once) contracts.splice(i, 1)
    }
  }
  const unsubAi = subscribeAiEvents(match)
  const unsubSb = subscribeSandboxEvents(match)
  unsub = () => { unsubAi(); unsubSb(); subscribed = false; unsub = null }
  return unsub
}

/** 测试隔离（清空契约） */
export function resetContracts(): void {
  contracts.length = 0
  subscribed = false
  unsub = null
}

/** ── 内置契约（精密配合——事件驱动的响应式协作） ── */

/**
 * 契约 1：AI 浏览器工具调用 → 沙盒预热（tool:call agent-browser——提前 ensure——
 * 不等 exec 才启动容器——浏览器任务冷启动成本提前）
 * 注意：预热是提示性（sandbox:warm 事件）——实际 ensure 由 exec 路径保证——
 * 这里记录决策（可观测——后续可接真正的预热池）
 */
export function registerBrowserWarmContract(): void {
  onEvent('ai', 'tool:call', (e) => {
    const tool = String(e.payload?.tool ?? e.payload?.name ?? '')
    if (!tool.includes('agent-browser') && !tool.includes('browser')) return
    const deptId = e.payload?.departmentId ? String(e.payload.departmentId) : undefined
    // 预热信号（sandbox 事件流——浏览器任务即将执行——容器应就绪）
    sandboxEmit('warm:hint', undefined, {
      requestId: e.payload?.requestId ?? undefined,
      departmentId: deptId,
      tool,
      source: 'ai:tool:call',
    })
  })
}

/**
 * 契约 2：sandbox exec 超时 → 跨层标注（事件链可查——requestId 关联——
 * AI 层/前端可回溯"这个超时属于哪次任务"）
 */
export function registerExecTimeoutContract(): void {
  onEvent('sandbox', 'exec:timeout', (e) => {
    // 标注动作（记录——事件链已含 requestId/ms——此处仅结构化提示）
    console.warn(`[events] sandbox exec 超时（${e.payload?.tool ?? '?'}——${e.payload?.ms ?? '?'}ms）——requestId ${e.payload?.requestId ?? '?'}——跨层可回溯`)
  })
}
