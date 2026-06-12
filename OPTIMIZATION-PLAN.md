# weifuwu serve + router 优化计划

## 优化原则

1. **改热路径，不改冷路径** — 只优化每个请求都会执行的代码
2. **删除，不要添加** — 优先删掉不必要的操作，而不是加缓存层
3. **可测量** — 每项优化有 before/after 行为描述，不做玄学优化
4. **不破坏 API** — 对外接口零变化

---

## 一、serve.ts — trace header 注入去重

### 当前行为

```ts
// serve() 请求处理中：
const response = await runWithTrace(incomingTrace, async () => {
  // ... handler 返回 response
  const traceId = incomingTrace || currentTraceId()
  if (traceId && !response.headers.has('X-Trace-Id')) {
    const headers = new Headers(response.headers)  // ① 克隆 headers
    headers.set('X-Trace-Id', traceId)
    return new Response(response.body, {           // ② 重新包装 Response
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
  return response
})
await sendResponse(res, response)
```

**问题**：每次请求都创建一个新 `Response` + 新 `Headers` 对象，只为加一个 header。对于 `new Response('{"ok":true}')` 这种静态 body，Node.js 内部可能拷贝 body buffer。

**开销**：每请求多 2 次对象分配 + 可能的 body 拷贝。

### 优化方案

把 trace header 注入从 `serve()` 移到 `sendResponse()`，直接在 `res.writeHead()` 前写入 headers 对象：

```ts
// serve() 简化——不再碰 response：
const response = await runWithTrace(incomingTrace, async () => {
  const body = await readBody(req, options?.maxBodySize)
  const [request, query] = createRequest(req, body)
  return handler(request, { params: {}, query } as Context)
})
await sendResponse(res, response, { traceId: incomingTrace })

// sendResponse() 内部——在写头之前直接注入：
export async function sendResponse(
  res: ServerResponse,
  response: Response,
  opts?: { traceId?: string | null },
): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, key) => {
    // ... existing set-cookie dedup logic
  })

  // Inject trace header — zero allocation on the response object
  if (opts?.traceId && !headers['x-trace-id']) {
    headers['x-trace-id'] = opts.traceId
  }

  res.writeHead(response.status, response.statusText, headers)
  // ... rest unchanged
}
```

### 效果

| | Before | After |
|---|---|---|
| 每请求 Response 构造 | 1-2 次 | 1 次 |
| 每请求 Headers 克隆 | 0-1 次 | 0 次 |
| traceId 注入方式 | 重新包装 Response | 写入 headers 对象 |

---

## 二、serve.ts — 500 错误日志

### 当前行为

```ts
catch (err) {
  if (err instanceof HttpError && err.status === 413) {
    res.writeHead(413, ...)
    res.end('Request Body Too Large')
    return
  }
  res.writeHead(500, ...)
  res.end('Internal Server Error')  // ← 无声无息
}
```

**问题**：生产环境 500 错误没有任何日志。不知道是哪个请求、什么错误、traceId 是什么。

### 优化方案

```ts
catch (err) {
  if (err instanceof HttpError && err.status === 413) {
    res.writeHead(413, ...)
    res.end('Request Body Too Large')
    return
  }
  // Log with trace context
  const msg = err instanceof Error ? err.message : String(err)
  console.error(`[${currentTraceId()}] unhandled error: ${msg}`, err instanceof Error ? err.stack : '')
  res.writeHead(500, ...)
  res.end('Internal Server Error')
}
```

### 效果

生产环境 500 错误可追踪到具体请求（traceId）+ 具体堆栈。

---

## 三、serve.ts — server.address() 缓存

### 当前行为

```ts
get port() {
  const addr = server.address()  // ← 每次访问 port 都调系统调用
  if (!addr || typeof addr === 'string') return 0
  return addr.port
}
get hostname() {
  const addr = server.address()  // ← 同上
  // ...
}
```

`server.address()` 在 Node.js 内部会调用 `getsockname()` 系统调用。虽然很快（微秒级），但 `port` 和 `hostname` 在 `listen` 回调后就固定了。

### 优化方案

在 `server.listen` 的回调里缓存：

```ts
let cachedPort = 0
let cachedHostname = ''

server.listen(port, hostname, () => {
  const addr = server.address()
  if (addr && typeof addr !== 'string') {
    cachedPort = addr.port
    cachedHostname = addr.address
  }
  resolveReady()
})

return {
  get port() { return cachedPort },
  get hostname() { return cachedHostname || hostname },
  // ...
}
```

### 效果

访问 `server.port` 从系统调用 → 内存读取。

---

## 四、router.ts — matchTrie 热路径微优化

### 当前行为

