import {
  buildSchema,
  graphql as executeGraphQL,
  type GraphQLSchema,
  validate as validateQuery,
  parse,
  type DocumentNode,
} from 'graphql'
import { makeExecutableSchema } from './make-executable-schema.ts'
import type { Context } from './types.ts'
import { Router } from './core/router.ts'

export interface GraphQLOptions {
  schema: string | GraphQLSchema
  rootValue?: any
  resolvers?: any
  context?: (req: Request, ctx: Context) => Record<string, any> | Promise<Record<string, any>>
  graphiql?: boolean
  /** Max query depth (nesting). Default: 10. Set 0 to disable. */
  maxDepth?: number
  /** Execution timeout in ms. Default: 30_000. */
  timeout?: number
}

export type GraphQLHandler = (
  req: Request,
  ctx: Context,
) => GraphQLOptions | Promise<GraphQLOptions>

type GraphQLParams = {
  query: string
  variables: Record<string, any>
  operationName?: string
}

/** GET 解析结果：null = 无 query；{ error } = 参数语法错误（G5——不吞成 Missing query） */
type GetParams = GraphQLParams | { error: string } | null

function parseParamsFromGet(url: URL): GetParams {
  const query = url.searchParams.get('query')
  if (!query) return null
  let variables = {}
  const variablesStr = url.searchParams.get('variables')
  if (variablesStr) {
    try {
      variables = JSON.parse(variablesStr)
    } catch {
      // G5：返回具体错误（旧代码 return null → 误导 'Missing query'）
      return { error: 'Invalid variables JSON' }
    }
  }
  return { query, variables, operationName: url.searchParams.get('operationName') || undefined }
}

async function parseParamsFromPost(req: Request): Promise<GraphQLParams | null> {
  try {
    const body = (await req.json()) as {
      query?: string
      variables?: Record<string, any>
      operationName?: string
    }
    if (!body.query) return null
    return { query: body.query, variables: body.variables || {}, operationName: body.operationName }
  } catch {
    return null
  }
}

/** G4：schema 缓存——字符串 SDL 场景避免每请求全量 buildSchema + resolver 绑定。
 *  键设计（防跨请求污染——决策记录 §7）：
 *  - 有 resolvers：WeakMap<resolvers 对象, Map<sdl, { sig, schema }>>——resolver 对象
 *    GC 自动回收；不同 resolver 对象永不共享 schema 对象（绑定隔离）
 *  - sig = 该 resolver 对象全部函数引用快照——**运行时替换函数（热更新）→ miss →
 *    重建**（行为与每请求重建一致——不粘旧函数）
 *  - 无 resolvers：全局 Map<sdl, schema>（只读共享安全——无绑定变异）
 *  - FIFO 上限防无界（多租户多 SDL）
 */
const RESOLVER_CACHE_LIMIT = 64
const byResolvers = new WeakMap<object, Map<string, { sig: Set<unknown>; schema: GraphQLSchema }>>()
const bareCache = new Map<string, GraphQLSchema>()

/** resolver 对象的函数引用快照（sig 比对：同对象 + 同函数 → 命中；函数被替换 → miss） */
function resolverSig(resolvers: Record<string, Record<string, unknown>>): Set<unknown> {
  const sig = new Set<unknown>()
  for (const fields of Object.values(resolvers)) {
    for (const v of Object.values(fields)) {
      if (typeof v === 'function') sig.add(v)
    }
  }
  return sig
}

