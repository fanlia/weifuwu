// src/types.ts
var HttpError = class extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
};

// src/core/trace.ts
import crypto2 from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
var als = new AsyncLocalStorage();
function currentTraceId() {
  return als.getStore()?.traceId;
}
function currentTrace() {
  return als.getStore();
}
function runWithTrace(incomingTraceId, fn) {
  const traceId = incomingTraceId || crypto2.randomUUID();
  const startTime = Date.now();
  return als.run({ traceId, startTime }, fn);
}
function traceElapsed() {
  const ctx = als.getStore();
  if (!ctx) return 0;
  return Date.now() - ctx.startTime;
}
function trace(options) {
  const header = options?.header ?? "X-Request-ID";
  const gen = options?.generator ?? (() => crypto2.randomUUID());
  return async (req, ctx, next) => {
    const existing = req.headers.get(header);
    const requestId2 = existing ?? gen();
    const tc = als.getStore();
    ctx.trace = {
      requestId: requestId2,
      traceId: tc?.traceId ?? requestId2,
      startTime: tc?.startTime ?? Date.now(),
      elapsed: () => {
        const t = als.getStore();
        return t ? Date.now() - t.startTime : 0;
      }
    };
    const res = await next(req, ctx);
    if (res.headers.has(header)) return res;
    const h = new Headers(res.headers);
    h.set(header, requestId2);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  };
}

