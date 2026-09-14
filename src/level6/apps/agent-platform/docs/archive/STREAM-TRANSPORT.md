# Agent Stream Transport 设计方案

## 当前架构

```
HTTP POST /api/departments/:id/messages
  → handleNewMessageStream()
    → 硬编码 wsHub.broadcast() 发送事件
    → 前端通过 WebSocket 接收
```

问题：事件发射与 WS 强耦合，无法支持 SSE / 调试 / 日志等其他传输方式。

## 目标

```
流式逻辑 (streamAgent + callback)
  → EventEmitter 接口
    → WsEmitter     (wsHub.broadcast)
    → SseEmitter    (response.write)
    → TestEmitter   (events[] 数组收集)
```

- 流式逻辑只调 `emit.xxx()`，不关心传输层
- 新增传输只需实现 Emitter 接口
- 测试可以直接验证 events 数组

## 接口设计

```typescript
interface StreamEvent {
  type: 'ai:status' | 'ai:token' | 'ai:tool'
  messageId: string
  [key: string]: unknown
}

interface StreamEmitter {
  emit(event: StreamEvent): void | Promise<void>
}
```

## 改动范围

| 文件 | 改动 |
|------|------|
| `src/services/chat.ts` | 提取 `runAgentStream()`，接受 `emit` 参数 |
| `src/routes/messages.ts` | 新增 `POST /api/departments/:id/messages/stream` SSE 端点 |
| `src/services/ws-hub.ts` | 无改动 |

## 使用方式

```bash
# WS 方式（现有，不变）
curl -X POST /api/departments/:id/messages \
  -H 'Content-Type: application/json' \
  -d '{"content":"当前时间"}'
# → 返回 201 + messageId
# → WS 推送流式事件

# SSE 方式（新增）
curl -N -X POST /api/departments/:id/messages/stream \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer xxx' \
  -d '{"content":"当前时间"}'
# → 直接返回 SSE 流
# event: status\ndata: {"status":"thinking"}\n\n
# event: token\ndata: {"text":"当前"}\n\n
# ...
# event: status\ndata: {"status":"complete"}\n\n
```

## 测试方式

```bash
# SSE 测试
curl -N -X POST "http://localhost:3000/api/departments/$DM_ID/messages/stream" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"content":"现在几点"}'
# 直接显示流式事件，无需 WS 客户端
```