function sigEquals(a: Set<unknown>, b: Set<unknown>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function fifoSet<K>(map: Map<K, unknown>, limit: number): void {
  if (map.size >= limit) {
    const first = map.keys().next().value
    if (first !== undefined) map.delete(first)
  }
}

function buildSchemaFromOptions(options: GraphQLOptions): GraphQLSchema {
  if (typeof options.schema !== 'string') return options.schema
  const resolvers = options.resolvers
  if (!resolvers || typeof resolvers !== 'object') {
    // 无 resolvers：纯 SDL——全局缓存（schema 只读共享——无绑定变异安全）
    const hit = bareCache.get(options.schema)
    if (hit) return hit
    const built = buildSchema(options.schema)
    fifoSet(bareCache, RESOLVER_CACHE_LIMIT)
    bareCache.set(options.schema, built)
    return built
  }
  let bySdl = byResolvers.get(resolvers)
  if (!bySdl) {
    bySdl = new Map()
    byResolvers.set(resolvers, bySdl)
  }
  const sig = resolverSig(resolvers)
  const hit = bySdl.get(options.schema)
  if (hit && sigEquals(hit.sig, sig)) return hit.schema
  const built = makeExecutableSchema({ typeDefs: options.schema, resolvers })
  fifoSet(bySdl, RESOLVER_CACHE_LIMIT)
  bySdl.set(options.schema, { sig, schema: built })
  return built
}

/**
 * Count max nesting depth of a GraphQL query——**fragment 展开计入**（G1 修复）：
 * 旧代码只数 OperationDefinition 字面嵌套——fragment 链合法展开后的真实深度不计
 * （maxDepth 防护可绕过——DoS 实证：maxDepth=3 下 fragment 展开 11 层 → 200）。
 * visited 防循环（validate NoFragmentCycles 之外的深度计算防御——不依赖 validate 顺序）。
 */
function queryDepth(doc: DocumentNode): number {
  // fragment name → 定义（先收集——spread 处原地展开接续当前深度）
  const fragments = new Map<string, any>()
  for (const def of doc.definitions) {
    if (def.kind === 'FragmentDefinition') fragments.set(def.name.value, def)
  }
  let max = 0
  function walk(node: any, depth: number, visited: Set<string>) {
    if (depth > max) max = depth
    if (node.kind === 'SelectionSet') {
      for (const sel of node.selections) walk(sel, depth, visited)
      return
    }
    if (node.kind === 'FragmentSpread') {
      const name = node.name.value
      if (visited.has(name)) return // 循环：跳过（已计入展开上限）
      const frag = fragments.get(name)
      if (!frag) return // 未知 fragment：validate 会报——深度计算忽略
      const v = new Set(visited)
      v.add(name)
      walk(frag.selectionSet, depth, v) // spread 原地展开——当前深度接续（不加深）
      return
    }
    // Field / InlineFragment / OperationDefinition / FragmentDefinition——selectionSet 加深一层
    if (node.selectionSet) walk(node.selectionSet, depth + 1, visited)
  }
  for (const def of doc.definitions) {
    if (def.kind === 'OperationDefinition') walk(def, 0, new Set())
  }
  return max
}

/** G3：GraphQL HTTP 错误（schema 构建/context 等请求级准备失败）——统一错误文档 */
class GraphHttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GraphHttpError'
    this.status = status
  }
}

/** 统一 GraphQL 错误文档（{ errors: [{ message }] }——规范形状） */
function graphErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err)
  const status = err instanceof GraphHttpError ? err.status : 500
  return Response.json({ errors: [{ message }] }, { status })
}

