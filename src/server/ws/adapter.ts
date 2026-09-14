/**
 * ws 线协议适配器（W2——`WsHandlePort` 的 `ws` 包实现）
 *
 * 状态：**非默认**（W5 起默认 = 自研 RFC6455 `src/server/ws/native/`）。
 * `ws` 降 devDependency——本文件仅作差分对账参考与回退选项（测试直接导入）。
 *
 * 分层：core 只定义端口（`src/core/l1/server/ws.ts`）——协议实现属装备面。
 *
 * 停机语义（S2 实证）：`server.closeAllConnections()` 对已升级的 WS 连接无效——
 * 必须经 `wss.clients` 逐一 1001 握手（客户端 close 事件才会触发）。
 */
import { WebSocketServer } from 'ws'
import type { WsHandlePort } from '../core/ws.ts'
import type { WebSocket } from '../types.ts'

export function createWsAdapter(): WsHandlePort {
  const wss = new WebSocketServer({ noServer: true })

  return {
    handleUpgrade(req, socket, head, callback) {
      wss.handleUpgrade(req, socket, head, (ws) => {
        callback(ws as unknown as WebSocket)
      })
    },

    async shutdown() {
      if (wss.clients.size === 0) return
      const clients = [...wss.clients]
      for (const client of clients) {
        try {
          client.close(1001, 'server shutting down')
        } catch { /* already closed */ }
      }
      // 等待握手完成（上限 500ms——强杀由 stop() 的 closeAllConnections 兜底）
      await new Promise<void>((resolve) => {
        let remaining = clients.length
        const done = () => {
          if (--remaining === 0) {
            clearTimeout(timer)
            resolve()
          }
        }
        const timer = setTimeout(resolve, 500)
        for (const c of clients) c.once('close', done)
      })
    },
  }
}
