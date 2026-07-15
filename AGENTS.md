# weifuwu — AI SaaS 框架

**目标：让 AI SaaS 项目从 0 到上线只需要一个 `npm init`。**

我们不是通用 Web 框架，而是专为 AI 原生 SaaS 产品设计的框架。每一个内置模块都对应一个 AI SaaS 基础设施需求：用户系统、即时消息、内容管理、RAG 知识库、AI Agent、动态数据存储。

## 原则

- **AI 原生** — `kb` + `ai/agent` + `messager` 三个模块配合，直接提供 LLM 对话 + RAG 知识库 + 实时交互的完整链路。不需要自己拼。
- **每一个内置模块都有存在理由** — 它解决了一个具体的 AI SaaS 问题（身份、对话、知识库、Agent），不是为了"有而存在"。
- **开箱即用，但可替换** — 默认方案覆盖 80% 场景（Postgres + pgvector + DashScope/DeepSeek），但你随时可以换成自己的。
- **生产就绪，零配置** — `postgres()` 读 `DATABASE_URL`，`redis()` 读 `REDIS_URL`，`user()` 读 `JWT_SECRET`，`kb()` 读 `DASHSCOPE_API_KEY`。环境变量配好就能跑。

## 开发约束

- **ESM only** — 无 CommonJS 兼容
- **TypeScript strict** — `noImplicitAny: false`
- **Web 标准优先** — 所有 handler 使用 `(req: Request, ctx: Context) => Response`
- **测试用 `node --test`** — 不引入 Jest/Mocha
- **构建用 esbuild** — `scripts/build.mjs`，外部依赖全部 external
- **发布用 `node scripts/release.mjs <version>`** — 构建 + 声明文件 + 发布 + git tag
- **中间件模式** — 返回 `Middleware<Context, Context & NewFields>`，通过 module augmentation 扩展 Context
- **ctx 注入** — middleware 通过 `ctx.field = value` 注入，下游 handler 可通过 `ctx.field` 访问
- **Closeable 接口** — 所有有状态的模块（postgres, redis, queue, rateLimit）实现 `close(): Promise<void>`
- react(), ctx.render 相关功能必须使用 agent-browser skill 测试 `./examples/react-ssr/`
- 运行测试之前必须先 `docker compose up -d`