// src/core/env.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
var PUBLIC_PREFIX = "WEIFUWU_PUBLIC_";
function getPublicEnv() {
  const result = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(PUBLIC_PREFIX) && value !== void 0) {
      result[key.slice(PUBLIC_PREFIX.length)] = value;
    }
  }
  return result;
}
function isBundled() {
  return typeof __WFW_BUNDLED__ !== "undefined" ? __WFW_BUNDLED__ : false;
}
function isDev() {
  const env2 = process.env.NODE_ENV;
  return env2 !== "production" && env2 !== "test";
}
function isProd() {
  return process.env.NODE_ENV === "production";
}
function loadEnv(path) {
  const filePath = resolve(process.cwd(), path ?? ".env");
  let content;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch {
    return;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    if (!key) continue;
    if (process.env[key] !== void 0) continue;
    let value = trimmed.slice(eqIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else {
      const commentIdx = value.search(/\s#/);
      if (commentIdx !== -1) {
        value = value.slice(0, commentIdx).trimEnd();
      }
    }
    process.env[key] = value;
  }
}
function env() {
  const entries = getPublicEnv();
  return async (req, ctx, next) => {
    ;
    ctx.env = entries;
    return next(req, ctx);
  };
}

// src/core/serve.ts
import http from "node:http";
var DEFAULT_MAX_BODY = 10 * 1024 * 1024;
async function readBody(req, maxSize) {
  const limit = maxSize ?? DEFAULT_MAX_BODY;
  if (limit > 0) {
    const cl = parseInt(req.headers["content-length"] ?? "0", 10);
    if (cl > limit) throw new HttpError("Request body too large", 413);
  }
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.byteLength;
    if (limit > 0 && total > limit) throw new HttpError("Request body too large", 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function createRequest(req, body) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const query = Object.fromEntries(url.searchParams);
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== void 0) {
      headers[key] = Array.isArray(value) ? value.join(", ") : value;
    }
  }
  const request = new Request(url.href, {
    method: req.method?.toUpperCase() ?? "GET",
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" && body.length > 0 ? body : null
  });
  return [request, query];
}
async function sendResponse(res, response, opts) {
  const headers = {};
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      const existing = headers[key];
      headers[key] = existing ? Array.isArray(existing) ? [...existing, value] : [existing, value] : value;
    } else {
      headers[key] = value;
    }
  });
  if (opts?.traceId && !headers["x-trace-id"]) {
    headers["x-trace-id"] = opts.traceId;
  }
  res.writeHead(response.status, response.statusText, headers);
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
    } catch (err) {
      if (!res.destroyed) {
        res.destroy(err instanceof Error ? err : void 0);
      }
    } finally {
      reader.releaseLock();
    }
    return;
  }
  res.end();
}
async function createTestServer(router, options) {
  const server = serve(router, { ...options, port: options?.port ?? 0, shutdown: false });
  await server.ready;
  return { server, url: `http://localhost:${server.port}` };
}
function serve(router, options) {
  const ws = router.websocketHandler();
  const handler = router.handler();
  const port = options?.port ?? 0;
  const hostname = options?.hostname ?? "0.0.0.0";
  const server = http.createServer(async (req, res) => {
    const incomingTrace = req.headers["x-trace-id"] || req.headers["traceparent"]?.split("-")[1] || null;
    await runWithTrace(incomingTrace, async () => {
      try {
        const body = await readBody(req, options?.maxBodySize);
        const [request, query] = createRequest(req, body);
        const response = await handler(request, { params: {}, query });
        await sendResponse(res, response, { traceId: currentTraceId() });
      } catch (err) {
        if (err instanceof HttpError && err.status === 413) {
          res.writeHead(413, { "Content-Type": "text/plain" });
          res.end("Request Body Too Large");
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[${currentTraceId()}] unhandled error: ${msg}`);
        if (err instanceof Error && err.stack) console.error(err.stack);
        res.writeHead(500, { "Content-Type": "text/plain" });
        res.end("Internal Server Error");
      }
    });
  });
  server.timeout = options?.timeout ?? 3e4;
  server.keepAliveTimeout = options?.keepAliveTimeout ?? 5e3;
  server.headersTimeout = options?.headersTimeout ?? 6e3;
  server.on("upgrade", ws);
  let resolveReady;
  const ready = new Promise((r) => {
    resolveReady = r;
  });
  let shutdownHandler = null;
  if (options?.shutdown !== false) {
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      server.close();
      const timer = setTimeout(() => {
        server.closeAllConnections();
        process.exit(0);
      }, 1e4);
      server.on("close", () => {
        clearTimeout(timer);
        process.exit(0);
      });
    };
    shutdownHandler = shutdown;
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
  }
  let _cachedPort = 0;
  let _cachedHostname = "";
  if (options?.signal) {
    if (options.signal.aborted) {
      _cachedPort = 0;
      _cachedHostname = "";
      server.close();
      resolveReady();
      return {
        stop: () => Promise.resolve(),
        close: () => Promise.resolve(),
        ready,
        get port() {
          return 0;
        },
        get hostname() {
          return hostname;
        }
      };
    }
    options.signal.addEventListener(
      "abort",
      () => {
        server.close();
      },
      { once: true }
    );
  }
  server.on("error", (err) => {
    console.error("Failed to start server:", err.message);
    server.close();
    _cachedPort = 0;
    resolveReady();
  });
  server.listen(port, hostname, () => {
    const addr = server.address();
    if (addr && typeof addr !== "string") {
      _cachedPort = addr.port;
      _cachedHostname = addr.address;
    }
    resolveReady();
    const displayHost = _cachedHostname === "0.0.0.0" ? "localhost" : _cachedHostname || "localhost";
    console.log(`weifuwu listening on http://${displayHost}:${_cachedPort}`);
  });
  async function stop(timeoutMs = 1e4) {
    if (shutdownHandler) {
      process.off("SIGTERM", shutdownHandler);
      process.off("SIGINT", shutdownHandler);
      shutdownHandler = null;
    }
    if (!server.listening) return;
    server.close();
    server.closeIdleConnections();
    return new Promise((resolve4) => {
      const timer = setTimeout(() => {
        server.closeAllConnections();
        resolve4();
      }, timeoutMs);
      server.on("close", () => {
        clearTimeout(timer);
        resolve4();
      });
    });
  }
  return {
    close: stop,
    stop,
    ready,
    get port() {
      if (!server.listening) return 0;
      return _cachedPort;
    },
    get hostname() {
      if (!server.listening) return hostname;
      return _cachedHostname || hostname;
    }
  };
}

// src/core/router.ts
import { WebSocketServer } from "ws";

// src/hub.ts
function createHub(opts) {
  const prefix = opts?.prefix ?? "hub:";
  const channels = /* @__PURE__ */ new Map();
  const wsKeys = /* @__PURE__ */ new Map();
  let redisPub;
  let redisSub = null;
  if (opts?.redis) {
    redisPub = opts.redis;
    redisSub = opts.redis.duplicate();
    redisSub.on("message", (rawChannel, rawData) => {
      if (!rawChannel.startsWith(prefix)) return;
      const key = rawChannel.slice(prefix.length);
      const members = channels.get(key);
      if (!members) return;
      for (const ws of members) {
        try {
          ws.send(rawData);
        } catch {
        }
      }
    });
  }
  function join3(key, ws) {
    if (!channels.has(key)) {
      channels.set(key, /* @__PURE__ */ new Set());
      redisSub?.subscribe(`${prefix}${key}`);
    }
    channels.get(key).add(ws);
    let keys = wsKeys.get(ws);
    if (!keys) {
      keys = /* @__PURE__ */ new Set();
      wsKeys.set(ws, keys);
    }
    keys.add(key);
    if (typeof ws.addEventListener === "function") {
      ws.addEventListener("close", () => removeFromChannels(ws));
      ws.addEventListener("error", () => removeFromChannels(ws));
    }
  }
  function removeFromChannels(ws) {
    const keys = wsKeys.get(ws);
    if (keys) {
      for (const key of keys) {
        const members = channels.get(key);
        if (members) {
          members.delete(ws);
          if (members.size === 0) channels.delete(key);
        }
      }
      wsKeys.delete(ws);
    }
  }
  function leave(ws) {
    removeFromChannels(ws);
  }
  function broadcast(key, data) {
    const msg = JSON.stringify(data);
    const members = channels.get(key);
    if (members) {
      const dead = [];
      for (const ws of members) {
        try {
          ws.send(msg);
        } catch {
          dead.push(ws);
        }
      }
      for (const ws of dead) removeFromChannels(ws);
    }
    redisPub?.publish(`${prefix}${key}`, msg);
  }
  async function close() {
    for (const ws of wsKeys.keys()) {
      removeFromChannels(ws);
    }
    channels.clear();
    wsKeys.clear();
    if (redisSub) {
      redisSub.removeAllListeners("message");
      await redisSub.quit();
    }
    redisPub = void 0;
    redisSub = null;
  }
  return { join: join3, leave, broadcast, close };
}

// src/core/router.ts
var createTrieNode = () => ({
  children: /* @__PURE__ */ new Map(),
  handlers: /* @__PURE__ */ new Map(),
  middlewares: /* @__PURE__ */ new Map()
});
var createWsNode = () => ({
  children: /* @__PURE__ */ new Map(),
  middlewares: []
});
function createParamChild(node, segment, createNode) {
  const paramName = segment.slice(1);
  if (!node.children.has(":")) {
    const child2 = createNode();
    child2.param = paramName;
    node.children.set(":", child2);
  }
  const child = node.children.get(":");
  if (child.param !== paramName) {
    throw new Error(
      `Param name conflict: ":${child.param}" already registered, cannot register ":"${paramName}"`
    );
  }
  return child;
}
function getOrCreateChild(node, segment, createNode, allowWildcard) {
  if (allowWildcard && segment === "*") {
    node.wildcard = true;
    return node;
  }
  if (segment.startsWith(":")) return createParamChild(node, segment, createNode);
  if (!node.children.has(segment)) node.children.set(segment, createNode());
  return node.children.get(segment);
}
function matchChild(node, segment, params, allowWildcard = false) {
  if (node.children.has(segment)) return node.children.get(segment);
  if (node.children.has(":")) {
    const child = node.children.get(":");
    if (child.param) params[child.param] = decodeURIComponent(segment);
    return child;
  }
  if (allowWildcard && node.wildcard) return node;
  return null;
}
var Router = class _Router {
  root = createTrieNode();
  wsRoot = createWsNode();
  globalMws = [];
  errorHandler;
  _hasWildcard = false;
  _hub;
  _wss;
  /** Track which ctx fields have been injected so far (for dependency checking). */
  _ctxFields = /* @__PURE__ */ new Set();
  get wss() {
    if (!this._wss) this._wss = new WebSocketServer({ noServer: true });
    return this._wss;
  }
  get hub() {
    if (!this._hub) this._hub = createHub();
    return this._hub;
  }
  /** Inject a custom hub (e.g. with Redis for cross-process broadcast). */
  wsHub(hub) {
    this._hub = hub;
    return this;
  }
  use(arg1) {
    this.globalMws.push(arg1);
    this._checkMiddlewareMeta(arg1, "global");
    return this;
  }
  /**
   * Mount a sub-router at the given path prefix.
   * All routes from the sub-router are registered with the prefix.
   *
   * ```ts
   * const admin = new Router()
   * admin.get('/dashboard', handler)
   * app.mount('/admin', admin)  // → GET /admin/dashboard
   * ```
   */
  mount(path, router) {
    this._mountRouter(path, router);
    return this;
  }
  /**
   * Check a middleware's dependency metadata and emit warnings if
   * required fields haven't been injected yet.
   * Attach __meta to a middleware function:
   *
   * ```ts
   * mw.__meta = { injects: ['sql'], depends: ['session'] }
   * ```
   */
  _checkMiddlewareMeta(mw, location) {
    const meta = mw.__meta ?? (typeof mw === "object" && mw && "middleware" in mw ? mw.middleware().__meta : void 0);
    if (!meta) return;
    for (const dep of meta.depends) {
      if (!this._ctxFields.has(dep)) {
        console.warn(
          `[weifuwu] Middleware at "${location}" depends on ctx.${dep} but it hasn't been registered yet.
  Register the provider before this middleware:
    app.use(${dep}())  // add before this middleware
  Current ctx fields: [${[...this._ctxFields].join(", ")}]`
        );
      }
    }
    for (const field of meta.injects) {
      this._ctxFields.add(field);
    }
  }
  // Route registration — returns Router<T> unchanged.
  // Route-level middleware and handlers get Context<T>.
  get(path, ...args) {
    return this._route("GET", path, ...args);
  }
  post(path, ...args) {
    return this._route("POST", path, ...args);
  }
  put(path, ...args) {
    return this._route("PUT", path, ...args);
  }
  delete(path, ...args) {
    return this._route("DELETE", path, ...args);
  }
  patch(path, ...args) {
    return this._route("PATCH", path, ...args);
  }
  head(path, ...args) {
    return this._route("HEAD", path, ...args);
  }
  options(path, ...args) {
    return this._route("OPTIONS", path, ...args);
  }
  all(path, ...args) {
    return this._route("*", path, ...args);
  }
  onError(handler) {
    this.errorHandler = handler;
    return this;
  }
  _route(method, path, ...args) {
    return this._routeImpl(method, path, args);
  }
  /** Internal route registration — no type constraints (used by _mountRouter). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _routeImpl(method, path, args) {
    const last = args[args.length - 1];
    if (last instanceof _Router) {
      this._mountRouter(path, last, args.slice(0, -1));
      return this;
    }
    const handler = args.pop();
    const middlewares = args;
    const segments = this.splitPath(path);
    let node = this.root;
    for (const segment of segments) {
      if (segment === "*") {
        this._hasWildcard = true;
        const remaining = segments.indexOf("*") < segments.length - 1;
        if (remaining) {
          console.warn(`Route "${path}": segments after "*" are ignored`);
        }
        node.wildcard = true;
        node.handlers.set(method, handler);
        if (middlewares.length > 0) node.middlewares.set(method, middlewares);
        return this;
      }
      node = getOrCreateChild(node, segment, createTrieNode, false);
    }
    if (!isProd() && node.handlers.has(method)) {
      console.warn(`[router] route conflict: ${method} ${path} overwrites existing handler`);
    }
    node.handlers.set(method, handler);
    if (middlewares.length > 0) node.middlewares.set(method, middlewares);
    return this;
  }
  ws(path, ...args) {
    const handler = args.pop();
    const middlewares = args;
    const segments = this.splitPath(path);
    let node = this.wsRoot;
    for (const segment of segments) {
      node = getOrCreateChild(node, segment, createWsNode, true);
    }
    node.handler = handler;
    node.middlewares = middlewares;
    return this;
  }
  handler() {
    return (req, ctx) => {
      const url = new URL(req.url);
      return this.handle(req, ctx, this.splitPath(url.pathname));
    };
  }
  /** Returns a human-readable list of all registered routes. Useful for debugging. */
  routes() {
    const result = [];
    if (this.globalMws.length > 0) {
      result.push(`MIDDLEWARE  [${this.globalMws.length} global]`);
    }
    this._collectRoutes(this.root, "", result);
    this._collectWsRoutes(this.wsRoot, "", result);
    return result;
  }
  _collectRoutes(node, prefix, result) {
    for (const [method] of node.handlers) {
      const m = method === "*" ? "ANY" : method;
      const path = (prefix || "/") + (node.wildcard ? "/*" : "");
      const middlewares = node.middlewares.get(method);
      const mwCount = middlewares ? ` (+${middlewares.length} mw)` : "";
      result.push(`${m.padEnd(7)} ${path}${mwCount}`);
    }
    for (const [seg, child] of node.children) {
      const segment = seg === ":" ? `:${child.param}` : seg;
      this._collectRoutes(child, prefix + "/" + segment, result);
    }
  }
  _collectWsRoutes(node, prefix, result) {
    if (node.handler) {
      const path = prefix || "/";
      const mwCount = node.middlewares.length ? ` (+${node.middlewares.length} mw)` : "";
      result.push(`WS       ${path}${mwCount}`);
    }
    for (const [seg, child] of node.children) {
      const segment = seg === ":" ? `:${child.param}` : seg;
      this._collectWsRoutes(child, prefix + "/" + segment, result);
    }
  }
  websocketHandler() {
    const wsRoot = this.wsRoot;
    const router = this;
    return (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      const segments = url.pathname.split("/").filter(Boolean);
      const match = router.matchWsTrie(wsRoot, segments);
      if (!match) {
        socket.destroy();
        return;
      }
      const query = Object.fromEntries(url.searchParams);
      const ctx = { params: match.params, query };
      const allMws = router.globalMws.length === 0 && match.middlewares.length === 0 ? [] : [...router.globalMws, ...match.middlewares];
      if (allMws.length === 0) {
        upgradeSocket(router.wss, req, socket, head, match.handler, ctx, router.hub);
        return;
      }
      const finalHandler = () => {
        try {
          upgradeSocket(router.wss, req, socket, head, match.handler, ctx, router.hub);
        } catch {
          socket.destroy();
          return new Response("WebSocket upgrade failed", { status: 500 });
        }
        return new Response(null, { status: 200 });
      };
      const webReq = new Request(url.href, {
        method: req.method ?? "GET",
        headers: nodeReqHeadersToRecord(req.headers)
      });
      void router.runChain(allMws, finalHandler, webReq, ctx).then((result) => {
        if (result.status >= 400) {
          sendHttpResponseOnSocket(socket, result);
        }
      }).catch((err) => {
        console.error("[router] WS middleware chain error:", err);
        socket.destroy();
      });
    };
  }
  _mountRouter(prefix, sub, extraMws = []) {
    const base = prefix === "/" ? "" : prefix.replace(/\/$/, "");
    const mountMw = (req, ctx, next) => {
      ctx.mountPath = (ctx.mountPath || "") + base;
      return next(req, ctx);
    };
    const allExtra = extraMws.length === 0 && sub.globalMws.length === 0 ? [mountMw] : [mountMw, ...extraMws, ...sub.globalMws];
    const routes = [];
    this._collect(sub.root, "", routes);
    for (const { method, path, handler, middlewares } of routes) {
      this._routeImpl(method, base + path, [...allExtra, ...middlewares, handler]);
    }
    const wsRoutes = [];
    this._collectWs(sub.wsRoot, "", wsRoutes);
    for (const { path, handler, middlewares } of wsRoutes) {
      this.ws(
        base + path,
        ...allExtra,
        ...middlewares,
        handler
      );
    }
  }
  _collect(node, prefix, result) {
    for (const [method, handler] of node.handlers) {
      const rmws = node.middlewares.get(method) || [];
      const suffix = node.wildcard ? "/*" : "";
      result.push({
        method,
        path: (prefix || "/") + suffix,
        handler,
        middlewares: [...rmws]
      });
    }
    for (const [seg, child] of node.children) {
      const next = seg === ":" ? `/:${child.param}` : `/${seg}`;
      this._collect(child, prefix + next, result);
    }
  }
  _collectWs(node, prefix, result, mwsAcc = []) {
    const mws = [...mwsAcc, ...node.middlewares];
    if (node.handler) result.push({ path: prefix || "/", handler: node.handler, middlewares: mws });
    for (const [seg, child] of node.children) {
      const next = seg === ":" ? `/:${child.param}` : `/${seg}`;
      this._collectWs(child, prefix + next, result, mws);
    }
  }
  splitPath(path) {
    return path.split("/").filter(Boolean);
  }
  matchTrie(method, segments) {
    let node = this.root;
    const params = {};
    let wildcardHandler = null;
    let wildcardMws = [];
    let wildcardIdx = -1;
    for (let i = 0; i < segments.length; i++) {
      if (this._hasWildcard && node.wildcard) {
        let h = node.handlers.get("*") || node.handlers.get(method);
        if (!h && method === "HEAD") {
          h = node.handlers.get("GET");
        }
        if (h) {
          wildcardHandler = h;
          wildcardMws = node.middlewares.get(method) || node.middlewares.get("*") || [];
          wildcardIdx = i;
        }
      }
      const segment = segments[i];
      const next = matchChild(node, segment, params, false);
      if (!next) {
        if (wildcardHandler) {
          params["*"] = segments.slice(wildcardIdx).join("/");
          return { kind: "route", handler: wildcardHandler, mws: wildcardMws, params };
        }
        return null;
      }
      node = next;
    }
    let handler = node.handlers.get(method) || node.handlers.get("*");
    if (!handler && method === "HEAD") {
      handler = node.handlers.get("GET");
    }
    if (handler) {
      if (node.wildcard) params["*"] = segments.slice(segments.length).join("/");
      return {
        kind: "route",
        handler,
        mws: node.middlewares.get(method) || node.middlewares.get("*") || [],
        params
      };
    }
    if (wildcardHandler) {
      params["*"] = segments.slice(wildcardIdx).join("/");
      return { kind: "route", handler: wildcardHandler, mws: wildcardMws, params };
    }
    if (node.handlers.size > 0) {
      return {
        kind: "not-allowed",
        methods: [...node.handlers.keys()].filter((k) => k !== "*"),
        params
      };
    }
    return null;
  }
  matchWsTrie(root, segments) {
    let node = root;
    const params = {};
    for (const segment of segments) {
      const next = matchChild(node, segment, params, true);
      if (!next) return null;
      node = next;
    }
    return node.handler ? { handler: node.handler, middlewares: node.middlewares, params } : null;
  }
  async handleError(e, req, ctx) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(err);
    return this.errorHandler ? await this.errorHandler(err, req, ctx) : new Response("Internal Server Error", { status: 500 });
  }
  _notFoundResponse(method, segments) {
    if (!isProd()) {
      return Response.json(
        { error: "Not Found", path: "/" + segments.join("/"), method },
        { status: 404 }
      );
    }
    return new Response("Not Found", { status: 404 });
  }
  async handle(req, ctx, segments) {
    const match = this.matchTrie(req.method, segments);
    if (match) {
      Object.assign(ctx.params, match.params);
      switch (match.kind) {
        case "route": {
          const mws = [...this.globalMws, ...match.mws];
          try {
            return await this.runChain(mws, match.handler, req, ctx);
          } catch (e) {
            return this.handleError(e, req, ctx);
          }
        }
        case "not-allowed": {
          if (this.globalMws.length > 0) {
            try {
              return await this.runChain(
                this.globalMws,
                () => new Response("Method Not Allowed", {
                  status: 405,
                  headers: { Allow: match.methods.join(", ") }
                }),
                req,
                ctx
              );
            } catch (e) {
              return this.handleError(e, req, ctx);
            }
          }
          return new Response("Method Not Allowed", {
            status: 405,
            headers: { Allow: match.methods.join(", ") }
          });
        }
      }
    }
    if (this.globalMws.length > 0) {
      try {
        return await this.runChain(
          this.globalMws,
          () => this._notFoundResponse(req.method, segments),
          req,
          ctx
        );
      } catch (e) {
        return this.handleError(e, req, ctx);
      }
    }
    return this._notFoundResponse(req.method, segments);
  }
  async runChain(middlewares, finalHandler, req, ctx) {
    if (middlewares.length === 0) return await finalHandler(req, ctx);
    return await runChainLoop(middlewares, 0, finalHandler, req, ctx);
  }
};
function runChainLoop(middlewares, index, finalHandler, req, ctx) {
  if (index < middlewares.length) {
    const mw = middlewares[index];
    let called = false;
    const dispatch = (r, c) => {
      if (called) {
        console.warn(
          "[router] next() called more than once in middleware \u2014 ignoring duplicate call"
        );
        return Promise.resolve(new Response("", { status: 499 }));
      }
      called = true;
      return runChainLoop(middlewares, index + 1, finalHandler, r, c);
    };
    return Promise.resolve(mw(req, ctx, dispatch));
  }
  return Promise.resolve(finalHandler(req, ctx));
}
function upgradeSocket(wss, req, socket, head, handler, ctx, hub) {
  wss.handleUpgrade(req, socket, head, (ws) => {
    const connCtx = { ...ctx, params: { ...ctx.params }, query: { ...ctx.query } };
    const wsState = {};
    connCtx.ws = {
      get state() {
        return wsState;
      },
      json(data) {
        ws.send(JSON.stringify(data));
      },
      join(room) {
        hub.join(room, ws);
      },
      leave(_room) {
        hub.leave(ws);
      },
      sendRoom(room, data) {
        hub.broadcast(room, data);
      }
    };
    if (handler.open) {
      handler.open(ws, connCtx);
    }
    ws.on("message", (data) => {
      handler.message?.(ws, connCtx, data);
    });
    ws.on("close", () => {
      hub.leave(ws);
      handler.close?.(ws, connCtx);
    });
    ws.on("error", (err) => {
      handler.error?.(ws, connCtx, err);
    });
  });
}
function nodeReqHeadersToRecord(headers) {
  const result = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v !== void 0) result[k] = Array.isArray(v) ? v.join(", ") : v;
  }
  return result;
}
function sendHttpResponseOnSocket(socket, response) {
  const statusLine = `HTTP/1.1 ${response.status} ${response.statusText}`;
  const headerLines = [statusLine];
  response.headers.forEach((value, key) => {
    headerLines.push(`${key}: ${value}`);
  });
  headerLines.push("Connection: close");
  headerLines.push("");
  const headerStr = headerLines.join("\r\n");
  response.arrayBuffer().then((buf) => {
    socket.write(headerStr + "\r\n");
    if (buf.byteLength > 0) socket.write(Buffer.from(buf));
    socket.end();
  }).catch(() => {
    socket.write(headerStr + "\r\n");
    socket.end();
  });
}

// src/core/logger.ts
function emit(event) {
  event.traceId = event.traceId ?? currentTraceId();
  event.timestamp = (/* @__PURE__ */ new Date()).toISOString();
  process.stderr.write(JSON.stringify(event) + "\n");
}
function logger(options) {
  const format = options?.format ?? "short";
  return async (req, ctx, next) => {
    const start = Date.now();
    const url = new URL(req.url);
    try {
      const res = await next(req, ctx);
      const ms = Date.now() - start;
      const pathAndQuery = format === "combined" ? url.pathname + url.search : url.pathname;
      if (format === "json") {
        emit({
          level: "info",
          message: "request",
          method: req.method,
          path: pathAndQuery,
          status: res.status,
          elapsed_ms: ms
        });
      } else {
        console.log(`${req.method} ${pathAndQuery} ${res.status} ${ms}ms`);
      }
      return res;
    } catch (err) {
      const ms = Date.now() - start;
      const pathAndQuery = format === "combined" ? url.pathname + url.search : url.pathname;
      if (format === "json") {
        emit({
          level: "error",
          message: err instanceof Error ? err.message : String(err),
          method: req.method,
          path: pathAndQuery,
          status: 500,
          elapsed_ms: ms
        });
      } else {
        console.log(`${req.method} ${pathAndQuery} 500 ${ms}ms`);
      }
      throw err;
    }
  };
}

// src/middleware/cors.ts
function cors(options) {
  const opts = {
    origin: "*",
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    ...options
  };
  function resolveOrigin(requestOrigin) {
    if (typeof opts.origin === "string") {
      if (opts.origin === "*") {
        return opts.credentials ? requestOrigin : "*";
      }
      return opts.origin;
    }
    if (Array.isArray(opts.origin)) {
      return opts.origin.includes(requestOrigin) ? requestOrigin : "";
    }
    const result = opts.origin(requestOrigin);
    if (typeof result === "boolean") return result ? requestOrigin : "";
    if (typeof result === "string") return result;
    return "";
  }
  function setCORSHeaders(res, acao) {
    if (!acao) return res;
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", acao);
    if (opts.credentials) headers.set("Access-Control-Allow-Credentials", "true");
    if (opts.exposedHeaders?.length)
      headers.set("Access-Control-Expose-Headers", opts.exposedHeaders.join(", "));
    if (acao !== "*") headers.set("Vary", "Origin");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  return (req, ctx, next) => {
    const requestOrigin = req.headers.get("origin") ?? "";
    const acao = resolveOrigin(requestOrigin);
    if (req.method === "OPTIONS" && acao) {
      const headers = new Headers();
      headers.set("Access-Control-Allow-Origin", acao);
      headers.set("Access-Control-Allow-Methods", opts.methods.join(", "));
      headers.set("Access-Control-Allow-Headers", opts.allowedHeaders.join(", "));
      if (opts.credentials) headers.set("Access-Control-Allow-Credentials", "true");
      if (opts.maxAge != null) headers.set("Access-Control-Max-Age", String(opts.maxAge));
      if (acao !== "*") headers.set("Vary", "Origin");
      return new Response(null, { status: 204, headers });
    }
    if (!acao) return next(req, ctx);
    return Promise.resolve(next(req, ctx)).then((res) => setCORSHeaders(res, acao));
  };
}

// src/middleware/static.ts
import { open, realpath } from "node:fs/promises";
import { extname, resolve as resolve2, normalize, sep } from "node:path";
import { Readable } from "node:stream";
function serveStatic(root, options) {
  const rootDir = resolve2(root);
  const opts = options ?? {};
  return async (req, ctx) => {
    const relativePath = ctx.params["*"] ?? new URL(req.url).pathname.slice(1);
    const decoded = decodeURIComponent(relativePath);
    if (decoded.includes("..") || decoded.includes("\0")) {
      return new Response("Forbidden", { status: 403 });
    }
    let filePath = normalize(resolve2(rootDir, decoded));
    if (!filePath.startsWith(rootDir + sep) && filePath !== rootDir) {
      return new Response("Forbidden", { status: 403 });
    }
    let fileHandle;
    try {
      fileHandle = await open(filePath, "r");
      let stat2 = await fileHandle.stat();
      const realPath = await realpath(filePath);
      if (!realPath.startsWith(rootDir + sep) && realPath !== rootDir) {
        await fileHandle.close();
        return new Response("Forbidden", { status: 403 });
      }
      if (stat2.isDirectory()) {
        await fileHandle.close();
        const indexFile = opts.index ?? "index.html";
        filePath = resolve2(filePath, indexFile);
        if (!filePath.startsWith(rootDir + sep)) {
          return new Response("Forbidden", { status: 403 });
        }
        fileHandle = await open(filePath, "r");
        stat2 = await fileHandle.stat();
        if (!stat2.isFile()) {
          await fileHandle.close();
          return new Response("Not Found", { status: 404 });
        }
      }
      const mimeType = MIME_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream";
      const etag = `"${stat2.ino}-${stat2.size}-${stat2.mtimeMs}"`;
      const ifNoneMatch = req.headers.get("if-none-match");
      if (ifNoneMatch === etag) {
        await fileHandle.close();
        return new Response(null, { status: 304 });
      }
      const ifModifiedSince = req.headers.get("if-modified-since");
      if (ifModifiedSince && stat2.mtimeMs <= new Date(ifModifiedSince).getTime()) {
        await fileHandle.close();
        return new Response(null, { status: 304 });
      }
      const headers = {
        "Content-Type": mimeType,
        "Content-Length": String(stat2.size),
        ETag: etag,
        "Last-Modified": stat2.mtime.toUTCString(),
        "Cache-Control": opts.immutable ? `public, max-age=${opts.maxAge ?? 31536e3}, immutable` : `public, max-age=${opts.maxAge ?? 0}`
      };
      const readStream = fileHandle.createReadStream();
      const cleanup = () => fileHandle.close().catch(() => {
      });
      readStream.on("close", cleanup);
      readStream.on("error", cleanup);
      const webStream = Readable.toWeb(readStream);
      return new Response(webStream, { headers });
    } catch (err) {
      if (fileHandle) await fileHandle.close().catch(() => {
      });
      if (err?.code === "ENOENT") {
        return new Response("Not Found", { status: 404 });
      }
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}
var MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".ts": "application/x-typescript",
  ".tsx": "application/x-typescript",
  ".md": "text/markdown; charset=utf-8",
  ".yaml": "application/x-yaml",
  ".yml": "application/x-yaml",
  ".csv": "text/csv; charset=utf-8",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav"
};

// src/middleware/validate.ts
function parseFormBody(text) {
  const params = new URLSearchParams(text);
  const result = {};
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}
function parseBody(text, ct) {
  if (ct.includes("application/x-www-form-urlencoded")) {
    return parseFormBody(text);
  }
  const isExplicitJson = ct.includes("application/json") || ct.includes("+json") || ct.includes("text/") || ct.includes("*/json");
  const isNotSpecialMultipart = !ct.includes("multipart/form-data") && !ct.includes("application/x-www-form-urlencoded");
  if (isExplicitJson || isNotSpecialMultipart) {
    try {
      return JSON.parse(text);
    } catch {
    }
  }
  return text;
}
function validate(schemas) {
  const mw = async (req, ctx, next) => {
    const parsed = {};
    const issues = [];
    if (schemas?.params) {
      const result = schemas.params.safeParse(ctx.params);
      if (result.success) {
        parsed.params = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((i) => ({
            path: ["params", ...i.path.map(String)],
            message: i.message
          }))
        );
      }
    }
    if (schemas?.query) {
      const result = schemas.query.safeParse(ctx.query);
      if (result.success) {
        parsed.query = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((i) => ({
            path: ["query", ...i.path.map(String)],
            message: i.message
          }))
        );
      }
    }
    if (schemas?.headers) {
      const rawHeaders = {};
      req.headers.forEach((v, k) => {
        rawHeaders[k] = v;
      });
      const result = schemas.headers.safeParse(rawHeaders);
      if (result.success) {
        parsed.headers = result.data;
      } else {
        issues.push(
          ...result.error.issues.map((i) => ({
            path: ["headers", ...i.path.map(String)],
            message: i.message
          }))
        );
      }
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      const ct = req.headers.get("content-type") ?? "";
      const isForm = ct.includes("application/x-www-form-urlencoded");
      if (schemas?.body || isForm) {
        if (req.body === null) {
          if (schemas?.body) {
            issues.push({ path: ["body"], message: "Request body is required" });
          }
        } else {
          const bodyText = await req.text();
          if (!bodyText) {
            if (schemas?.body) {
              issues.push({ path: ["body"], message: "Request body is required" });
            }
          } else {
            const bodyValue = parseBody(bodyText, ct);
            if (schemas?.body) {
              const result = schemas.body.safeParse(bodyValue);
              if (result.success) {
                parsed.body = result.data;
              } else {
                issues.push(
                  ...result.error.issues.map((i) => ({
                    path: ["body", ...i.path.map(String)],
                    message: i.message
                  }))
                );
              }
            } else {
              parsed.body = bodyValue;
            }
          }
        }
      }
    }
    if (issues.length > 0) {
      return Response.json({ error: "Validation failed", issues }, { status: 400 });
    }
    ctx.parsed = { ...ctx.parsed, ...parsed };
    return next(req, ctx);
  };
  mw.__meta = { injects: ["parsed"], depends: [] };
  return mw;
}

// src/core/cookie.ts
function getCookies(req) {
  const header = req.headers.get("cookie");
  if (!header) return {};
  const cookies = {};
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    let name = pair.slice(0, idx).trim();
    let value = pair.slice(idx + 1).trim();
    if (!name) continue;
    try {
      name = decodeURIComponent(name);
    } catch {
    }
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
  }
  return cookies;
}
function serializeCookie(name, value, options) {
  if (/[\x00-\x1F\x7F-\x9F;,]/.test(name) || /[\x00-\x1F\x7F-\x9F;,]/.test(value)) {
    throw new Error(`Invalid cookie name or value: contains control characters or special chars`);
  }
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];
  if (options?.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options?.expires) parts.push(`Expires=${options.expires.toUTCString()}`);
  if (options?.domain) parts.push(`Domain=${options.domain}`);
  if (options?.path) parts.push(`Path=${options.path}`);
  if (options?.httpOnly) parts.push("HttpOnly");
  if (options?.secure) parts.push("Secure");
  if (options?.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}