```ts
private matchTrie(method: string, segments: string[]): ... {
  let node = this.root
  const params: Record<string, string> = {}
  const pathMws: Middleware[] = []
  let wildcardHandler: Handler | null = null
  let wildcardMws: Middleware[] = []
  let wildcardIdx = -1

  for (let i = 0; i < segments.length; i++) {
    pathMws.push(...node.pathMws)  // ①

    if (node.wildcard) {            // ②
      const h = node.handlers.get('*') || node.handlers.get(method)
      if (h) {
        wildcardHandler = h
        wildcardMws = node.middlewares.get(method) || node.middlewares.get('*') || []
        wildcardIdx = i
      }
    }

    const segment = segments[i]
    const next = matchChild(node, segment, params, false)
    if (!next) {
      if (wildcardHandler) {
        params['*'] = segments.slice(wildcardIdx).join('/')
        return { handler: wildcardHandler, middlewares: wildcardMws, pathMws, params }
      }
      return null
    }
    node = next
  }
  // ...
}
```

**问题点 ①**：`pathMws.push(...node.pathMws)` — 每个 trie 层级都展开数组。如果 pathMws 在每个 node 上都是空数组 `[]`（绝大多数路由没有路径级中间件），这些 push 就是空操作。但对于有 layout 中间件的 SSR 路由，每层可能有中间件。

`push(...[])` 在 V8 中是零分配（fast path for empty spread）。所以实际上无害。

**问题点 ②**：`if (node.wildcard)` — 每个 trie node 都检查。这个 boolean 检查本身开销可忽略（< 1ns）。但如果整个路由表没有 `*` 路由，这个分支永远不会进。

### 优化方案

加一个 Router 级别的 `_hasWildcard` 标记，注册 `*` 路由时设为 true。matchTrie 只在标记为 true 时才走 wildcard 逻辑：

```ts
private _hasWildcard = false

// _route() 中注册 wildcard 时：
if (segment === '*') {
  this._hasWildcard = true
  // ...
}

// matchTrie() 中：
if (this._hasWildcard && node.wildcard) { ... }
```

**收益**：对于无 wildcard 的应用（大部分 API-only 应用），每次路由匹配省 1 次 `node.wildcard` 检查 + 2 次 `Map.get()` 调用。微优化，但零成本。

---

## 五、router.ts — _route 内部 as any 清理

### 当前行为

```ts
private _route(method: string, path: string, ...args: [...Middleware<T, T>[], Handler<T> | Router<any>]): Router<T> {
  // ...
  node.handlers.set(method, handler as Handler)
  if (middlewares.length > 0) node.middlewares.set(method, middlewares)
  return this
}

// _mountRouter 调用时：
this._route(method as any, base + path, ...(allExtra as any), ...(middlewares as any), handler as any)
```

**问题**：`_route` 是 `private`，只在类内部调用。`_mountRouter` 传入子路由的中间件/处理器，类型是 `Middleware[]` / `Handler`（无泛型），与 `_route` 的 `Middleware<T, T>[]` / `Handler<T>` 不兼容，需要 `as any` 强制转换。

### 优化方案

把 `_route` 的「内部版本」和「公共版本」分开：

```ts
// 公共 API 调用这个（有类型约束）
private _route(method, path, ...args) {
  return this._routeImpl(method, path, args)
}

// 内部调用这个（无类型约束，接受 any[]）
private _routeImpl(method: string, path: string, args: any[]): Router<T> {
  const last = args[args.length - 1]
  if (last instanceof Router) {
    this._mountRouter(path, last, args.slice(0, -1))
    return this
  }
  const handler = args.pop()
  const middlewares = args
  // ... trie insertion (unchanged)
}
```

这样：
- 公共方法（`get`/`post`/...）走 `_route`，保持类型安全
- `_mountRouter` 走 `_routeImpl`，无需 `as any`

**收益**：删除 12 处 `as any` / `as unknown as`，代码可读性提升。

---

## 六、不做的事

| 不做 | 理由 |
|------|------|
| `mergeMws` 缓存 | 增加版本号跟踪的复杂度，实际收益几乎为零（globalMws 通常 ≤ 5 个） |
| `runChainLoop` 改迭代 | 递归 Promise 链在中间件 ≤ 10000 时不会栈溢出。实际不会超过 50 个 |
| `handler()` 预计算闭包 | 典型用法只调一次 `handler()`。测试里多次调用也不影响性能 |
| Trie 压缩（radix tree） | URL 段通常很短（1-3 段），压缩收益不明显，但代码复杂度翻倍 |
| `sendResponse` 流式优化 | `getReader()` + `while(true)` 循环已经是最优的流式消费方式 |
| `readBody` 与 `createRequest` 合并 | 职责分离是好的设计，合并后更难测试 |

---

## 实施顺序

```
第一轮（serve.ts 3 项）：
  1. trace header 移入 sendResponse
  2. 500 错误加日志
  3. server.address() 缓存

第二轮（router.ts 2 项）：
  4. matchTrie wildcard 快速路径
  5. _route/_routeImpl 分离，清理 as any
```

每轮预计 30 分钟，改动量小、风险低、可独立验证。
