/**
 * 集群调度器（阶段 3）——基于事件流的容量视图 + 沙盒路由
 *
 * 事件驱动（非轮询）：宿主负载从事件流推导——
 * - host:register（容量声明：memoryMb/cpus）
 * - exec:start/end（活跃度：运行中 exec 数——exec:start 未配对的 = 活跃）
 * 路由：创建沙盒时选负载最低的宿主（容量约束——配额已有）
 *
 * 诚实裁剪：单机模式（HOST_ID='local'——唯一宿主）——路由恒选 local——
 * 决策事件记录（可观测）；多宿主远程执行（RPC）为阶段 4/后续。
 */

import { sandboxEvents, sandboxEmit } from './events.ts'
import { HOST_ID } from './host.ts'

export interface HostLoad {
  hostId: string
  /** 运行中 exec 数（exec:start 未配对 end——事件流推导） */
  activeExecs: number
  /** 最近 exec 事件时间（活跃度——越新越忙） */
  lastExecAt: number
  /** 容量（host:register 声明） */
  memoryMb: number
  cpus: number
  /** 权重负载（activeExecs + 时间衰减——简单模型） */
  load: number
}

/** 从事件流推导各宿主负载（非轮询——基于 sandbox 事件） */
export function clusterLoad(): HostLoad[] {
  const evs = sandboxEvents(2000)
  const hosts = new Map<string, HostLoad>()
  const getHost = (id: string): HostLoad => {
    let h = hosts.get(id)
    if (!h) {
      h = { hostId: id, activeExecs: 0, lastExecAt: 0, memoryMb: 0, cpus: 0, load: 0 }
      hosts.set(id, h)
    }
    return h
  }
  for (const e of evs) {
    const hostId = String(e.payload?.hostId ?? HOST_ID)
    const h = getHost(hostId)
    if (e.action === 'host:register') {
      const cap = (e.payload?.capacity ?? e.payload) as Record<string, unknown> | undefined
      h.memoryMb = Number(cap?.memoryMb ?? 0)
      h.cpus = Number(cap?.cpus ?? 1)
    } else if (e.action === 'exec:start') {
      h.activeExecs++
      h.lastExecAt = Math.max(h.lastExecAt, e.ts)
    } else if (e.action === 'exec:end' || e.action === 'exec:timeout' || e.action === 'exec:error') {
      h.activeExecs = Math.max(0, h.activeExecs - 1)
    }
  }
  for (const h of hosts.values()) {
    // 简单负载模型：活跃 exec 数（主）+ 最近活跃时间（次——30s 内活跃 +0.5）
    const recent = Date.now() - h.lastExecAt < 30_000 ? 0.5 : 0
    h.load = h.activeExecs + recent
  }
  if (!hosts.has(HOST_ID)) {
    const local = getHost(HOST_ID)
    local.memoryMb = Number(process.env.SANDBOX_POOL_BUDGET_MB ?? 0)
  }
  return [...hosts.values()]
}

/** 路由决策：选负载最低的宿主（单机恒 local——多宿主选最空闲） */
export function pickHost(): { hostId: string; candidates: HostLoad[] } {
  const loads = clusterLoad()
  const candidates = loads.length > 0 ? loads : [{ hostId: HOST_ID, activeExecs: 0, lastExecAt: 0, memoryMb: Number(process.env.SANDBOX_POOL_BUDGET_MB ?? 0), cpus: 1, load: 0 }]
  candidates.sort((a, b) => a.load - b.load || b.memoryMb - a.memoryMb)
  return { hostId: candidates[0].hostId, candidates }
}

/** 路由决策事件（沙盒创建时——可观测——调度器容量视图） */
export function emitRouteDecision(sandboxId: string, departmentId: string | null, memoryMb: number): void {
  const { hostId, candidates } = pickHost()
  sandboxEmit('route', sandboxId, {
    selectedHost: hostId,
    candidates: candidates.map((c) => ({ hostId: c.hostId, load: c.load, activeExecs: c.activeExecs })),
    departmentId,
    memoryMb,
    at: new Date().toISOString(),
  })
}