function setCookie(res, name, value, options) {
  const headers = new Headers(res.headers);
  headers.append("Set-Cookie", serializeCookie(name, value, options));
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}
function deleteCookie(res, name, options) {
  const headers = new Headers(res.headers);
  headers.append(
    "Set-Cookie",
    serializeCookie(name, "", {
      ...options,
      maxAge: 0,
      expires: /* @__PURE__ */ new Date(0)
    })
  );
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers
  });
}

// src/middleware/upload.ts
import { writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, extname as extname2 } from "node:path";
var extensionMimeMap = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".json": "application/json",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "application/x-typescript",
  ".tsx": "application/x-typescript"
};
function detectMimeFromExtension(filename) {
  return extensionMimeMap[extname2(filename).toLowerCase()];
}
function upload(options) {
  const saveDir = options?.dir;
  const mw = async (req, ctx, next) => {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) return next(req, ctx);
    try {
      if (saveDir) await mkdir(saveDir, { recursive: true });
    } catch (e) {
      console.error("upload: failed to create directory", saveDir, e);
      return Response.json({ error: "Server configuration error" }, { status: 500 });
    }
    let formData;
    try {
      formData = await req.formData();
    } catch {
      return Response.json({ error: "Invalid multipart data" }, { status: 400 });
    }
    const files = {};
    const fields = {};
    for (const [key, value] of formData) {
      if (value instanceof File) {
        if (options?.allowedTypes) {
          const clientOk = options.allowedTypes.includes(value.type);
          const extType = detectMimeFromExtension(value.name);
          const extOk = extType ? options.allowedTypes.includes(extType) : false;
          if (!clientOk && !extOk) {
            return Response.json({ error: `File type not allowed: ${value.type}` }, { status: 415 });
          }
        }
        if (options?.maxFileSize && value.size > options.maxFileSize) {
          return Response.json({ error: `File too large: ${value.name}` }, { status: 413 });
        }
        const buf = Buffer.from(await value.arrayBuffer());
        const uf = {
          name: value.name,
          type: value.type,
          size: buf.byteLength,
          buffer: saveDir ? void 0 : buf
        };
        if (saveDir) {
          const safeName = value.name.replace(/[/\\\0]/g, "_").replace(/\.\./g, "_");
          const filePath = join(saveDir, `${randomUUID()}-${safeName}`);
          await writeFile(filePath, buf);
          uf.path = filePath;
        }
        if (files[key]) {
          const existing = files[key];
          files[key] = Array.isArray(existing) ? [...existing, uf] : [existing, uf];
        } else {
          files[key] = uf;
        }
      } else {
        fields[key] = value;
      }
    }
    ctx.parsed = { ...ctx.parsed, files, fields };
    return next(req, ctx);
  };
  mw.__meta = { injects: ["parsed"], depends: [] };
  return mw;
}

