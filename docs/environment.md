# 环境变量与开发命令

> 本页为 weifuwu 官方文档拆分页 · [返回 README](../README.md)

## 环境变量

| 变量 | 用途 | 模块 | 默认 |
|------|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgres()` | —（必填） |
| `REDIS_URL` | Redis 连接字符串 | `redis()` | `redis://localhost:6379` |
| `AUTH_SECRET` | userSystem HMAC 签名密钥（≥16 字符） | `userSystem()` | 可传 `options.secret` |
| `DEEPSEEK_API_KEY` | LLM 对话 provider API key | `ai()` | — |
| `DEEPSEEK_BASE_URL` | LLM 对话 provider 端点 | `ai()` | `https://api.deepseek.com/v1` |
| `DEEPSEEK_MODEL` | 默认对话模型 | `ai()` | `deepseek-v4-flash` |
| `DASHSCOPE_API_KEY` | embedding 向量化 provider key | `ai({ embedding })` | — |
| `DASHSCOPE_BASE_URL` | embedding provider 端点 | `ai({ embedding })` | — |
| `DASHSCOPE_EMBEDDING_MODEL` | embedding 模型名 | `ai({ embedding })` | — |
| `RESEND_API_KEY` | 邮件 adapter `resend` | `email()` | 可用 `options.resend` |
| `SMTP_HOST` | 邮件 adapter `smtp` | `email()` | `localhost` |
| `SMTP_PORT` | SMTP 端口 | `email()` | `3025` |

> 均可通过中间件 options 显式传入（`postgres({ url })` / `userSystem({ secret })` / `ai({ provider })`），环境变量为默认来源。

---

## 开发命令

```bash
npm run build       # 构建 dist/
npm run typecheck   # TypeScript 类型检查
npm test            # 运行 node --test（含 docker 真库测试）
node scripts/release.mjs <version>   # 构建 + 发布 + git tag
```

```bash
# 测试前启动依赖服务（postgres / redis / smtp）
docker compose up -d
```

---

## 应用示例启动

```bash
# 组件 cheatsheet（零依赖）
cd apps/components-demo && node server.ts

# 全栈 SaaS 示例（多租户 AI 平台）
cd apps/agent-platform && npm run seed && npm run dev
# 凭据：admin@demo.com / admin123
```
