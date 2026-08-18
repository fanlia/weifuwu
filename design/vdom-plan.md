# vdom 新版本设计（src/client/vdom/ 独立实现区）

> 2026-12 定案——替换 ui-dom 的新版本 vdom 设计。
> ui-dom 保持不变——本实现区完全独立（零引用 ui-dom——不 re-export）——
> 完全实现后一次性替换。

## 1. 公共面（决策 2026-12）

- 对外接口**只有**：`h/jsx`、`uiServe`、`UIRouter`
- `createRoot` **不导出**——必须使用 UIRouter（路由是唯一应用入口——
  类比后端 Router/serve——req = Request、res = Response）
- `uiSsr` 不单独导出——uiServe 双端一体
- 结构符号内化：createPortal/Fragment/Portal 不导出（usePopup 内部机制/
  数组 = 隐式 Fragment/`<></>` 经 jsx-runtime）

## 2. 原生 Request/Response（前后端共享）

**Handler 签名字面同构——与后端完全一致**：

```ts
type PageHandler = (req: Request, ctx: Ctx) => Response | Promise<Response>
type PageMiddleware = (req: Request, ctx: Ctx, next: PageHandler) => Response | Promise<Response>
```

- **Request 原生**：`new Request(new URL(path, origin))`——URL/query/hash
  解析白拿；params 注入 = 类型扩展（`Request & { params }`——Object.assign）
- **Response 原生**：body = **修改 DOM 的命令流**（ReadableStream<Command>——
  vnode 不进 Response——命令是纯数据——可序列化/可流）
- **Router 核心共享**：Trie 匹配 + 中间件链（use/next/error）提取为纯逻辑核心
  （`src/shared/router/`）——server Router 与前端 Router 构建其上——同一份代码
- **params 挂 req**（handler 顺手——匹配结果注入）

## 3. 渲染 = 命令流（核心结构）

```
前端路由代码：router.get('/posts/:id', (req, ctx) =>
                new Response(renderToStream(h(PostPage, { id: req.params.id }))))
                    ↓ 同一 handler 同一 Response
客户端 uiServe：res.body.getReader() → 逐条 command → apply 到 DOM
服务端 uiServe：res.body.pipeThrough(commandToHtml()) → HTTP 流式响应
```

### Command 类型（流元素——纯数据——自足不依赖 vn 引用）

```ts
export type Command =
  | { op: 'create'; id: string; tag: string; attrs: Record<string, unknown> }
  //  attrs = 可序列化面（class/id/style/data-*——服务端 create 即吐完整开标签）
  | { op: 'createText'; id: string; value: string }
  | { op: 'createAnchor'; id: string }          // 占位锚（空洞/portal 槽）
  | { op: 'close'; id: string }                 // 离开子树——服务端闭合标签——客户端 no-op
  | { op: 'insert'; id: string; parent: string; ref: string | null }
  | { op: 'setProp'; id: string; key: string; value: unknown }   // 运行时面（事件/ref）——客户端
  | { op: 'setText'; id: string; value: string }
  | { op: 'remove'; id: string }
  | { op: 'unmountComp'; compId: string }
  | { op: 'done' }                              // 流结束 = 渲染完成
```

### 流式语义

- 首帧命令立即入队（同步 push——无需等待）——async 组件 resolve 后增量
  续推——stream 关闭 = 渲染完成——无占位/无补渲染/无 resolve 回调
- create 携带 attrs——HTML 开标签在 create 时即吐（属性齐——不依赖后续
  setProp——流式 SSR 的前提）
- close 命令——diff 树遍历离开子树时发出——流式 HTML 闭合时机
- setProp 只承载运行时面（事件/ref/property——不可序列化——服务端 no-op）
- 客户端 apply：create 建元素（attrs 静态面一次设置——事件经 setProp 绑定）

### 服务端（流式 SSR——与客户端同构）

- `commandToHtml(): TransformStream<Command, string>`——command → HTML 片段
  （create → `<div class="x">`、close → `</div>`、createText → 转义文本、
  remove/insert/事件 setProp → 无输出、done → 终止）
- `res.body.pipeThrough(commandToHtml())` → 直接作为 HTTP 响应体——
  **流式 SSR**（边构建边吐 HTML——React Fizz 同模式）
- `__DATA__` 种子：done 前注入（ctx.data.seed()——序列化进流尾部脚本）
- res.headers 直接映射 HTTP 响应头；redirect = status 3xx + Location

## 4. 派生能力（原生白拿）

| 能力 | 机制 |
|---|---|
| redirect/导航 | `Response.redirect()` / status 3xx + Location（客户端检测 → navigate） |
| 状态码 | `new Response(stream, { status: 404 })`——notFound 语义 |
| 中间件改写 | 守卫拦截返回空流 + 302——body/status/headers 全可换 |
| SSR 头注入 | res.headers → HTTP 响应头 |
| 流式 SSR | commandToHtml 增量吐 HTML |

## 5. 模块划分（src/client/vdom/）

```
index.ts        ← 公共面（h/jsx、uiServe、UIRouter——实现完成后接通）
core/
  vnode.ts      ← VNode/Component/RenderFn + h/jsx + childrenOf + Fragment/Portal 符号（已实现）
  commands.ts   ← Command 类型 + 测试
  render.ts     ← renderToStream（vnode → ReadableStream<Command>——diff/apply）
  html.ts       ← commandToHtml TransformStream（流式 SSR）
  router.ts     ← UIRouter（共享核心——Trie + 链）
  serve.ts      ← uiServe（客户端消费 + 服务端消费——双端一体）
context/Ctx.ts  ← Ctx/DataPipe（已实现）
hooks/          ← ctx.ui.useXXX（独立实现）
browser/        ← 浏览器环境 API（独立实现）
middlewares/    ← ctx 注入中间件（api/auth/ws/i18n——独立实现）
```

## 6. 实施顺序

1. core/vnode.ts + context/Ctx.ts（已完成——6 测试）
2. core/commands.ts + render.ts（命令流——首帧同步 + 增量）
3. shared/router 核心提取（Trie + 链）——UIRouter 构建其上
4. core/html.ts（commandToHtml——流式 SSR）
5. serve.ts（uiServe 双端）——index.ts 接通——契约验收（vdom-x 引擎入口切换）
6. hooks/browser/middlewares 独立实现——组件库测试迁移——替换 ui-dom
