# serve + router 生产级健壮性计划

## 目标

从「能跑」到「出故障也能安全降级」。不改 API，只加保护。

---

## 一、serve.ts — 优雅关闭

### 当前行为

```ts
stop() {
  server.close()  // 立即断开所有连接
}
```

部署重启时（滚动更新、蓝绿切换），正在处理中的请求被强制中断。客户端看到 `ECONNRESET`。

### 目标行为

```
stop() → 不再接受新连接 → 等待现有请求完成（最多 N 秒）→ 强制关闭
```

Node.js `server.close()` 已经停止接受新连接，但不会主动断开现有连接。问题在于 `server.close()` 是异步的——需要等所有连接自然结束。当前代码没有等待这个过程。

### 方案

```ts
stop(timeoutMs = 10_000): Promise<void> {
  // 1. 停止接受新连接
  server.close()

  // 2. 等待现有连接完成，或超时强制关闭
  const grace = new Promise<void>((resolve) => {
    server.closeIdleConnections?.()  // Node 18.2+
    const timer = setTimeout(() => {
      // 超时 → 强制关闭所有连接
      for (const socket of connections) socket.destroy()
      resolve()
    }, timeoutMs)
    server.on('close', () => {
      clearTimeout(timer)
      resolve()
    })
  })

  // 3. 清理信号处理器
  if (shutdownHandler) { ... }

  return grace
}
```

### 新增 API（向后兼容）

| 变更                                  | 说明                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `stop()` → `stop(timeoutMs?: number)` | 可选超时参数，默认 10s                                                                 |
| `stop()` 返回 `Promise<void>`         | 当前返回 `void`，改为 `Promise<void>`——现有 `server.stop()` 调用不需要 await，向后兼容 |

### 影响

- 部署重启零丢请求
- 蓝绿部署切流量更安全

---

## 二、serve.ts — 连接超时

### 当前行为

没有 `server.timeout`，慢客户端（slowloris 攻击或移动弱网）可以无限占用连接。

### 方案

```ts
// serve() 中：
const server = http.createServer(...)
server.timeout = options?.timeout ?? 30_000  // 默认 30s
server.keepAliveTimeout = options?.keepAliveTimeout ?? 5_000
server.headersTimeout = options?.headersTimeout ?? 6_000
```

| 选项               | 默认值   | 说明                                           |
| ------------------ | -------- | ---------------------------------------------- |
| `timeout`          | `30_000` | 请求总超时（含 body 读取），超时后 socket 销毁 |
| `keepAliveTimeout` | `5_000`  | Keep-Alive 连接空闲超时                        |
| `headersTimeout`   | `6_000`  | 等待请求头超时（必须 > keepAliveTimeout）      |

### 向后兼容

默认值兼容 99% 场景。现有代码零改动。慢请求场景（文件上传、LLM 流式）通过 `ServeOptions` 覆盖：

```ts
serve(handler, { timeout: 120_000 }) // 2 分钟超时
```

---

## 三、serve.ts — 默认 body 大小限制

### 当前行为

不设置 `maxBodySize` 时无限制。攻击者发送无限大的 body → 内存耗尽。

### 方案

```ts
const DEFAULT_MAX_BODY = 10 * 1024 * 1024 // 10MB

// readBody 中：
const limit = maxSize ?? DEFAULT_MAX_BODY
```

### 向后兼容

**此为破坏性变更**——现有应用如果接受 >10MB 的 body，需要显式设置 `maxBodySize`。提供明确文档和迁移指南。

---

## 四、serve.ts — sendResponse 流错误处理

### 当前行为

```ts
try {
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
} finally {
  reader.releaseLock()
}
res.end()
```

如果 `res.write(value)` 失败（客户端断开），错误被吞掉，`res.end()` 仍然执行——写入已关闭的 socket。

### 方案

```ts
try {
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    res.write(value)
  }
  res.end()
} catch (err) {
  // 客户端断开或写入失败——静默处理
  if (!res.destroyed) {
    res.destroy(err instanceof Error ? err : undefined)
  }
} finally {
  reader.releaseLock()
}
```

---

## 五、router.ts — 路由冲突警告

### 当前行为

```ts
app.get('/api/users', handler1)
app.get('/api/users', handler2) // 静默覆盖 handler1
```

没有任何警告，调试非常困难。

### 方案

```ts
// _routeImpl 中：
if (node.handlers.has(method)) {
  const existingPath = findPath(root, node) // 重建路由路径用于日志
  console.warn(
    `Route conflict: ${method} ${path} overwrites existing handler at ${method} ${existingPath}`,
  )
}
node.handlers.set(method, handler)
```

### 影响

零运行时开销（仅注册时检查），开发阶段立即发现路由冲突。

---

## 六、router.ts — 中间件防护

### 6.1 重复调用 next() 检测

```ts
// Middleware 中:
return next(req, ctx) // ✅ 正确

// 但有人会写:
await next(req, ctx)
return new Response('extra') // ❌ next() 已经返回了响应
```

问题：next() 内部走了完整的剩余中间件链和 handler，返回了 Response。外部代码又返回一个新的 Response，两者冲突。

**方案**：在 `runChainLoop` 中加标记：

```ts
let _called = false
const dispatch: Handler = (r, c) => {
  if (_called) {
    console.warn('[router] next() called more than once in middleware')
    return Promise.resolve(new Response('Internal Server Error', { status: 500 }))
  }
  _called = true
  if (idx < mws.length) return mws[idx++](r, c, dispatch as any)
  return finalHandler(r, c)
}
return Promise.resolve(dispatch(req, ctx))
```

### 6.2 未调用 next() 超时

Middleware 必须调用 `next()` 才能继续。如果某个中间件忘记调用 `next()`（例如条件分支漏了），请求会永远挂起。

**方案**：全局超时保护（与 serve 的 `timeout` 配合即可，server 级别已经覆盖）。

如果中间件不调用 `next()` 也不返回 Response，Node HTTP server 的 `timeout` 最终会触发 → 连接关闭。

### 6.3 中间件返回 undefined

```ts
app.use(async (req, ctx, next) => {
  // 忘记 return
  await next(req, ctx)
})
```

中间件应该 `return next(req, ctx)`，如果写 `await next(req, ctx)` 而不 `return`，函数返回 `undefined`。

**方案**：检测 undefined 返回值并警告：

在 `runChainLoop` 中 middleware 调用后检查返回值。

---

## 七、实施优先级 & 顺序

```
第一轮（保护性，0.21.0）：
  1. 默认 maxBodySize 10MB        [破坏性变更，需文档]
  2. 连接超时 (timeout/keepAlive)  [零破坏]
  3. sendResponse 流错误处理      [零破坏]

第二轮（可观测性）：
  4. 路由冲突警告                 [零破坏]
  5. 重复 next() 检测             [零破坏]

第三轮（部署友好）：
  6. 优雅关闭                     [stop() 签名微调]
```

---

## 八、不做的事

| 不做                           | 理由                                                  |
| ------------------------------ | ----------------------------------------------------- |
| 限流内置                       | 已有 `rateLimit()` 中间件                             |
| 请求体大小以外的 DoS 防护      | 应用层应该由反向代理（nginx/Caddy）处理               |
| HTTP/2 原生支持                | Node.js `http2` 模块 API 差异大，用反向代理终止更实际 |
| 中间件超时独立于 serve timeout | 复杂度 > 收益，serve 级别的 timeout 已覆盖            |
| 参数名冲突运行时检测           | 注册时静态检测足够，运行时检测开销大                  |
