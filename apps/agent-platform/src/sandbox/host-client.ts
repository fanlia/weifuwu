/**
 * 宿主上报客户端（集群化阶段 2）——sandbox-host 进程连接中心——
 * 本地 sandbox 事件 → ws 上报（中心聚合——跨宿主统一查询）
 *
 * 单机兼容：HOST_ID='local' 且 centerUrl 未配置时——直连（本地缓冲——
 * 不上报——零影响）。多宿主：配置 CENTER_URL——连接中心 ws——
 * 订阅 sandboxEmit → 上报。
 */

import { sandboxEmit, subscribeSandboxEvents } from './events.ts'
import { HOST_ID } from './host.ts'

const CENTER_URL = process.env.CENTER_URL ?? ''

/** 启动宿主上报（订阅本地事件 → ws 上报中心——幂等——返回停止函数） */
export function startHostReporting(): () => void {
  if (!CENTER_URL) return () => {} // 单机直连模式——无需上报
  let ws: WebSocket | null = null
  let stopped = false
  const connect = (): void => {
    if (stopped) return
    try {
      ws = new WebSocket(`${CENTER_URL.replace(/^http/, 'ws')}/sandbox-host`)
      ws.onopen = () => {
        // 注册（宿主身份/容量——中心容量视图）
        const { hostCapacity } = require('./host.ts') as any
        ws?.send(JSON.stringify({ type: 'host:register', hostId: HOST_ID, capacity: hostCapacity() }))
      }
      ws.onclose = () => { if (!stopped) setTimeout(connect, 3000) } // 重连
      ws.onerror = () => { try { ws?.close() } catch { /* ignore */ } }
    } catch { setTimeout(connect, 3000) }
  }
  connect()
  const unsub = subscribeSandboxEvents((e) => {
    try { ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'sandbox:event', event: e })) } catch { /* ignore */ }
  })
  // 心跳（阶段 4：空闲宿主也有活跃证明——中心 health 检测超时判定 down）
  const pingTimer = setInterval(() => {
    try { ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'host:ping', hostId: HOST_ID, ts: Date.now() })) } catch { /* ignore */ }
  }, 30_000)
  pingTimer.unref?.()
  return () => { stopped = true; clearInterval(pingTimer); unsub(); try { ws?.close() } catch { /* ignore */ } }
}
