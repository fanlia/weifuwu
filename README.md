# weifuwu

**自托管全栈框架** — 一个 npm 包 = 后端 HTTP + 前端 VDOM + 134 组件 + CSS 设计系统 + SaaS 地基（认证 / 消息 / 队列 / AI）。全自研、零构建、消灭样板。

> 文档即代码：本文只写入门——细节地图见 [docs/client.md](docs/client.md)（前端）/
> [docs/server.md](docs/server.md)（后端）/ [AGENTS.md](AGENTS.md)（内核纪律）。
> **源码就是最高保真文档**——实现细节看源码与测试，不重复维护。

## 为什么（五条哲学）

1. **一个包，全栈一体** — 后端、前端、组件、样式装在一个包：服务端
   `--import weifuwu/dev` 直接跑 `.tsx`；浏览器 CDN import map；CSS 一条 link。
2. **全自研，诚实裁剪** — VDOM、PG v3 / RESP2 协议、GraphQL schema、SSE 协议全部
   自研（确定性：行为可预测、错误模型统一）。不支持的能力明确抛
   `ProtocolError('unsupported')`——绝不静默降级。
3. **消灭样板** — 零构建（动态编译即刷即用）· 零自定义 CSS（`--wf-brand-seed`
   一个值全站换肤）· 零退订/零竞态（`useAsyncData` 并发合并/竞态取消/SSR 种子）·
   零协议样板（自研客户端消灭双重编码）。
4. **SaaS 地基，应用必须的一等能力** — rateLimit / email / userSystem / messager /
   queue / ai 六中间件随包内置且互相咬合——开发者从「自建基础设施」变「声明业务」。
5. **错误现形，自愈不可消音** — 渲染错误 hole 降级 + 下一拍重试是容错不是静默；
   错误计数去重现形；dev 仪表 `window.__wfRenderHealth` 四轴读数。

## 快速开始

两种模式，组件和路由写法完全一样，差异只有入口两行：

| 模式 | 场景 | 后端 | 客户端 |
| --- | --- | --- | --- |
| SPA | 应用页 | HTML 外壳 | `uiServe(router, { root })` |
| SSR + Hydration | 内容页（SEO/首屏） | `uiSsr(router, url)` + `__DATA__` 种子 | `uiServe`（结构吸收——首帧复用服务端 DOM） |

```tsx
// routes.tsx —— 路由树（UIRouter——前后端同一棵树——单一实现源）
import { UIRouter, h } from 'weifuwu/vdom'

export function buildRouter() {
  const router = new UIRouter()
  router.get('/', () => h(Home))
  router.get('/u/:id', (req, ctx) => h('h1', {}, `用户 ${ctx.params.id}`))
  router.notFound(() => h('h1', {}, '404'))
  return router
}
```

```ts
// server.ts —— SPA
import { serve, Router, ui } from 'weifuwu'
const router = new Router()
router.use(ui())
router.get('/', (req, ctx) => ctx.ui.html`<!doctype html><html><body>
  <div id="root"></div><script src="/static/app.js"></script></body></html>`)
router.get('/static/app.js', (req, ctx) => ctx.ui.js('./src/client.ts'))
router.get('/api/hello', () => Response.json({ msg: 'world' }))
serve(router, { port: 3000 })
```

```ts
// src/client.ts —— 浏览器 boot
import { uiServe } from 'weifuwu/vdom'
import { buildRouter } from './routes.tsx'
uiServe(buildRouter(), { root: '#root' })
```

```ts
// server.ts —— SSR（同路由树 → HTML + __DATA__；客户端结构吸收零闪跳）
router.get('*', async (req, ctx) => {
  const html = await uiSsr(buildRouter(), new URL(req.url).pathname, { title: '我的应用' })
  return ctx.ui.html(html)
})
```

## 技术原则（速览）

- **零运行时依赖** — 前端无 npm 运行时依赖；后端仅 esbuild/graphql/ws。
- **前后端同构** — handler 签名 `(req, ctx) => Response` 双端字面同构；路由内核
  五层单源 `src/shared/router/`（trie/pipeline/context/chain/ctx-fields）双端同一
  `dispatchRouter`，差异点钩子化。
- **工厂同步，异步边界全在 hooks，渲染纯同步** — 组件 =
  `(initProps, ctx) => (props) => VNode`（async 即编译错）；数据加载 hooks 内部流
  管道（卸载自动退订——零泄漏）。
- **getter 纪律** — 一切会变化的值 = `() => T`——任何位置调用返回最新。
- **VDOM 输出透明（命令流可回放）** — 渲染 = 13 种 NDJSON 命令流（完整自足）——
  DOM = fold(命令流)，可记录可回放可断言；devtools 看到的就是引擎决策的可读输出。
