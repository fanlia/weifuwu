# messager — 消息系统中间件实施计划
> **状态（2026-12 确认）**：✅ 已完成——P1-P4 全落地（数据层 + 核心服务 / WS 实时层 handler+房间+broadcast+sendTo / HTTP routes / agent-platform 迁移完成——`apps/agent-platform/server.ts` 用 `messager` WS 房间广播）。裁剪登记：已读回执轮询/附件上传/全文搜索/离线推送（见文末）。

> 对齐 userSystem 模式：持久化消息系统（会话/消息/实时投递），应用必须的一等能力。
> 定位：实时应用（聊天/通知/协作）从"每应用自建消息基础设施"变为"中间件 + 业务代码"。

## 总览

| 阶段 | 内容 | 验证 |
|---|---|---|
| P1 | 数据层 + 核心服务（migrate/会话/消息 CRUD/游标分页/direct 唯一） | 真库测试（CS-04） |
| P2 | 实时层（WS 协议 handler/房间/Redis 跨进程/sendTo/broadcast） | 真实 WS 连接测试 |
| P3 | 路由层（HTTP API + user 鉴权依赖） | HTTP 集成测试 |
| P4 | agent-platform 迁移（删 ws-hub）+ 浏览器冒烟 | 冒烟 + 双 typecheck |
| 验收 | 全量测试 + build + 文档 | 记录 |

## P1：数据层 + 核心服务

**问题**：消息持久化需要会话/成员/消息三表 + 完整服务 API（创建会话、发消息、历史、未读）。

**方案**（对齐 userSystem：工厂 + `__meta` + `migrate()`）：

```ts
app.use(messager({ sql, redis }))
```

- 3 张 `_weifuwu_*` 私有表（见下）
- `MessagerClient` 核心服务：`createConversation`（direct 同对用户唯一）/`listConversations`（最后消息 + 未读数）/`sendMessage`/`listMessages`（游标分页）/`editMessage`/`deleteMessage`
- `sender_type + sender_id`（不 FK users）——agent 消息天然可存

**DDL**：

```sql
_weifuwu_conversations         (id UUID PK, type 'direct'|'group', created_by, created_at)
_weifuwu_conversation_members  (conversation_id FK CASCADE, user_id, last_read_at, PK 复合)
_weifuwu_messages              (id UUID PK, conversation_id FK CASCADE, sender_type, sender_id,
                                 content, msg_type, created_at, edited_at, deleted_at)
CREATE INDEX idx_messages_conv ON _weifuwu_messages (conversation_id, created_at)
```

**验证**：真库测试（TDD 先行）——direct 唯一、游标分页边界、未读数、编辑/删除软删、migrate 幂等。

## P2：实时层

**问题**：持久化之后需要实时投递——房间订阅 + 跨进程广播 + 点对点。

**方案**：

- `ctx.msg.handler()`：WS 升级 handler，协议内置——`subscribe/unsubscribe/ping`（resp：`connected/subscribed/pong` + 业务事件）
- 房间管理：本地 Map（join/leave 自动清理断线）+ Redis pub/sub 跨进程（agent-platform ws-hub 验证过的模式上移）
- `broadcast(room, event)` / `sendTo(userId, event)`（内部 room `user:{id}`）
- `sendMessage` 成功后自动广播 `new_message` 事件（持久化 + 实时一体）

**验证**：真实 WebSocket 连接测试（ws 包做客户端）——订阅收事件、断线清理、Redis 跨进程（双实例广播）。

## P3：路由层

**问题**：HTTP API 暴露——开发者不必直接调 service。

**方案**（`mw.routes(app, opts)` 对齐 userSystem）：

| 路由 | 语义 |
|---|---|
| `POST /api/messages/conversations` | 创建会话（direct/group） |
| `GET /api/messages/conversations` | 我的会话列表 |
| `GET /api/messages/conversations/:id/messages?before=&limit=` | 历史游标分页 |
| `POST /api/messages/conversations/:id/messages` | 发消息（持久化 + 广播） |
| `PATCH /api/messages/messages/:id` | 编辑（edited_at + 广播） |
| `DELETE /api/messages/messages/:id` | 删除（deleted_at + 广播） |

- 鉴权依赖 user：未登录 401；sender_id = ctx.user.id；会话成员校验

**验证**：HTTP 集成测试（注册 → 登录 → 建会话 → 发消息 → 历史 → 编辑/删除）。

## P4：agent-platform 迁移

**问题**：证明框架能力被真实应用消费——agent-platform chat 是第一个消费者。

**方案**：

- 删 `ws-hub.ts`（~160 行业务自研）→ `ctx.msg.handler()` + `ctx.msg.broadcast`
- chat.ts 部门房间广播 → 会话房间广播；messages 查询 → `ctx.msg.listMessages`
- AI 消息：`sender_type='agent'` 保存 agent 回复（chat.ts 现有 DB 写入保留或迁移）
- 浏览器冒烟：注册 → 登录 → 会话 → 实时消息

## 诚实裁剪

1. **已读回执状态机**——只做 `last_read_at` 未读数，回执轮询裁剪（后续可补）
2. **附件存储**——msg_type 支持 'image'/'file'，URL 存 content，上传留应用层
3. **全文搜索**——LIKE 可后续补
4. **消息确认/重试**——实时通道语义；可靠投递用 ctx.queue
5. **移动端推送（APNs/FCM）**——离线推送是另一通道，不做

## 验收记录

（P4 后填写）