async function executeQuery(
  schema: GraphQLSchema,
  params: GraphQLParams,
  options: GraphQLOptions,
  req: Request,
  ctx: Context,
): Promise<Response> {
  // Depth limit
  const maxDepth = options.maxDepth ?? 10
  if (maxDepth > 0) {
    try {
      const doc = parse(params.query)
      const depth = queryDepth(doc)
      if (depth > maxDepth) {
        return Response.json(
          { errors: [{ message: `Query depth ${depth} exceeds limit ${maxDepth}` }] },
          { status: 400 },
        )
      }
      const validationErrors = validateQuery(schema, doc)
      if (validationErrors.length > 0) {
        return Response.json(
          { errors: validationErrors.map((e) => ({ message: e.message })) },
          { status: 400 },
        )
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return Response.json({ errors: [{ message: `Parse error: ${msg}` }] }, { status: 400 })
    }
  }

  // Timeout
  const timeout = options.timeout ?? 30_000

  // G3：context 构造纳入错误面（旧代码 try 外 → HTML 500 + 控制台堆栈）
  let contextValue: unknown
  try {
    contextValue = options.context ? await options.context(req, ctx) : ctx
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ errors: [{ message: msg }] }, { status: 500 })
  }

  try {
    const resultPromise = executeGraphQL({
      schema,
      source: params.query,
      rootValue: options.rootValue,
      contextValue,
      variableValues: params.variables,
      operationName: params.operationName,
    }) as any

    let result
    if (timeout > 0) {
      let timer: ReturnType<typeof setTimeout> | null = null
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Query timeout')), timeout)
      })
      result = await Promise.race([resultPromise, timeoutPromise])
      if (timer) clearTimeout(timer)
    } else {
      result = await resultPromise
    }

    // G2：请求级错误（parse/validation——errors 无 path）400；执行错误（field 级——
    // errors 带 path + 部分 data）200——graphql-over-http 规范（旧代码一律 400）
    const requestLevel = (result.errors ?? []).some((e: any) => !e.path)
    return Response.json(result, { status: requestLevel ? 400 : 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ errors: [{ message: msg }] }, { status: 500 })
  }
}

function graphiqlHTML(endpoint: string): string {
  const safeEndpoint = endpoint.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/</g, '\\x3C')
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
</html>`
}



/** @internal */
export function createGraphqlRouter(handler: GraphQLHandler): Router {
  const r = new Router()

  async function getSchema(
    req: Request,
    ctx: Context,
  ): Promise<{ options: GraphQLOptions; schema: GraphQLSchema }> {
    const options = await handler(req, ctx)
    let schema: GraphQLSchema
    try {
      schema = buildSchemaFromOptions(options)
    } catch (err) {
      // G3：SDL 语法错误等构建失败 → 统一错误文档（旧代码：未捕获 → 非 JSON 面）
      throw new GraphHttpError(500, `schema 构建失败: ${err instanceof Error ? err.message : String(err)}`)
    }
    return { options, schema }
  }

  /** 路由统一入口：schema 准备失败 → 500 错误文档（G3） */
  async function withSchema(
    req: Request,
    ctx: Context,
    fn: (g: { options: GraphQLOptions; schema: GraphQLSchema }) => Promise<Response> | Response,
  ): Promise<Response> {
    let g: { options: GraphQLOptions; schema: GraphQLSchema }
    try {
      g = await getSchema(req, ctx)
    } catch (err) {
      return graphErrorResponse(err)
    }
    return fn(g)
  }

  r.get('/', async (req, ctx) =>
    withSchema(req, ctx, async ({ options, schema }) => {
      const url = new URL(req.url)

      if (options.graphiql && !url.searchParams.has('query')) {
        return new Response(graphiqlHTML(url.pathname), {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        })
      }

      const params = parseParamsFromGet(url)
      if (params === null) {
        return Response.json({ errors: [{ message: 'Missing query' }] }, { status: 400 })
      }
      if ('error' in params) {
        // G5：variables 语法错误 → 具体信息（旧代码吞成 'Missing query'——误导）
        return Response.json({ errors: [{ message: params.error }] }, { status: 400 })
      }

      return executeQuery(schema, params, options, req, ctx)
    }),
  )

  r.post('/', async (req, ctx) =>
    withSchema(req, ctx, async ({ options, schema }) => {
      // G6：graphql-over-http 规范——仅 application/json（415；旧代码任意类型 400 Missing query）
      const ct = req.headers.get('content-type') ?? ''
      if (!ct.toLowerCase().includes('application/json')) {
        return Response.json(
          { errors: [{ message: 'Unsupported Media Type: expected application/json' }] },
          { status: 415 },
        )
      }
      const params = await parseParamsFromPost(req)
      if (!params) {
        return Response.json({ errors: [{ message: 'Missing query' }] }, { status: 400 })
      }
      return executeQuery(schema, params, options, req, ctx)
    }),
  )

  return r
}
