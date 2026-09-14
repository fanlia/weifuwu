# 迁移指南（0.94 → 0.95+）——外部消费者

> 本版本是**破坏性重构**：全库七级分层（`src/level0`–`src/level6`）、`exports`
> 字段删除（dist 树即导出面）、apps 内化（showcase / agent-platform 随包，两个 bin）。
> 框架开发者视角见 [docs/level.md](level.md)；本文件只讲消费者需要改什么。

## 1. 导入路径：`weifuwu/*` → `weifuwu/dist/levelN/**`

`exports` 字段已删除——不再有包名子路径解析。**Node 导入请用入口 `.js`**：
`dist/levelN/**` 同时随包一份 TS/TSX 源码树（`ctx.ui` 浏览器编译输入端），但
Node 在 `node_modules` 下拒绝 TS 类型剥离（`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`），
导入 `.ts` 会在运行时失败。

| 旧导入 | 新导入（入口 JS） | 类型声明 |
| --- | --- | --- |
| `weifuwu` · `weifuwu/server` | `weifuwu/dist/level6/index.js` | `dist/level6/index.d.ts` |
| `weifuwu/server/ai` 等子模块 | `weifuwu/dist/level6/server/<name>/index.js` | 同路径 `.d.ts` |
| `weifuwu/server/workflows` | `weifuwu/dist/level6/server/workflows/index.js` | 同上 |
| `weifuwu/client/vdom` | `weifuwu/dist/level6/client/vdom/index.js` | 同上 |
| `weifuwu/client/vdom/jsx-runtime` | `weifuwu/dist/level6/client/vdom/jsx-runtime.js` | — |
| `weifuwu/client/vdom/testing` | `weifuwu/dist/level6/client/vdom/testing.js` | — |
| `weifuwu/client/components` | `weifuwu/dist/level6/client/components/index.js` | 同上 |
| `weifuwu/client/components/style.css` | `weifuwu/dist/level6/client/components/style.css` | — |
| `weifuwu/client/layout` · `weifuwu/layout` | `weifuwu/dist/level6/client/layout/index.js` | 同上 |
| `weifuwu/client/layout/weifuwu-layout.css` | `weifuwu/dist/level5/client/layout/weifuwu-layout.css` | — |
| `weifuwu/dev` | `weifuwu/dist/level6/dev/index.js` | — |
| `weifuwu/shared/router` | `weifuwu/dist/level0/router/index.js` | 同上 |

```ts
// 旧
import { serve, Router, ui } from 'weifuwu'
import { UIRouter, h } from 'weifuwu/client/vdom'
// 新
import { serve, Router, ui } from 'weifuwu/dist/level6/index.js'
import { UIRouter, h } from 'weifuwu/dist/level6/client/vdom/index.js'
```

> 嫌路径长：在应用里自建 import 别名（webpack/vite/esbuild `alias`、Node `imports`、
> TS `paths` 均可）——框架不再内置 exports map。JSX 的 `jsxImportSource`
> 同样指向 `weifuwu/dist/level6/client/vdom`（目录即可——运行时文件是
> `jsx-runtime.js`）。

## 2. 两个应用：不用再抄 `apps/`——用 bin

showcase / agent-platform 源码随包（`dist/level6/apps/**`，含 public/skills 等资产）。
旧 `apps/showcase`、`apps/agent-platform` 目录不再存在。

```bash
npx weifuwu-showcase                 # 组件演示平台（默认 :3200）
npx weifuwu-platform                 # 多租户 AI 平台（默认 :3000）
```

**env 契约（platform）**：`DATABASE_URL` 与 `JWT_SECRET`（≥16 字符）必需；
`REDIS_URL` 可选（缺失则队列/房间广播降级内存面）；`POSTGRES_MEMORY=1` = 零
数据库测试模式（内存适配器——仍需 `DATABASE_URL` 站位值）。
showcase 无必需 env（`PORT` 可选）。

容器/自托管参考仍可用随包 `dist/level6/apps/agent-platform/Dockerfile*`
（路径已按新布局更新；W3 起以 dist 树为准）。

## 3. 依赖面变化

| 旧依赖 | 现状 |
| --- | --- |
| `postgres`（postgres.js） | **删除**——自研 PG v3 线协议（`level2/db` + `level5/server/db/postgres`），`postgres()` API 不变 |
| `ioredis` | **删除**——自研 RESP2（`level5/server/db/redis`），`redis()` API 不变 |
| `ws` | **删除**——自研 RFC6455（`level5/server/ws/native`，Autobahn 301/0 FAILED）；测试与互操作面用 Node 全局 WebSocket（undici） |
| `tailwindcss` / `postcss`（peerDependencies） | **删除**——CSS 由内置解析器直接装配（`ctx.ui.css` 零编译依赖）；`peerDependencies` 全部取消 |
| `puppeteer-core` / `@graphql-tools/schema` | 删除（无引用；schema 自研） |

包依赖面收敛为：**`dependencies`: `esbuild` + `graphql`**；
`peerDependencies`: 无。

## 4. 框架开发者（源码级）

- 源码路径 `src/{core,client,server,shared}` → `src/level0`–`src/level6`（目录即层级）；
- 分类清单 `src/levels.json`；守卫 `npm run audit:levels`（方向/环境/三方/规模/docs/L0 快照）；
- 旧 116 个兼容 shim 已全量删除（无过渡层）——包内导入已全量重写；
- 测试命令迁根：平台协议测试 `npm run platform:test`（507）·
  UI `npm run platform:test:ui`（155）；showcase 不变 `npm run test:showcase`（336）。

## 5. 迁移自检

```bash
# 1) 解析：入口 JS 可导入
node -e "import('weifuwu/dist/level6/index.js').then(m => console.log(Object.keys(m).length))"

# 2) 组件 CSS 可达
ls node_modules/weifuwu/dist/level6/client/components/style.css

# 3) 两个应用可启动
npx weifuwu-showcase &  sleep 2 && curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3200/
```

任何旧 `weifuwu/<子路径>` 导入都会得到 `ERR_MODULE_NOT_FOUND`——按 §1 表替换即可。
