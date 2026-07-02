# weifuwu — 开发约束

- **ESM only** — 无 CommonJS 兼容
- **TypeScript strict** — `noImplicitAny: false`
- **Web 标准优先** — 所有 handler 使用 `(req: Request, ctx: Context) => Response`
- **测试用 `node --test`** — 不引入 Jest/Mocha
- **构建用 esbuild** — `scripts/build.mjs`，外部依赖全部 external
- **发布用 `node scripts/release.mjs <version>`** — 构建 + 声明文件 + 发布 + git tag
- **中间件模式** — 返回 `Middleware<Context, Context & NewFields>`，通过 module augmentation 扩展 Context
- **ctx 注入** — middleware 通过 `ctx.field = value` 注入，下游 handler 可通过 `ctx.field` 访问
- **Closeable 接口** — 所有有状态的模块（postgres, redis, queue, rateLimit）实现 `close(): Promise<void>`
