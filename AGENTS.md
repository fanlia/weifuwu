# weifuwu Monorepo

Workspace monorepo with three packages: `@weifuwu/core`, `@weifuwu/react`, `@weifuwu/cli`.

## Project Structure

```
weifuwu/                              ← workspace root
├── package.json                      ← workspaces: ["packages/*"]
├── packages/
│   ├── core/                         ← @weifuwu/core (框架核心)
│   │   ├── package.json              → name: "@weifuwu/core"
│   │   ├── tsconfig.json
│   │   ├── scripts/build.mjs
│   │   └── src/
│   │       ├── index.ts              ← 全部导出
│   │       ├── types.ts              ← Context, Handler, Middleware, HttpError, Closeable
│   │       ├── core/                 ← serve, router, trace, env, logger, cookie, sse
│   │       ├── middleware/           ← compress, cors, health, helmet, rate-limit, ...
│   │       ├── ai/                   ← provider, stream
│   │       ├── postgres/             ← client, types, module
│   │       ├── redis/                ← client, types
│   │       ├── queue/                ← index, types, cron
│   │       ├── hub.ts, graphql.ts
│   │       └── test/
│   │
│   ├── react/                        ← @weifuwu/react (React SSR)
│   │   ├── package.json              → name: "@weifuwu/react", deps: { "@weifuwu/core": "*" }
│   │   ├── tsconfig.json
│   │   ├── scripts/build.mjs
│   │   └── src/
│   │       ├── index.ts              ← SSR 导出 (ssr, theme, i18n, flash, csrf)
│   │       ├── ssr/                  ← React SSR 引擎 (23 个文件)
│   │       │   ├── ssr.ts            ← 主模块：文件系统路由 + React 19 SSR
│   │       │   ├── compile.ts        ← ESBuild TSX 编译器 + vendor bundle
│   │       │   ├── tsx-context.ts    ← TsxContext, useCtx, setCtx, useLoaderData
│   │       │   ├── html-shell.ts     ← HTML shell 构建
│   │       │   ├── error-boundary.ts ← 错误边界中间件
│   │       │   ├── live.ts           ← 开发 HMR (chokidar + WebSocket)
│   │       │   ├── tailwind.ts       ← Tailwind v4 CSS 编译
│   │       │   ├── module-server.ts  ← 浏览器模块服务
│   │       │   ├── server-registry.ts← dev 模式 transformSync + vm
│   │       │   ├── stream.ts         ← HTML 流响应构建
│   │       │   ├── client-router.ts  ← SPA 路由 (Link, navigate)
│   │       │   ├── client-state.ts   ← createStore, useFetch
│   │       │   ├── client-locale.ts  ← useLocale
│   │       │   ├── client-theme.ts   ← useTheme, applyTheme
│   │       │   ├── use-action.ts     ← useAction (表单提交)
│   │       │   ├── use-websocket.ts  ← useWebsocket (自动重连)
│   │       │   ├── use-flash-message.ts
│   │       │   ├── use-agent-stream.ts
│   │       │   ├── head.tsx          ← Head 组件
│   │       │   ├── react.ts          ← React hooks barrel
│   │       │   └── ssr-entries.ts    ← SSR 入口跟踪
│   │       └── middleware/           ← theme, i18n, flash, csrf
│   │
│   └── cli/                          ← @weifuwu/cli (CLI 工具)
│       ├── package.json              → name: "@weifuwu/cli", deps: { "@weifuwu/core": "*" }
│       ├── tsconfig.json
│       └── src/
│           ├── cli.ts                ← CLI 入口 (init, version)
│           └── cli/template/react/   ← React SSR 模板
│               ├── app.ts, index.ts, .env, .gitignore, tsconfig.json
│               ├── ui/app/layout.tsx, page.tsx
│               ├── ui/app/about/page.tsx
│               ├── ui/app/globals.css
│               └── locales/en.json, zh-CN.json
```

## Usage

```bash
# API-only 项目
npx @weifuwu/cli init my-api

# React SSR 项目
npx @weifuwu/cli init my-app --ssr

# 代码中引用
import { serve, Router } from '@weifuwu/core'
import { ssr, theme, i18n } from '@weifuwu/react'
import { useCtx, useTheme, Link } from '@weifuwu/react'
```

## Development Commands

```bash
npm run build              # 构建 core + react
npm run typecheck           # 类型检查三个包
npm run build -w packages/core   # 只构建 core
npm run build -w packages/react  # 只构建 react
```