// src/middleware/rate-limit.ts
function defaultKey(_req, _ctx) {
  const forwarded = _req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = _req.headers.get("x-real-ip");
  if (realIp) return realIp;
  const cfIp = _req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  return "global";
}
function rateLimit(options) {
  const max = options?.max ?? 100;
  const window = options?.window ?? 6e4;
  const getKey = options?.key ?? defaultKey;
  const message = options?.message ?? "Too Many Requests";
  const storeType = options?.store ?? "memory";
  if (storeType === "redis" && !options?.redis) {
    throw new Error('rateLimit: redis client required when store: "redis"');
  }
  const redis2 = options?.redis ?? null;
  const keyPrefix = options?.prefix ?? "ratelimit:";
  const MAX_ENTRIES = 1e4;
  const hits = /* @__PURE__ */ new Map();
  const interval = storeType === "memory" ? setInterval(
    () => {
      const now = Date.now();
      for (const [key, entry] of hits) {
        if (entry.reset < now) hits.delete(key);
      }
      if (hits.size > MAX_ENTRIES) {
        const toDelete = hits.size - MAX_ENTRIES;
        let deleted = 0;
        for (const key of hits.keys()) {
          if (deleted >= toDelete) break;
          hits.delete(key);
          deleted++;
        }
      }
    },
    Math.min(window, 3e4)
  ) : null;
  if (interval?.unref) interval.unref();
  async function checkAndIncrement(key) {
    const now = Date.now();
    if (storeType === "redis" && redis2) {
      const redisKey = `${keyPrefix}${key}`;
      const count = await redis2.incr(redisKey);
      if (count === 1) {
        await redis2.pexpire(redisKey, window);
      }
      const pttl = await redis2.pttl(redisKey);
      const reset = pttl > 0 ? now + pttl : now + window;
      return { count, reset };
    }
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + window });
      return { count: 1, reset: now + window };
    }
    entry.count++;
    return { count: entry.count, reset: entry.reset };
  }
  const mw = async (req, ctx, next) => {
    const key = getKey(req, ctx);
    const now = Date.now();
    const { count, reset } = await checkAndIncrement(key);
    if (count > max) {
      return new Response(message, {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((reset - now) / 1e3)),
          "X-RateLimit-Limit": String(max),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(reset / 1e3))
        }
      });
    }
    const remaining = max - count;
    const res = await next(req, ctx);
    return addRateLimitHeaders(res, max, remaining, reset);
  };
  mw.__meta = { injects: [], depends: [] };
  mw.close = async () => {
    if (interval) clearInterval(interval);
    hits.clear();
  };
  mw.stats = () => ({
    store: storeType,
    entries: storeType === "memory" ? hits.size : void 0,
    maxEntries: MAX_ENTRIES
  });
  return mw;
}
function addRateLimitHeaders(res, limit, remaining, reset) {
  const headers = new Headers(res.headers);
  headers.set("X-RateLimit-Limit", String(limit));
  headers.set("X-RateLimit-Remaining", String(remaining));
  headers.set("X-RateLimit-Reset", String(Math.ceil(reset / 1e3)));
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// src/middleware/compress.ts
import { constants, brotliCompress, gzip, deflate } from "node:zlib";
import { promisify } from "node:util";
var brotliCompressAsync = promisify(brotliCompress);
var gzipAsync = promisify(gzip);
var deflateAsync = promisify(deflate);
function compress(options) {
  const level = options?.level ?? 6;
  const threshold = options?.threshold ?? 1024;
  return async (req, ctx, next) => {
    const accept = req.headers.get("accept-encoding") ?? "";
    const encoding = accept.includes("br") ? "br" : accept.includes("gzip") ? "gzip" : accept.includes("deflate") ? "deflate" : "";
    if (!encoding) return next(req, ctx);
    const res = await next(req, ctx);
    if (res.status === 304 || res.status === 204 || res.status === 206 || res.status < 200 || res.status >= 300) {
      return res;
    }
    if (res.headers.get("content-encoding")) return res;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct || ct.startsWith("audio/") || ct.startsWith("video/") || ct.startsWith("image/") || ct === "application/zip") {
      return res;
    }
    if (!res.body) return res;
    const body = await res.bytes();
    if (body.byteLength < threshold) return res;
    let compressed;
    try {
      if (encoding === "br") {
        compressed = await brotliCompressAsync(body, {
          params: { [constants.BROTLI_PARAM_QUALITY]: Math.min(level, 11) }
        });
      } else if (encoding === "gzip") {
        compressed = await gzipAsync(body, { level: Math.min(level, 9) });
      } else {
        compressed = await deflateAsync(body, { level: Math.min(level, 9) });
      }
    } catch {
      return res;
    }
    const headers = new Headers(res.headers);
    headers.set("Content-Encoding", encoding);
    headers.set("Content-Length", String(compressed.byteLength));
    headers.delete("Content-Range");
    const existingVary = headers.get("Vary");
    headers.set("Vary", existingVary ? `${existingVary}, Accept-Encoding` : "Accept-Encoding");
    return new Response(compressed, {
      status: res.status,
      statusText: res.statusText,
      headers
    });
  };
}

// src/middleware/helmet.ts
var HEADER_MAP = {
  "Content-Security-Policy": "contentSecurityPolicy",
  "Cross-Origin-Embedder-Policy": "crossOriginEmbedderPolicy",
  "Cross-Origin-Opener-Policy": "crossOriginOpenerPolicy",
  "Cross-Origin-Resource-Policy": "crossOriginResourcePolicy",
  "Origin-Agent-Cluster": "originAgentCluster",
  "Referrer-Policy": "referrerPolicy",
  "Strict-Transport-Security": "strictTransportSecurity",
  "X-Content-Type-Options": "xContentTypeOptions",
  "X-DNS-Prefetch-Control": "xDnsPrefetchControl",
  "X-Download-Options": "xDownloadOptions",
  "X-Frame-Options": "xFrameOptions",
  "X-Permitted-Cross-Domain-Policies": "xPermittedCrossDomainPolicies",
  "X-XSS-Protection": "xXssProtection",
  "Permissions-Policy": "permissionsPolicy"
};
function helmet(options) {
  const opts = { ...DEFAULTS, ...options };
  const headers = new Headers();
  for (const [header, key] of Object.entries(HEADER_MAP)) {
    const val = opts[key];
    if (val !== false && val !== void 0) headers.set(header, val);
  }
  return async (req, ctx, next) => {
    const res = await next(req, ctx);
    const h = new Headers(res.headers);
    for (const [k, v] of headers) {
      if (!h.has(k)) h.set(k, v);
    }
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  };
}
var DEFAULTS = {
  contentSecurityPolicy: "default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests",
  crossOriginEmbedderPolicy: "require-corp",
  crossOriginOpenerPolicy: "same-origin",
  crossOriginResourcePolicy: "same-origin",
  originAgentCluster: "?1",
  referrerPolicy: "no-referrer",
  strictTransportSecurity: "max-age=15552000; includeSubDomains",
  xContentTypeOptions: "nosniff",
  xDnsPrefetchControl: "off",
  xDownloadOptions: "noopen",
  xFrameOptions: "SAMEORIGIN",
  xPermittedCrossDomainPolicies: "none",
  xXssProtection: "0",
  permissionsPolicy: "camera=(),display-capture=(),fullscreen=(),geolocation=(),microphone=()"
};

// src/middleware/request-id.ts
import crypto3 from "node:crypto";
function requestId(options) {
  const header = options?.header ?? "X-Request-ID";
  const gen = options?.generator ?? (() => crypto3.randomUUID());
  const mw = async (req, ctx, next) => {
    const existing = req.headers.get(header);
    const id = existing ?? gen();
    ctx.requestId = id;
    const res = await next(req, ctx);
    if (res.headers.has(header)) return res;
    const h = new Headers(res.headers);
    h.set(header, id);
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  };
  mw.__meta = { injects: ["requestId"], depends: [] };
  return mw;
}

// src/core/sse.ts
var encoder = new TextEncoder();
function formatSSE(event, data) {
  return `event: ${event}
data: ${JSON.stringify(data)}

`;
}
function formatSSEData(data) {
  return `data: ${JSON.stringify(data)}

`;
}
function createSSEStream(iterable, opts) {
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const event of iterable) {
            const text = event.type ? formatSSE(event.type, event) : formatSSEData(event);
            controller.enqueue(encoder.encode(text));
          }
        } catch (e) {
          if (e instanceof Error && e.name !== "AbortError") {
            controller.enqueue(encoder.encode(formatSSE("error", { error: e.message })));
          }
        } finally {
          controller.close();
        }
      }
    }),
    {
      status: opts?.status ?? 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        ...opts?.headers
      }
    }
  );
}

