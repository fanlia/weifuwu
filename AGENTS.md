# weifuwu — SaaS 开箱即用框架

**目标：让 SaaS 项目从 0 到上线只需要一个 `npm init`。**

我们不是为了造一个通用 Web 框架，而是为了极速搭建 SaaS 产品。每一个内置模块都对应一个 SaaS 基础设施需求。

## 原则

- **每一个内置模块都有存在理由** — 它解决了一个具体的 SaaS 问题（租户隔离、限流、支付、用户系统、后台任务），不是为了"有"而存在。
- **开箱即用，但可替换** — 默认方案覆盖 80% 场景（比如 Postgres + Redis），但你随时可以换成自己的。
- **生产就绪，零配置** — `postgres()` 读 `DATABASE_URL`，`redis()` 读 `REDIS_URL`，`user()` 读 `JWT_SECRET`。环境变量配好就能跑。

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
