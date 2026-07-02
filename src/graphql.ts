/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  buildSchema,
  graphql as executeGraphQL,
  type GraphQLSchema,
  validate as validateQuery,
  parse,
  type DocumentNode,
} from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
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

function parseParamsFromGet(url: URL): GraphQLParams | null {
  const query = url.searchParams.get('query')
  if (!query) return null
  let variables = {}
  const variablesStr = url.searchParams.get('variables')
  if (variablesStr) {
    try {
      variables = JSON.parse(variablesStr)
    } catch {
      return null
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

function buildSchemaFromOptions(options: GraphQLOptions): GraphQLSchema {
  if (typeof options.schema === 'string') {
    return options.resolvers
      ? makeExecutableSchema({ typeDefs: options.schema, resolvers: options.resolvers })
      : buildSchema(options.schema)
  }
  return options.schema
}

/** Count max nesting depth of a GraphQL query. */
function queryDepth(doc: DocumentNode): number {
  let max = 0
  function walk(node: any, depth: number) {
    if (depth > max) max = depth
    if (node.selectionSet) {
      for (const sel of node.selectionSet.selections) {
        walk(sel, depth + 1)
      }
    }
  }
  for (const def of doc.definitions) {
    if (def.kind === 'OperationDefinition') {
      walk(def, 0)
    }
  }
  return max
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
  const contextValue = options.context ? await options.context(req, ctx) : ctx

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

    return Response.json(result, { status: result.errors ? 400 : 200 })
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

export function graphql(handler: GraphQLHandler): Router {
  const r = new Router()
  let cachedOptions: GraphQLOptions | null = null
  let cachedSchema: GraphQLSchema | null = null

  async function getSchema(
    req: Request,
    ctx: Context,
  ): Promise<{ options: GraphQLOptions; schema: GraphQLSchema }> {
    const options = await handler(req, ctx)
    // Cache schema — handler must return the same schema reference for cache to work.
    // If schema changes (e.g. hot-reload), return a different object reference.
    if (cachedSchema && cachedOptions === options) {
      return { options, schema: cachedSchema }
    }
    const schema = buildSchemaFromOptions(options)
    cachedOptions = options
    cachedSchema = schema
    return { options, schema }
  }

  r.get('/', async (req, ctx) => {
    const { options, schema } = await getSchema(req, ctx)
    const url = new URL(req.url)

    if (options.graphiql && !url.searchParams.has('query')) {
      return new Response(graphiqlHTML(url.pathname), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const params = parseParamsFromGet(url)
    if (!params) {
      return Response.json({ errors: [{ message: 'Missing query' }] }, { status: 400 })
    }

    return executeQuery(schema, params, options, req, ctx)
  })

  r.post('/', async (req, ctx) => {
    const { options, schema } = await getSchema(req, ctx)
    const params = await parseParamsFromPost(req)
    if (!params) {
      return Response.json({ errors: [{ message: 'Missing query' }] }, { status: 400 })
    }
    return executeQuery(schema, params, options, req, ctx)
  })

  return r
}
