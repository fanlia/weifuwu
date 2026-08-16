/**
 * Sandbox 宿主抽象（集群化阶段 1）——执行器接口 + 宿主身份
 *
 * 集群化基础：manager（中心控制面）依赖 SandboxHost 接口——本地实现
 * （DockerSandbox——现状）与远程实现（sandbox-host 进程——RPC——后续阶段）
 * 可替换。宿主身份 hostId 标注所有 sandbox 事件（跨宿主聚合/路由/审计）。
 */

import type { ExecResult, SandboxSpec, SandboxStatus } from './docker.ts'

/** 宿主执行器接口（集群化——中心依赖此接口——本地/远程可替换） */
export interface SandboxHost {
  readonly hostId: string
  readonly execStats: { execCount: number; execTimeouts: number; execErrors: number }
  readonly runningExecs: Map<string, { tool: string; startedAt: number; timeoutMs: number }>
  onExecEvent: ((sandboxId: string, type: string, detail?: string) => void) | null

  probe(): Promise<{ dockerOk: boolean; imageOk: boolean }>
  ensureImage(): Promise<boolean>
  ensure(sandboxId: string, spec: SandboxSpec): Promise<boolean>
  dispose(sandboxId: string): Promise<void>
  runOnce(sandboxId: string, spec: SandboxSpec, tool: string, args: Record<string, unknown>, opts?: { execTimeoutMs?: number }): Promise<ExecResult>
  runTool(sandboxId: string, spec: SandboxSpec, tool: string, args: Record<string, unknown>, opts?: { execTimeoutMs?: number }): Promise<ExecResult>
  listContainers(): Promise<Array<Record<string, string>>>
  containerStats(name: string): Promise<Record<string, string> | null>
  containerProcesses(name: string): Promise<Array<Record<string, string>>>
  containerAction(name: string, action: 'stop' | 'start' | 'restart' | 'rm'): Promise<{ ok: boolean; message: string }>
  status(): Promise<SandboxStatus>
  isBusy(sandboxId: string): boolean
}

/** 宿主身份（环境可配——多宿主部署时各宿主唯一——默认 local 单机） */
export const HOST_ID = process.env.SANDBOX_HOST_ID ?? 'local'

/** 宿主容量声明（注册事件 payload——调度器容量视图基础） */
export function hostCapacity(): { hostId: string; memoryMb: number; cpus: number; containers: number } {
  const mem = Number(process.env.SANDBOX_POOL_BUDGET_MB ?? 0)
  const cpus = Number(process.env.SANDBOX_CPU_LIMIT ?? 1)
  return { hostId: HOST_ID, memoryMb: mem, cpus, containers: 0 }
}
