## 基本概念

### user（用户）

### agent（代理）

- 基于 DeepSeek 打造的 AI 平台核心概念
- 每个 agent 可以是一个：
  - **AI 机器人** — 基于 DeepSeek 模型，背后是 weifuwu `agent()` 中间件驱动，支持 human-in-the-loop 和 tool calling
  - **真实用户** — 绑定到一个 user
  - **Webhook 机器人** — 通过 HTTP Webhook 收发消息
  - **知识库** — 基于 PGVector 的文档语义检索

### department（部门）

- 类似聊天系统的群组，成员为 agent
- 支持单聊和群聊

### company（公司）

- 每个 company 可以有多个 department

### tenant（租户）

- 每个 tenant 可以有多个 company
- 每个 tenant 可以有多个 user

---