// src/test/test-utils.ts
import { WebSocket as WSWebSocket } from "ws";
var TestResponseImpl = class {
  response;
  constructor(response) {
    this.response = response;
  }
  get status() {
    return this.response.status;
  }
  get headers() {
    return this.response.headers;
  }
  async json() {
    return this.response.json();
  }
  async text() {
    return this.response.text();
  }
  async bytes() {
    return this.response.bytes();
  }
  async arrayBuffer() {
    return this.response.arrayBuffer();
  }
};
var TestRequest = class {
  headers = {};
  ctxMixin = {};
  bodyData = null;
  app;
  method;
  path;
  constructor(app, method, path) {
    this.app = app;
    this.method = method;
    this.path = path;
  }
  /** Set a request header */
  header(name, value) {
    this.headers[name.toLowerCase()] = value;
    return this;
  }
  /** Mix properties into ctx (simulating middleware injection) */
  with(mixin) {
    Object.assign(this.ctxMixin, mixin);
    return this;
  }
  /** Shortcut: set ctx.user */
  withUser(user) {
    ;
    this.ctxMixin.user = user;
    return this;
  }
  /** Shortcut: set ctx.tenant */
  withTenant(tenant) {
    this.ctxMixin.tenant = tenant;
    return this;
  }
  /** Set JSON request body */
  body(data) {
    this.bodyData = JSON.stringify(data);
    this.headers["content-type"] = "application/json";
    return this;
  }
  /** Set raw text body */
  rawBody(data) {
    this.bodyData = data;
    return this;
  }
  /** Send the request and return the response */
  async send() {
    const url = `http://localhost${this.path}`;
    const query = {};
    const qIdx = this.path.indexOf("?");
    if (qIdx !== -1) {
      const searchParams = new URLSearchParams(this.path.slice(qIdx));
      for (const [k, v] of searchParams) {
        query[k] = v;
      }
    }
    const request = new Request(url, {
      method: this.method,
      headers: this.headers,
      body: this.bodyData
    });
    const ctx = {
      params: {},
      query,
      ...this.ctxMixin
    };
    const handler = this.app.handler();
    const response = await handler(request, ctx);
    return new TestResponseImpl(response);
  }
};
var TestApp = class {
  router;
  wsServer = null;
  wsConnections = [];
  constructor() {
    this.router = new Router();
  }
  /**
   * Register a WebSocket handler.
   */
  ws(path, handler) {
    this.router.ws(path, handler);
    return this;
  }
  /** Get the raw Router (for advanced use). */
  get _router() {
    return this.router;
  }
  /** Add global middleware */
  use(mw) {
    this.router.use(mw);
    return this;
  }
  /** Register a GET route — supports route-level middleware via spread args. */
  get(path, ...args) {
    ;
    this.router.get(path, ...args);
    return this;
  }
  /** Register a POST route. */
  post(path, ...args) {
    ;
    this.router.post(path, ...args);
    return this;
  }
  /** Register a PUT route. */
  put(path, ...args) {
    ;
    this.router.put(path, ...args);
    return this;
  }
  /** Register a PATCH route. */
  patch(path, ...args) {
    ;
    this.router.patch(path, ...args);
    return this;
  }
  /** Register a DELETE route. */
  delete(path, ...args) {
    ;
    this.router.delete(path, ...args);
    return this;
  }
  /** Start building a GET request */
  getReq(path) {
    return new TestRequest(this, "GET", path);
  }
  /** Start building a POST request */
  postReq(path) {
    return new TestRequest(this, "POST", path);
  }
  /** Start building a PUT request */
  putReq(path) {
    return new TestRequest(this, "PUT", path);
  }
  /** Start building a PATCH request */
  patchReq(path) {
    return new TestRequest(this, "PATCH", path);
  }
  /** Start building a DELETE request */
  deleteReq(path) {
    return new TestRequest(this, "DELETE", path);
  }
  /** Get the underlying handler (for advanced usage) */
  handler() {
    return this.router.handler();
  }
  /** Start building a WebSocket connection to the given path. */
  wsReq(path) {
    return new TestWSRequest(this, path);
  }
  /**
   * Internal: ensure HTTP server is running for WebSocket connections.
   * Starts on a random port.
   */
  /* @internal */
  async _ensureServer() {
    if (this.wsServer) {
      return `http://localhost:${this.wsServer.port}`;
    }
    const wsHandler = this.router.websocketHandler();
    if (!wsHandler) {
      throw new Error(
        "No WebSocket routes registered. Use app.ws(path, handler) before calling wsReq()."
      );
    }
    this.wsServer = serve(this.router);
    await this.wsServer.ready;
    return `http://localhost:${this.wsServer.port}`;
  }
  /**
   * Internal: register a WS connection for cleanup.
   */
  /* @internal */
  _trackConnection(conn) {
    this.wsConnections.push(conn);
  }
  /**
   * Cleanup all WebSocket connections and stop the server.
   */
  async close() {
    for (const conn of this.wsConnections) {
      try {
        conn.close();
      } catch {
      }
    }
    this.wsConnections = [];
    if (this.wsServer) {
      this.wsServer.close();
      this.wsServer = null;
    }
  }
};
var TestWSRequest = class {
  app;
  path;
  _timeout = 5e3;
  constructor(app, path) {
    this.app = app;
    this.path = path;
  }
  /** Set the timeout for operations (default: 5000ms). */
  timeout(ms) {
    this._timeout = ms;
    return this;
  }
  /**
   * Connect to the WebSocket endpoint.
   * Starts a real HTTP server (random port) if not already running.
   */
  async connect() {
    const baseUrl = await this.app._ensureServer();
    const wsUrl = baseUrl.replace(/^http/, "ws") + this.path;
    const ws = new WSWebSocket(wsUrl, { handshakeTimeout: this._timeout });
    return new Promise((resolve4, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`WebSocket connection timed out after ${this._timeout}ms`));
        ws.close();
      }, this._timeout);
      ws.on("open", () => {
        clearTimeout(timer);
        const conn = new TestWSConnection(ws, this._timeout);
        this.app._trackConnection(conn);
        resolve4(conn);
      });
      ws.on("error", (err) => {
        clearTimeout(timer);
        reject(new Error(`WebSocket connection error: ${err.message}`));
      });
      ws.on("unexpected-response", (_req, res) => {
        clearTimeout(timer);
        let body = "";
        res.on("data", (chunk) => {
          body += chunk.toString();
        });
        res.on("end", () => {
          reject(new Error(`WebSocket upgrade rejected (${res.statusCode}): ${body.slice(0, 200)}`));
        });
      });
    });
  }
};
var TestWSConnection = class {
  ws;
  _timeout;
  messageQueue = [];
  resolveQueue = [];
  _closed = false;
  constructor(ws, timeout = 5e3) {
    this.ws = ws;
    this._timeout = timeout;
    ws.on("message", (data) => {
      const str = data.toString();
      if (this.resolveQueue.length > 0) {
        const resolve4 = this.resolveQueue.shift();
        resolve4(str);
      } else {
        this.messageQueue.push(str);
      }
    });
    ws.on("close", () => {
      this._closed = true;
      for (const _r of this.resolveQueue) {
      }
    });
  }
  /** Send a text message. */
  send(data) {
    this.ws.send(data);
  }
  /** Send a JSON message. */
  json(data) {
    this.ws.send(JSON.stringify(data));
  }
  /**
   * Wait for the next message. Returns the raw text.
   * Throws on timeout or if the connection is closed.
   */
  async receive(timeout) {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift();
    }
    if (this._closed) {
      throw new Error("WebSocket connection closed");
    }
    return new Promise((resolve4, reject) => {
      const timer = setTimeout(() => {
        const idx = this.resolveQueue.indexOf(resolve4);
        if (idx !== -1) this.resolveQueue.splice(idx, 1);
        reject(new Error(`WebSocket receive timed out after ${timeout ?? this._timeout}ms`));
      }, timeout ?? this._timeout);
      this.resolveQueue.push((msg) => {
        clearTimeout(timer);
        resolve4(msg);
      });
    });
  }
  /** Wait for the next message and parse as JSON. */
  async receiveJson() {
    const msg = await this.receive();
    return JSON.parse(msg);
  }
  /**
   * Assert that no message is received within the given silence period.
   * Useful for verifying that something did NOT happen.
   */
  async expectSilent(ms) {
    return new Promise((resolve4, reject) => {
      if (this.messageQueue.length > 0) {
        reject(new Error(`Expected silence but got message: ${this.messageQueue[0].slice(0, 100)}`));
        return;
      }
      const timer = setTimeout(() => resolve4(), ms);
      const origPush = this.resolveQueue.push.bind(this.resolveQueue);
      this.resolveQueue.push = (_fn) => {
        clearTimeout(timer);
        reject(new Error("Expected silence but received a message"));
        return 0;
      };
      setTimeout(() => {
        this.resolveQueue.push = origPush;
      }, ms + 10).unref();
    });
  }
  /** Close the connection. */
  close() {
    this._closed = true;
    this.ws.close();
  }
  /** Whether the connection is closed. */
  get closed() {
    return this._closed;
  }
};
function testApp() {
  return new TestApp();
}
async function createTestDb(options) {
  const dbUrl = options?.url || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error("createTestDb: DATABASE_URL or TEST_DATABASE_URL required");
  const schema = options?.schema || `test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const { default: postgres2 } = await import("postgres");
  const adminSql = postgres2(dbUrl);
  await adminSql.unsafe('CREATE SCHEMA IF NOT EXISTS "' + schema.replace(/"/g, '""') + '"');
  const schemaUrl = new URL(dbUrl);
  schemaUrl.searchParams.set("search_path", schema);
  const sql = postgres2(schemaUrl.toString());
  await adminSql.end();
  return {
    sql,
    url: schemaUrl.toString(),
    schema,
    destroy: async () => {
      const destroySql = postgres2(dbUrl);
      await destroySql.unsafe('DROP SCHEMA IF EXISTS "' + schema.replace(/"/g, '""') + '" CASCADE');
      await destroySql.end();
      await sql.end();
    }
  };
}
async function withTestDb(optionsOrFn, fn) {
  let dbUrl;
  let callback;
  if (typeof optionsOrFn === "function") {
    callback = optionsOrFn;
  } else if (typeof optionsOrFn === "string") {
    dbUrl = optionsOrFn;
    callback = fn;
  } else {
    dbUrl = optionsOrFn?.url;
    callback = fn;
  }
  const resolvedUrl = dbUrl || process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!resolvedUrl) throw new Error("withTestDb: DATABASE_URL or TEST_DATABASE_URL required");
  const { default: postgres2 } = await import("postgres");
  const sql = postgres2(resolvedUrl);
  try {
    await sql.begin(async (txSql) => {
      await callback(txSql);
      throw void 0;
    });
  } catch {
  } finally {
    await sql.end();
  }
}

// src/graphql.ts
import {
  buildSchema,
  graphql as executeGraphQL,
  validate as validateQuery,
  parse
} from "graphql";
import { makeExecutableSchema } from "@graphql-tools/schema";
function parseParamsFromGet(url) {
  const query = url.searchParams.get("query");
  if (!query) return null;
  let variables = {};
  const variablesStr = url.searchParams.get("variables");
  if (variablesStr) {
    try {
      variables = JSON.parse(variablesStr);
    } catch {
      return null;
    }
  }
  return { query, variables, operationName: url.searchParams.get("operationName") || void 0 };
}
async function parseParamsFromPost(req) {
  try {
    const body = await req.json();
    if (!body.query) return null;
    return { query: body.query, variables: body.variables || {}, operationName: body.operationName };
  } catch {
    return null;
  }
}
function buildSchemaFromOptions(options) {
  try {
    if (typeof options.schema === "string") {
      return options.resolvers ? makeExecutableSchema({ typeDefs: options.schema, resolvers: options.resolvers }) : buildSchema(options.schema);
    }
    return options.schema;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[graphql] schema build failed: ${msg}`);
    throw err;
  }
}
function queryDepth(doc) {
  let max = 0;
  function walk(node, depth) {
    if (depth > max) max = depth;
    if (node.selectionSet) {
      for (const sel of node.selectionSet.selections) {
        walk(sel, depth + 1);
      }
    }
  }
  for (const def of doc.definitions) {
    if (def.kind === "OperationDefinition") {
      walk(def, 0);
    }
  }
  return max;
}
async function executeQuery(schema, params, options, req, ctx) {
  const maxDepth = options.maxDepth ?? 10;
  if (maxDepth > 0) {
    try {
      const doc = parse(params.query);
      const depth = queryDepth(doc);
      if (depth > maxDepth) {
        return Response.json(
          { errors: [{ message: `Query depth ${depth} exceeds limit ${maxDepth}` }] },
          { status: 400 }
        );
      }
      const validationErrors = validateQuery(schema, doc);
      if (validationErrors.length > 0) {
        return Response.json(
          { errors: validationErrors.map((e) => ({ message: e.message })) },
          { status: 400 }
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return Response.json({ errors: [{ message: `Parse error: ${msg}` }] }, { status: 400 });
    }
  }
  const timeout = options.timeout ?? 3e4;
  const contextValue = options.context ? await options.context(req, ctx) : ctx;
  try {
    const resultPromise = executeGraphQL({
      schema,
      source: params.query,
      rootValue: options.rootValue,
      contextValue,
      variableValues: params.variables,
      operationName: params.operationName
    });
    let result;
    if (timeout > 0) {
      let timer = null;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Query timeout")), timeout);
      });
      result = await Promise.race([resultPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
    } else {
      result = await resultPromise;
    }
    return Response.json(result, { status: result.errors ? 400 : 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${currentTraceId()}] graphql execution failed: ${msg}`);
    return Response.json({ errors: [{ message: msg }] }, { status: 500 });
  }
}
function graphiqlHTML(endpoint) {
  const safeEndpoint = endpoint.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/</g, "\\x3C");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GraphiQL</title>
    <style>body { margin: 0; } #graphiql { height: 100dvh; }</style>
    <link rel="stylesheet" href="https://esm.sh/graphiql@5.2.2/dist/style.css" />
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@19.2.5",
          "react/": "https://esm.sh/react@19.2.5/",
          "react-dom": "https://esm.sh/react-dom@19.2.5",
          "react-dom/": "https://esm.sh/react-dom@19.2.5/",
          "graphiql": "https://esm.sh/graphiql@5.2.2?standalone&external=react,react-dom,@graphiql/react,graphql",
          "graphiql/": "https://esm.sh/graphiql@5.2.2/",
          "@graphiql/react": "https://esm.sh/@graphiql/react@0.37.3?standalone&external=react,react-dom,graphql,@graphiql/toolkit,@emotion/is-prop-valid",
          "@graphiql/toolkit": "https://esm.sh/@graphiql/toolkit@0.11.3?standalone&external=graphql",
          "graphql": "https://esm.sh/graphql@16.13.2",
          "@emotion/is-prop-valid": "data:text/javascript,"
        }
      }
    </script>
    <script type="module">
      import React from 'react';
      import ReactDOM from 'react-dom/client';
      import { GraphiQL } from 'graphiql';
      import { createGraphiQLFetcher } from '@graphiql/toolkit';
      import 'graphiql/setup-workers/esm.sh';

      const fetcher = createGraphiQLFetcher({ url: "${safeEndpoint}" });

      function App() {
        return React.createElement(GraphiQL, { fetcher });
      }

      const container = document.getElementById('graphiql');
      const root = ReactDOM.createRoot(container);
      root.render(React.createElement(App));
    </script>
  </head>
  <body>
    <div id="graphiql">Loading\u2026</div>
  </body>
</html>`;
}
function graphql(handler) {
  const r = new Router();
  let cachedOptions = null;
  let cachedSchema = null;
  async function getSchema(req, ctx) {
    const options = await handler(req, ctx);
    if (cachedSchema && cachedOptions === options) {
      return { options, schema: cachedSchema };
    }
    const schema = buildSchemaFromOptions(options);
    cachedOptions = options;
    cachedSchema = schema;
    return { options, schema };
  }
  r.get("/", async (req, ctx) => {
    const { options, schema } = await getSchema(req, ctx);
    const url = new URL(req.url);
    if (options.graphiql && !url.searchParams.has("query")) {
      return new Response(graphiqlHTML(url.pathname), {
        status: 200,
        headers: { "Content-Type": "text/html" }
      });
    }
    const params = parseParamsFromGet(url);
    if (!params) {
      return Response.json({ errors: [{ message: "Missing query" }] }, { status: 400 });
    }
    return executeQuery(schema, params, options, req, ctx);
  });
  r.post("/", async (req, ctx) => {
    const { options, schema } = await getSchema(req, ctx);
    const params = await parseParamsFromPost(req);
    if (!params) {
      return Response.json({ errors: [{ message: "Missing query" }] }, { status: 400 });
    }
    return executeQuery(schema, params, options, req, ctx);
  });
  return r;
}

// src/postgres/client.ts
import postgresFactory from "postgres";
var MIGRATIONS_TABLE = "_weifuwu_migrations";
var RETRYABLE_CODES = /* @__PURE__ */ new Set(["40P01", "40001"]);
function isRetryable(err) {
  return err instanceof Error && "code" in err && RETRYABLE_CODES.has(err.code);
}
function postgres(opts) {
  const options = typeof opts === "string" ? { connection: opts } : opts ?? {};
  const connection = options.connection ?? process.env.DATABASE_URL;
  if (!connection) {
    throw new Error(
      "postgres: DATABASE_URL is not set. Pass a connection string or set the DATABASE_URL environment variable."
    );
  }
  const stmtTimeout = options.statementTimeout ?? 3e4;
  let connStr = typeof connection === "string" ? connection : "";
  if (stmtTimeout > 0 && typeof connection === "string") {
    const sep2 = connStr.includes("?") ? "&" : "?";
    connStr = `${connStr}${sep2}options=-c%20statement_timeout%3D${stmtTimeout}`;
  }
  const sql = postgresFactory(connStr, {
    max: options.max,
    ssl: options.ssl,
    idle_timeout: options.idle_timeout,
    connect_timeout: options.connect_timeout
  });
  if (options.signal) {
    options.signal.addEventListener(
      "abort",
      () => {
        sql.end();
      },
      { once: true }
    );
  }
  const closeTimeout = options.closeTimeout ?? 5;
  const _active = 0;
  const _waiting = 0;
  const poolMax = options.max ?? 10;
  const mw = ((req, ctx, next) => {
    ctx.sql = sql;
    return next(req, ctx);
  });
  mw.__meta = { injects: ["sql"], depends: [] };
  mw.sql = sql;
  mw.migrate = async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  };
  mw.markMigrated = async (moduleName) => {
    await sql.unsafe(
      `INSERT INTO "${MIGRATIONS_TABLE}" (name) VALUES ($1) ON CONFLICT DO NOTHING`,
      [moduleName]
    );
  };
  mw.isMigrated = async (moduleName) => {
    const [row] = await sql.unsafe(`SELECT 1 FROM "${MIGRATIONS_TABLE}" WHERE name = $1`, [
      moduleName
    ]);
    return !!row;
  };
  mw.transaction = (async (fn, retryOpts) => {
    const maxRetries = retryOpts?.maxRetries ?? 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await sql.begin(fn);
        return result;
      } catch (err) {
        if (attempt < maxRetries && isRetryable(err)) {
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 1e3);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      }
    }
    throw new Error("transaction: max retries exceeded");
  });
  mw.poolStats = () => ({
    active: _active,
    idle: poolMax - _active - _waiting,
    waiting: _waiting,
    max: poolMax
  });
  mw.close = () => sql.end({ timeout: closeTimeout });
  return mw;
}

// src/redis/client.ts
import { Redis as IORedis } from "ioredis";
function redis(opts) {
  const options = typeof opts === "string" ? { url: opts } : opts ?? {};
  const url = options.url ?? process.env.REDIS_URL ?? "redis://localhost:6379";
  const client = new IORedis(url, options);
  client.on("error", (err) => console.error("[redis]", err.message));
  const mw = ((req, ctx, next) => {
    ctx.redis = client;
    return next(req, ctx);
  });
  mw.__meta = { injects: ["redis"], depends: [] };
  mw.redis = client;
  mw.close = () => client.quit();
  return mw;
}

// src/queue/index.ts
import { Redis as IORedis2 } from "ioredis";
import crypto4 from "node:crypto";

// src/queue/cron.ts
function parseField(field, min, max) {
  const values = /* @__PURE__ */ new Set();
  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step < 1) throw new Error(`Invalid cron step: ${part}`);
      let start = min;
      let end = max;
      if (range !== "*") {
        const rangeParts = range.split("-");
        start = parseInt(rangeParts[0], 10);
        end = rangeParts.length > 1 ? parseInt(rangeParts[1], 10) : max;
      }
      for (let i = start; i <= end; i += step) values.add(i);
    } else if (part.includes("-")) {
      const [s, e] = part.split("-").map(Number);
      if (isNaN(s) || isNaN(e)) throw new Error(`Invalid cron range: ${part}`);
      for (let i = s; i <= e; i++) values.add(i);
    } else {
      const val = parseInt(part, 10);
      if (isNaN(val)) throw new Error(`Invalid cron value: ${part}`);
      values.add(val);
    }
  }
  const result = /* @__PURE__ */ new Set();
  for (const v of values) {
    if (v >= min && v <= max) result.add(v);
  }
  return result;
}
var FIELD_RANGES = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 6]
];
function parsePattern(pattern) {
  const fields = pattern.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron pattern "${pattern}": expected 5 fields, got ${fields.length}`);
  }
  return fields.map((f, i) => parseField(f, FIELD_RANGES[i][0], FIELD_RANGES[i][1]));
}
function matches(fields, date) {
  return fields[0].has(date.getMinutes()) && fields[1].has(date.getHours()) && fields[2].has(date.getDate()) && fields[3].has(date.getMonth() + 1) && fields[4].has(date.getDay());
}
function cronNext(expr, from = /* @__PURE__ */ new Date()) {
  const fields = parsePattern(expr);
  const candidate = new Date(from.getTime() + 6e4);
  candidate.setSeconds(0, 0);
  for (let i = 0; i < 525600; i++) {
    if (fields[4].has(candidate.getDay()) && fields[3].has(candidate.getMonth() + 1) && fields[2].has(candidate.getDate()) && fields[1].has(candidate.getHours()) && fields[0].has(candidate.getMinutes())) {
      return candidate.getTime();
    }
    candidate.setTime(candidate.getTime() + 6e4);
  }
  throw new Error(`No future date found for cron expression "${expr}"`);
}

// src/queue/index.ts
function queue(opts) {
  const store = opts?.store ?? "memory";
  if (store === "redis") return createRedisQueue(opts);
  if (store === "pg") return createPgQueue(opts);
  return createMemoryQueue(opts);
}
function escapeIdent(s) {
  return '"' + s.replace(/"/g, '""') + '"';
}
function attachCron(q, handlers) {
  ;
  q.cron = function(pattern, handler) {
    const id = "__cron_" + pattern.replace(/[^a-zA-Z0-9]/g, "_") + "_" + crypto4.randomUUID().slice(0, 8);
    q.process(id, async () => {
      await handler();
    });
    q.add(id, {}, { schedule: pattern });
    return { stop: () => handlers.delete(id) };
  };
}
function createMemoryQueue(opts) {
  const pollInterval = opts?.pollInterval ?? 200;
  const handlers = /* @__PURE__ */ new Map();
  const pending = [];
  const failed = [];
  const MAX_FAILED = 1e3;
  let running = false;
  let pollTimer = null;
  let _processed = 0;
  let _failed = 0;
  let inflight = 0;
  const MAX_CONCURRENT = 16;
  function insertJob(job) {
    let i = 0;
    while (i < pending.length && pending[i].runAt <= job.runAt) i++;
    pending.splice(i, 0, job);
  }
  async function execute(job, handler) {
    inflight++;
    try {
      await handler(job);
      _processed++;
    } catch (e) {
      _failed++;
      failed.unshift({ ...job, error: e.message, failedAt: Date.now() });
      if (failed.length > MAX_FAILED) failed.length = MAX_FAILED;
    } finally {
      inflight--;
    }
    if (job.schedule) {
      try {
        insertJob({
          ...job,
          id: crypto4.randomUUID(),
          runAt: cronNext(job.schedule),
          createdAt: Date.now()
        });
      } catch (e) {
        console.error("[queue] cron re-queue failed:", e.message);
      }
    }
  }
  async function poll() {
    if (!running) return;
    const now = Date.now();
    while (running && inflight < MAX_CONCURRENT && pending.length > 0 && pending[0].runAt <= now) {
      const job = pending.shift();
      const handler = handlers.get(job.type);
      if (handler) execute(job, handler);
    }
    if (running) pollTimer = setTimeout(poll, pollInterval);
  }
  const mw = ((req, ctx, next) => {
    ctx.queue = q;
    return next(req, ctx);
  });
  const q = mw;
  mw.add = function add(type, payload, opts2) {
    const id = crypto4.randomUUID();
    let runAt;
    if (opts2?.schedule) {
      try {
        const f = parsePattern(opts2.schedule);
        runAt = matches(f, /* @__PURE__ */ new Date()) ? Date.now() : cronNext(opts2.schedule);
      } catch {
        runAt = cronNext(opts2.schedule);
      }
    } else if (opts2?.delay) {
      runAt = Date.now() + opts2.delay;
    } else {
      runAt = Date.now();
    }
    const job = { id, type, payload, createdAt: Date.now(), runAt };
    if (opts2?.schedule) job.schedule = opts2.schedule;
    insertJob(job);
    return Promise.resolve(id);
  };
  mw.process = function process2(type, handler) {
    handlers.set(type, handler);
  };
  mw.run = async function run() {
    if (running) return;
    running = true;
    poll();
  };
  mw.close = async function close() {
    running = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    while (inflight > 0) await new Promise((r) => setTimeout(r, 50));
  };
  mw.jobs = async function(limit) {
    return pending.slice(0, limit ?? 50);
  };
  mw.failedJobs = async function failedJobs(limit) {
    return failed.slice(0, limit ?? 50);
  };
  mw.retryFailed = async function retry(jobId) {
    const idx = failed.findIndex((j) => j.id === jobId);
    if (idx < 0) return false;
    const [entry] = failed.splice(idx, 1);
    _failed--;
    insertJob({ ...entry, runAt: Date.now() });
    return true;
  };
  mw.retryAllFailed = async function retryAll(type) {
    let count = 0;
    for (let i = failed.length - 1; i >= 0; i--) {
      if (type && failed[i].type !== type) continue;
      const [entry] = failed.splice(i, 1);
      _failed--;
      insertJob({ ...entry, runAt: Date.now() });
      count++;
    }
    return count;
  };
  mw.dashboard = function dashboard() {
    return buildDashboard(q);
  };
  mw.stats = () => ({
    running,
    inflight,
    processed: _processed,
    failed: _failed,
    handlers: handlers.size,
    maxConcurrent: MAX_CONCURRENT
  });
  attachCron(q, handlers);
  return q;
}
function createPgQueue(opts) {
  const sql = opts.pg.sql;
  const pollInterval = opts?.pollInterval ?? 200;
  const table = (opts?.prefix ?? "queue") + "_jobs";
  const handlers = /* @__PURE__ */ new Map();
  let running = false, pollTimer = null;
  let _processed = 0, _failed = 0, inflight = 0, ready = false;
  const MAX_CONCURRENT = 16;
  const MAX_FAILED = 1e3;
  async function ensureTable() {
    if (ready) return;
    await sql.unsafe(
      `CREATE TABLE IF NOT EXISTS ${escapeIdent(table)} (id UUID PRIMARY KEY, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}', run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), schedule TEXT, status TEXT NOT NULL DEFAULT 'pending', error TEXT, failed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`
    );
    await sql.unsafe(
      `CREATE INDEX IF NOT EXISTS ${escapeIdent(table + "_run_at_idx")} ON ${escapeIdent(table)} (run_at, status)`
    );
    ready = true;
  }
  async function processJob(job, handler) {
    inflight++;
    try {
      await handler(job);
      _processed++;
      await sql.unsafe(`DELETE FROM ${escapeIdent(table)} WHERE id = $1`, [job.id]);
    } catch (e) {
      _failed++;
      const msg = e.message;
      console.error("[queue] handler error:", msg);
      await sql.unsafe(
        `UPDATE ${escapeIdent(table)} SET status = 'failed', error = $2, failed_at = NOW() WHERE id = $1`,
        [job.id, msg]
      );
    } finally {
      inflight--;
    }
    if (job.schedule) {
      try {
        const nextRun = cronNext(job.schedule);
        await sql.unsafe(
          `INSERT INTO ${escapeIdent(table)} (id, type, payload, run_at, schedule) VALUES ($1, $2, $3::jsonb, $4, $5)`,
          [
            crypto4.randomUUID(),
            job.type,
            JSON.stringify(job.payload),
            new Date(nextRun).toISOString(),
            job.schedule
          ]
        );
      } catch (e) {
        console.error("[queue] cron re-queue failed:", e.message);
      }
    }
  }
  async function poll() {
    if (!running) return;
    try {
      while (running && inflight < MAX_CONCURRENT) {
        const rows = await sql.unsafe(
          `UPDATE ${escapeIdent(table)} SET status = 'running' WHERE id = (SELECT id FROM ${escapeIdent(table)} WHERE run_at <= NOW() AND status = 'pending' ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        );
        if (rows.length === 0) break;
        const row = rows[0];
        const job = {
          id: row.id,
          type: row.type,
          payload: typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
          createdAt: new Date(row.created_at).getTime(),
          runAt: new Date(row.run_at).getTime(),
          schedule: row.schedule || void 0
        };
        const handler = handlers.get(job.type);
        if (handler) processJob(job, handler);
      }
    } catch (e) {
      const msg = e.message;
      if (msg.includes("CONNECTION_ENDED") || msg.includes("Connection terminated")) {
        running = false;
        return;
      }
      console.error("[queue] poll error:", msg);
    }
    if (running) pollTimer = setTimeout(poll, pollInterval);
  }
  const mw = ((req, ctx, next) => {
    ctx.queue = q;
    return next(req, ctx);
  });
  const q = mw;
  mw.add = function add(type, payload, opts2) {
    return (async () => {
      const id = crypto4.randomUUID();
      let runAt;
      if (opts2?.schedule) {
        try {
          const f = parsePattern(opts2.schedule);
          runAt = matches(f, /* @__PURE__ */ new Date()) ? /* @__PURE__ */ new Date() : new Date(cronNext(opts2.schedule));
        } catch {
          runAt = new Date(cronNext(opts2.schedule));
        }
      } else if (opts2?.delay) {
        runAt = new Date(Date.now() + opts2.delay);
      } else {
        runAt = /* @__PURE__ */ new Date();
      }
      await sql.unsafe(
        `INSERT INTO ${escapeIdent(table)} (id, type, payload, run_at, schedule) VALUES ($1, $2, $3::jsonb, $4, $5)`,
        [id, type, JSON.stringify(payload), runAt.toISOString(), opts2?.schedule || null]
      );
      return id;
    })();
  };
  mw.process = function process2(type, handler) {
    handlers.set(type, handler);
  };
  mw.migrate = ensureTable;
  mw.run = async function run() {
    if (running) return;
    await ensureTable();
    running = true;
    poll();
  };
  mw.close = async function close() {
    running = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    while (inflight > 0) await new Promise((r) => setTimeout(r, 50));
  };
  mw.jobs = async function jobs(limit) {
    const rows = await sql.unsafe(
      `SELECT * FROM ${escapeIdent(table)} WHERE status = 'pending' ORDER BY run_at LIMIT $1`,
      [limit ?? 50]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
      createdAt: new Date(r.created_at).getTime(),
      runAt: new Date(r.run_at).getTime(),
      schedule: r.schedule || void 0
    }));
  };
  mw.failedJobs = async function failedJobs(limit) {
    const rows = await sql.unsafe(
      `SELECT * FROM ${escapeIdent(table)} WHERE status = 'failed' ORDER BY failed_at DESC LIMIT $1`,
      [limit ?? 50]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    );
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      payload: typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload,
      createdAt: new Date(r.created_at).getTime(),
      runAt: new Date(r.run_at).getTime(),
      schedule: r.schedule || void 0,
      error: r.error || "",
      failedAt: new Date(r.failed_at).getTime()
    }));
  };
  mw.retryFailed = async function retryFailed(jobId) {
    const result = await sql.unsafe(
      `UPDATE ${escapeIdent(table)} SET status = 'pending', error = NULL, failed_at = NULL, run_at = NOW() WHERE id = $1 AND status = 'failed' RETURNING id`,
      [jobId]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    );
    return result.length > 0;
  };
  mw.retryAllFailed = async function retryAllFailed(type) {
    const result = await sql.unsafe(
      type ? `UPDATE ${escapeIdent(table)} SET status = 'pending', error = NULL, failed_at = NULL, run_at = NOW() WHERE status = 'failed' AND type = $1 RETURNING id` : `UPDATE ${escapeIdent(table)} SET status = 'pending', error = NULL, failed_at = NULL, run_at = NOW() WHERE status = 'failed' RETURNING id`,
      type ? [type] : []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    );
    return result.length;
  };
  mw.dashboard = function dashboard() {
    return buildDashboard(q);
  };
  mw.stats = () => ({
    running,
    inflight,
    processed: _processed,
    failed: _failed,
    handlers: handlers.size,
    maxConcurrent: MAX_CONCURRENT
  });
  attachCron(q, handlers);
  return q;
}
function createRedisQueue(opts) {
  const redis2 = opts?.redis ?? new IORedis2(opts?.url ?? process.env.REDIS_URL ?? "redis://localhost:6379");
  const prefix = opts?.prefix ?? "queue";
  const pollInterval = opts?.pollInterval ?? 200;
  const handlers = /* @__PURE__ */ new Map();
  let running = false, pollTimer = null, epoch = 0;
  let _processed = 0, _failed = 0, inflight = 0;
  const jobKey = prefix + ":jobs", failedKey = prefix + ":failed", MAX_FAILED = 1e3, MAX_CONCURRENT = 16;
  async function processJob(job, handler) {
    inflight++;
    try {
      await handler(job);
      _processed++;
    } catch (e) {
      _failed++;
      const msg = e.message;
      console.error("[queue] handler error:", msg);
      await redis2.lpush(failedKey, JSON.stringify({ ...job, error: msg, failedAt: Date.now() }));
      await redis2.ltrim(failedKey, 0, MAX_FAILED - 1);
    } finally {
      inflight--;
    }
    if (job.schedule) {
      try {
        const nextRun = cronNext(job.schedule);
        await redis2.zadd(
          jobKey,
          nextRun,
          JSON.stringify({
            ...job,
            id: crypto4.randomUUID(),
            runAt: nextRun,
            createdAt: Date.now()
          })
        );
      } catch (e) {
        console.error("[queue] cron re-queue failed:", e.message);
      }
    }
  }
  async function poll() {
    const currentEpoch = epoch;
    if (!running) return;
    try {
      const now = Date.now();
      while (running && inflight < MAX_CONCURRENT) {
        const result = await redis2.zpopmin(jobKey);
        if (result.length < 2) break;
        const raw2 = result[0], score = parseInt(result[1], 10);
        if (score > now) {
          await redis2.zadd(jobKey, score, raw2);
          break;
        }
        let job;
        try {
          job = JSON.parse(raw2);
        } catch {
          continue;
        }
        const handler = handlers.get(job.type);
        if (handler) processJob(job, handler);
      }
    } catch (e) {
      console.error("[queue] poll error:", e.message);
    }
    if (running && currentEpoch === epoch) pollTimer = setTimeout(poll, pollInterval);
  }
  const mw = ((req, ctx, next) => {
    ctx.queue = q;
    return next(req, ctx);
  });
  const q = mw;
  mw.add = function add(type, payload, opts2) {
    const id = crypto4.randomUUID();
    let runAt;
    if (opts2?.schedule) {
      runAt = cronNext(opts2.schedule);
    } else if (opts2?.delay) {
      runAt = Date.now() + opts2.delay;
    } else {
      runAt = Date.now();
    }
    const job = { id, type, payload, createdAt: Date.now(), runAt };
    if (opts2?.schedule) job.schedule = opts2.schedule;
    return redis2.zadd(jobKey, runAt, JSON.stringify(job)).then(() => id);
  };
  mw.process = function process2(type, handler) {
    handlers.set(type, handler);
  };
  mw.run = async function run() {
    if (running) return;
    running = true;
    poll();
  };
  mw.close = async function close() {
    running = false;
    epoch++;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    while (inflight > 0) await new Promise((r) => setTimeout(r, 50));
    redis2.disconnect();
  };
  mw.jobs = async function jobs(limit) {
    const raw2 = await redis2.zrevrange(jobKey, 0, (limit ?? 50) - 1);
    return raw2.map((r) => {
      try {
        return JSON.parse(r);
      } catch {
        return null;
      }
    }).filter(Boolean);
  };
  mw.failedJobs = async function failedJobs(limit) {
    const raw2 = await redis2.lrange(failedKey, 0, (limit ?? 50) - 1);
    return raw2.map((r) => {
      try {
        return JSON.parse(r);
      } catch {
        return null;
      }
    }).filter(Boolean);
  };
  mw.retryFailed = async function retryFailed(jobId) {
    const raw2 = await redis2.lrange(failedKey, 0, -1);
    for (const entry of raw2) {
      try {
        const job = JSON.parse(entry);
        if (job.id === jobId) {
          await redis2.lrem(failedKey, 1, entry);
          const reJob = { ...job, runAt: Date.now() };
          delete reJob.error;
          delete reJob.failedAt;
          await redis2.zadd(jobKey, reJob.runAt, JSON.stringify(reJob));
          _failed--;
          return true;
        }
      } catch {
      }
    }
    return false;
  };
  mw.retryAllFailed = async function retryAllFailed(type) {
    let count = 0;
    const raw2 = await redis2.lrange(failedKey, 0, -1);
    for (const entry of raw2) {
      try {
        const job = JSON.parse(entry);
        if (type && job.type !== type) continue;
        await redis2.lrem(failedKey, 1, entry);
        const reJob = { ...job, runAt: Date.now() };
        delete reJob.error;
        delete reJob.failedAt;
        await redis2.zadd(jobKey, reJob.runAt, JSON.stringify(reJob));
        _failed--;
        count++;
      } catch {
      }
    }
    return count;
  };
  mw.dashboard = function dashboard() {
    return buildDashboard(q);
  };
  mw.stats = () => ({
    running,
    inflight,
    processed: _processed,
    failed: _failed,
    handlers: handlers.size,
    maxConcurrent: MAX_CONCURRENT
  });
  attachCron(q, handlers);
  return q;
}
function buildDashboard(q) {
  const r = new Router();
  r.get("/", async () => {
    const s = q.stats();
    const pending = await q.jobs(100);
    const byType = {};
    for (const j of pending) {
      if (!byType[j.type]) byType[j.type] = { pending: 0, failed: 0 };
      byType[j.type].pending++;
    }
    const failed = await q.failedJobs(1e3);
    for (const j of failed) {
      if (!byType[j.type]) byType[j.type] = { pending: 0, failed: 0 };
      byType[j.type].failed++;
    }
    return Response.json({ stats: s, types: byType, failedCount: failed.length });
  });
  r.get("/:type/failed", async (req, ctx) => {
    const failed = await q.failedJobs(100);
    return Response.json({ jobs: failed.filter((j) => j.type === ctx.params.type) });
  });
  r.post("/:type/retry", async (req, ctx) => {
    return Response.json({ retried: await q.retryAllFailed(ctx.params.type) });
  });
  r.post("/retry/:id", async (req, ctx) => {
    const ok = await q.retryFailed(ctx.params.id);
    if (!ok) return new Response("Not found", { status: 404 });
    return Response.json({ ok: true });
  });
  return r;
}

// src/middleware/health.ts
function health(options) {
  const path = options?.path ?? "/__health";
  const r = new Router();
  const handler = async () => {
    try {
      await options?.check?.();
      return new Response("OK", { status: 200 });
    } catch {
      return new Response("Service Unavailable", { status: 503 });
    }
  };
  r.get(path, handler);
  r.head(path, handler);
  return r;
}

// src/core/html.ts
var ESCAPE = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c] ?? c);
}
function html(strings, ...values) {
  let result = "";
  for (let i = 0; i < strings.length; i++) {
    result += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v == null || v === false) continue;
      if (Array.isArray(v)) {
        result += v.join("");
      } else if (typeof v === "object" && v !== null && "_raw" in v) {
        result += v._raw;
      } else {
        result += esc(String(v));
      }
    }
  }
  return result;
}
function raw(content) {
  return { _raw: content };
}

// src/middleware/theme.ts
function makeSetTheme(cookie, location) {
  return (value, loc) => {
    const finalLoc = loc ?? location;
    const c = `${cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    return new Response(null, { status: 302, headers: { Location: finalLoc, "Set-Cookie": c } });
  };
}
function theme(options) {
  const opts = { default: "system", cookie: "theme", ...options };
  const mw = async (req, ctx, next) => {
    let themeValue = opts.default;
    if (opts.cookie) {
      const fromCookie = getCookies(req)[opts.cookie];
      if (fromCookie) themeValue = fromCookie;
    }
    ;
    ctx.theme = {
      value: themeValue,
      set: makeSetTheme(opts.cookie, req.headers.get("referer") || "/")
    };
    return next(req, ctx);
  };
  mw.__meta = { injects: ["theme"], depends: [] };
  class ThemeRouter extends Router {
    middleware() {
      return mw;
    }
  }
  const router = new ThemeRouter();
  router.get("/__theme/:value", (req) => {
    const url = new URL(req.url);
    const value = url.pathname.split("/__theme/")[1] ?? "";
    const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("application/json")) {
      return Response.json({ ok: true, theme: value }, { headers: { "Set-Cookie": cookie } });
    }
    const referer = req.headers.get("referer") || "/";
    return new Response(null, { status: 302, headers: { Location: referer, "Set-Cookie": cookie } });
  });
  return router;
}

// src/middleware/i18n.ts
import { readFile, stat } from "node:fs/promises";
import { join as join2, resolve as resolve3 } from "node:path";
var DEFAULTS2 = {
  default: "en",
  cookie: "locale",
  fromAcceptLanguage: true
};
function translate(msgs, key, params, fallback) {
  const msg = key.split(".").reduce((o, k) => o?.[k], msgs);
  if (msg === void 0 || msg === null) return fallback ?? key;
  if (!params) return String(msg);
  let result = String(msg);
  for (const [k, v] of Object.entries(params)) {
    result = result.replace(`{${k}}`, v);
  }
  return result;
}
function i18n(options) {
  const opts = { ...DEFAULTS2, ...options };
  const dir = opts.dir ? resolve3(opts.dir) : void 0;
  const cache = /* @__PURE__ */ new Map();
  function validLocale(locale) {
    return /^[\w-]+$/.test(locale) && !locale.includes("..");
  }
  async function loadMessages(locale) {
    if (opts.messages?.[locale] && Object.keys(opts.messages[locale]).length > 0) {
      cache.set(locale, opts.messages[locale]);
      return opts.messages[locale];
    }
    if (!dir || !validLocale(locale)) return {};
    const cached = cache.get(locale);
    if (cached) return cached;
    const filePath = join2(dir, `${locale}.json`);
    try {
      await stat(filePath);
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      cache.set(locale, data);
      return data;
    } catch {
    }
    const short = locale.split("-")[0];
    if (short !== locale) {
      const fallback = cache.get(short) || await loadMessages(short);
      if (fallback && Object.keys(fallback).length > 0) {
        cache.set(locale, fallback);
        return fallback;
      }
    }
    return {};
  }
  function detectLocale(req) {
    if (opts.cookie) {
      const fromCookie = getCookies(req)[opts.cookie];
      if (fromCookie && validLocale(fromCookie)) return fromCookie;
    }
    if (opts.fromAcceptLanguage) {
      const fromHeader = req.headers.get("Accept-Language")?.split(",")[0]?.trim();
      if (fromHeader && validLocale(fromHeader)) return fromHeader;
    }
    return opts.default;
  }
  const mw = async (req, ctx, next) => {
    const locale = detectLocale(req);
    const msgs = await loadMessages(locale);
    ctx.i18n = {
      locale,
      messages: msgs,
      t: (key, params, fallback) => translate(msgs, key, params, fallback),
      set: (value, loc) => {
        const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
        const location = loc ?? (req.headers.get("referer") || "/");
        return new Response(null, {
          status: 302,
          headers: { Location: location, "Set-Cookie": cookie }
        });
      }
    };
    return next(req, ctx);
  };
  mw.__meta = { injects: ["i18n"], depends: [] };
  class I18nRouter extends Router {
    middleware() {
      return mw;
    }
  }
  const router = new I18nRouter();
  router.get("/__lang/:locale", async (req) => {
    const url = new URL(req.url);
    const value = url.pathname.split("/__lang/")[1] ?? "";
    const cookie = `${opts.cookie}=${encodeURIComponent(value)}; Path=/; SameSite=Lax`;
    const messages = await loadMessages(value);
    const accept = req.headers.get("accept") ?? "";
    if (accept.includes("application/json")) {
      return Response.json(
        {
          ok: true,
          locale: value,
          messages: Object.keys(messages).length > 0 ? messages : void 0
        },
        { headers: { "Set-Cookie": cookie } }
      );
    }
    const referer = req.headers.get("referer") || "/";
    return new Response(null, { status: 302, headers: { Location: referer, "Set-Cookie": cookie } });
  });
  return router;
}

// src/middleware/flash.ts
function makeSetFlash(name, location) {
  return (data, loc) => {
    const finalLoc = loc ?? location;
    const value = encodeURIComponent(JSON.stringify(data));
    return new Response(null, {
      status: 302,
      headers: {
        Location: finalLoc,
        "Set-Cookie": `${name}=${value}; Path=/; SameSite=Lax`
      }
    });
  };
}
function flash(options) {
  const name = options?.name ?? "flash";
  const mw = async (req, ctx, next) => {
    const raw2 = getCookies(req)[name] ?? null;
    const referer = req.headers.get("referer") || "/";
    let value = void 0;
    if (raw2) {
      try {
        value = JSON.parse(decodeURIComponent(raw2));
      } catch {
        value = raw2;
      }
    }
    ctx.flash = {
      value,
      set: makeSetFlash(name, referer)
    };
    const res = await next(req, ctx);
    if (raw2) {
      const headers = new Headers(res.headers);
      headers.append("Set-Cookie", `${name}=; Path=/; Max-Age=0`);
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
    }
    return res;
  };
  mw.__meta = { injects: ["flash"], depends: [] };
  return mw;
}

// src/middleware/csrf.ts
function csrf(options) {
  const cookieName = options?.cookie ?? "_csrf";
  const headerName = options?.header ?? "x-csrf-token";
  const bodyKey = options?.key ?? "_csrf";
  const excluded = new Set(options?.excludeMethods ?? ["GET", "HEAD", "OPTIONS"]);
  const mw = async (req, ctx, next) => {
    const method = req.method.toUpperCase();
    if (excluded.has(method)) {
      const token = getCookies(req)[cookieName] || crypto.randomUUID();
      ctx.csrf = { token };
      const res = await next(req, ctx);
      const tokenToSet = ctx.csrf?.token;
      if (tokenToSet && !getCookies(req)[cookieName]) {
        return setCookie(res, cookieName, tokenToSet, {
          httpOnly: true,
          sameSite: "strict",
          path: "/"
        });
      }
      return res;
    }
    const cookieToken = getCookies(req)[cookieName];
    let headerToken = req.headers.get(headerName) ?? "";
    if (!headerToken && (req.method === "POST" || req.method === "PUT" || req.method === "PATCH" || req.method === "DELETE")) {
      try {
        const body = await req.clone().json();
        headerToken = body[bodyKey] ?? "";
      } catch {
        return new Response("Invalid request body", { status: 400 });
      }
    }
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return new Response("CSRF token mismatch", { status: 403 });
    }
    return next(req, ctx);
  };
  mw.__meta = { injects: ["csrf"], depends: [] };
  return mw;
}
export {
  DEFAULT_MAX_BODY,
  HttpError,
  MIGRATIONS_TABLE,
  Router,
  TestApp,
  TestRequest,
  compress,
  cors,
  createHub,
  createSSEStream,
  createTestDb,
  createTestServer,
  csrf,
  currentTrace,
  currentTraceId,
  deleteCookie,
  env,
  flash,
  formatSSE,
  formatSSEData,
  getCookies,
  getPublicEnv,
  graphql,
  health,
  helmet,
  html,
  i18n,
  isBundled,
  isDev,
  isProd,
  loadEnv,
  logger,
  postgres,
  queue,
  rateLimit,
  raw,
  redis,
  requestId,
  runWithTrace,
  serve,
  serveStatic,
  setCookie,
  testApp,
  theme,
  trace,
  traceElapsed,
  upload,
  validate,
  withTestDb
};