- **对账防线（演绎保证）** — 双树终态等价对账器 + 命令流模拟器 + 状态机迁移表 +
  fuzz（1310 对多种子）——状态机保证暴露机制完整，对账器保证错误必被抓。
- **中间件注入一切** — `ctx` 注入（sql/redis/api/auth/i18n/limit/email/queue/ai/msg），
  注入声明 `injects/depends` 双端同一注册表。

## 模块总览

| 导入路径 | 模块 | 用途 |
| --- | --- | --- |
| `weifuwu` | Router / serve / cors / serveStatic | Trie 路由 + 中间件链 + HTTP 服务器 + 静态服务 |
| `weifuwu` | postgres / redis / Memory | 自研 PG v3 + RESP2 协议（`ctx.orm` / `ctx.redis`——数据面 = 声明式 ORM AST，业务零 SQL 文本）；Memory 零数据库测试 |
| `weifuwu` | ui | SSR 渲染 + esbuild JS/CSS 动态编译（`ctx.ui`） |
| `weifuwu/vdom` | UIRouter / uiServe / uiSsr | 前端路由唯一入口 + 浏览器 boot + SSR（结构吸收） |
| `weifuwu/vdom` | 命令流引擎 + hooks 全家 | 渲染周期/事件代理/三状态机 + useAsyncData/usePopup/useControlled/… |
| `weifuwu/components` | **134 个组件** | Button/Table/Modal/AiChat/… + `toast()`/`confirm()` 命令式中间件 |
| `weifuwu/layout` | CSS 布局 | 50 个布局原语 + 97 个工具类 + 183 个主题 Token |
| `weifuwu` | rateLimit / email / userSystem / messager / queue / scheduler / ai / graphql | SaaS 地基中间件（ctx 注入） |
| `weifuwu/dev` | dev loader | `--import weifuwu/dev` 直接跑 `.ts/.tsx` |

## 能力速查（任务 → API）

| 任务 | 用 |
| --- | --- |
| 起 HTTP 服务 + 路由 | `serve(app)` + `new Router()` + `app.get/post/...` |
| 渲染页面 | SPA：`uiServe(router, { root })` · SSR：`uiSsr(router, url)` |
| 数据管道（加载/缓存/竞态） | `ctx.ui.useAsyncData(fetcher, key)`——并发合并/取消/缓存/SSR 种子 |
| 弹窗（toast/confirm/自定义） | `toast()` / `confirm()` / `ui.openPopup(opts)`→PopupHandle |
| AI 对话（流式/工具/审批） | `ctx.ai.chat()` + `useChat` + `AiChat` 组件（`wf:` 协议） |
| 认证（登录/角色/租户） | `userSystem()` + `ctx.auth` + `AuthPage` 组件 |
| 限流 / 邮件 / 消息 / 队列 / 定时 | `rateLimit()` / `email()` / `messager()` / `queue()` / `scheduler()` |

## 测试命令

```
npm run test:client    → 契约层（428 命令流断言——零浏览器——~5s）
npm run test:scenario  → 场景层（123 场景——SSR 服务化 + playwright 真实浏览器）
npm run test:showcase  → showcase 组件测试（324——134 组件全覆盖——每组件一文件）
npm run test           → 契约 + 场景 + server（db 真库依赖 docker）
npm run audit:all      → 七线审计（semantics/interactivity/vdom/theme/api/bundle/showcase）
```

> 防线细节见 [AGENTS.md](AGENTS.md) §1（测试纪律 R-01/R-04 等）。

## 工程布局

```
src/client/       前端（components/ 组件库 · layout/ 布局系统 · vdom/ 渲染引擎）
src/server/       后端（core/ 路由内核 · middleware/ 中间件 …）
src/shared/       双端共享（router/ 五层单源）
src/test/         契约层 + 场景层测试
apps/showcase/    weifuwu 展示场：每组件一页 + demo 源码即用法（:3200）
apps/agent-platform/  全栈 SaaS 示例：多租户 AI 平台（auth/AI 对话/HITL 审批）（:3000）
plan/     进行中计划 + 计划写作规范（plan/plan.md——完成计划 git log 承接）
```

## 文档地图

| 文档 | 内容 |
| --- | --- |
| [docs/client.md](docs/client.md) | 前端：组件清单/设计语言/布局系统/**组件编写规范（唯一入口）**/架构 |
| [docs/server.md](docs/server.md) | 后端：中间件/环境变量/AI 协议（wf:）/数据层/实时层 |
| [AGENTS.md](AGENTS.md) | 内核纪律：测试架构/组件契约/修复归类/质量方法论/防线快照 |
| [plan/plan.md](plan/plan.md) | 计划写作规范：模板/纪律/验收/收尾（进行中计划在 plan/） |

---

*showcase `http://localhost:3200`（LLM: `curl /llms.txt`）· agent-platform
`http://localhost:3000`（admin@demo.com / admin123）*
