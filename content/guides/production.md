# 生产级案例（agent-platform）

> 来源：`apps/agent-platform/`——多租户 AI Agent 平台，weifuwu 中间件全量消费方。
> 定位：**实战驱动框架开发的生产级参考**——showcase 的教学模板由此提炼，框架能力先在此实战验证。

## 中间件全家桶装配（真实顺序即依赖顺序）

```ts
import { serve, Router, cors, postgres, redis, ui, userSystem, ai, messager, rateLimit, verifyPassword, email } from 'weifuwu'

const app = new Router()
app.use(cors())
app.use(postgres())          // ctx.sql——契约层（引擎实现）
app.use(redis())             // ctx.redis——独立连接工厂 createConnection()
app.use(userSystem())        // ctx.user/ctx.auth——登录态
app.use(ai())                // ctx.ai——chat/stream/agent/approve
app.use(messager())          // 实时消息
app.use(rateLimit({ redis: r.redis, windowMs: 60_000, max: 100 }))  // ctx.limit
app.use(ui())                // ctx.ui——前端
```

## 架构决策（可复用的模式）

1. **路由按域注册**：`registerAuthRoutes / registerAgentRoutes / ...`——每域一个函数（showcase 模板的 registerXxxApi 同源）
2. **14 页 SPA**：单一前端入口 + 路由表——见 `src/ui/routes.ts`
3. **服务层独立**：services/（chat/agent-runner/sandbox）不依赖路由层——可单测
4. **沙箱隔离**：sandbox/（docker + host 管理）——Agent 执行环境
5. **商业化能力**：订阅分层/租户管理/邀请/白标/私有化——见 apps/agent-platform/README.md

## 学习路径

1. 先跑起来：`cd apps/agent-platform && node --env-file=.env server.ts`
2. 读 `src/middleware/ctx.ts`（AppCtx——中间件注入面全貌）
3. 对照 showcase 教学模板（todo/auth/admin/multi）理解"模板 = 生产架构的简化提炼"

> 纪律：**实战先行、文档跟进**——框架能力变更先在 agent-platform 验证，再沉淀进 showcase 文档。

