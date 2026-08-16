/**
 * 宿主健康检测（集群化阶段 4）——基于事件流的故障检测
 *
 * 心跳源：宿主上报事件（exec/生命周期）+ host:ping（30s）——
 * 中心从事件流推导各宿主"最后活跃时间"——超时（HOST_HEARTBEAT_TIMEOUT
 * 默认 90s）→ host:down 事件（首次——去重）——新事件 → host:up（恢复）。
 *
 * 单机兼容：local 宿主（直连——本地事件）恒活跃——不误报。
 */

import { sandboxEvents, sandboxEmit } from './events.ts'
import { HOST_ID } from './host.ts'

const HEARTBEAT_TIMEOUT = Number(process.env.HOST_HEARTBEAT_TIMEOUT ?? 90) * 1000
const reportedDown = new Set<string>()

/** 从事件流推导宿主最后活跃时间（exec/生命周期/ping——事件即心跳） */
export function hostLastActive(hostId: string): number {
  const evs = sandboxEvents(2000)
  let last = 0
  for (const e of evs) {
    const hid = String(e.payload?.hostId ?? HOST_ID)
    if (hid !== hostId) continue
    // host:ping（心跳）或 exec/生命周期事件 = 活跃证明
    if (e.action === 'host:ping' || e.action.startsWith('exec:') || e.action === 'create' || e.action === 'status' || e.action === 'host:register' || e.action === 'route') {
      // 心跳时间统一用 payload.ts ?? 事件 ts（宿主上报的时间戳——可模拟/可测——
      // host:register/ping 都带 ts——exec 等事件用事件 ts）
      const heartbeatTs = typeof e.payload?.ts === 'number' ? (e.payload.ts as number) : e.ts
      last = Math.max(last, heartbeatTs)
    }
  }
  return last
}

/** 宿主健康检查（定期调用——超时 → host:down；恢复 → host:up） */
export function checkHostHealth(): { down: string[]; up: string[] } {
  const down: string[] = []
  const up: string[] = []
  // 已知宿主（host:register/事件中出现过——排除 local——单机直连恒活跃）
  const evs = sandboxEvents(5000)
  const hosts = new Set<string>()
  for (const e of evs) {
    const hid = String(e.payload?.hostId ?? '')
    if (hid && hid !== HOST_ID) hosts.add(hid)
  }
  const now = Date.now()
  for (const hid of hosts) {
    const last = hostLastActive(hid)
    if (now - last > HEARTBEAT_TIMEOUT) {
      if (!reportedDown.has(hid)) {
        reportedDown.add(hid)
        sandboxEmit('host:down', hid, { lastActiveAt: new Date(last).toISOString(), timeoutMs: HEARTBEAT_TIMEOUT })
        down.push(hid)
      }
    } else if (reportedDown.has(hid)) {
      reportedDown.delete(hid)
      sandboxEmit('host:up', hid, { recoveredAt: new Date().toISOString() })
      up.push(hid)
    }
  }
  return { down, up }
}

/** 测试隔离 */
export function resetHostHealth(): void {
  reportedDown.clear()
}
