import { buildSchema, graphql as executeGraphQL, type GraphQLSchema } from 'graphql'
import { makeExecutableSchema } from '@graphql-tools/schema'
import type { Context } from './types.ts'
import { Router } from './router.ts'

export interface GraphQLOptions {
  schema: string | GraphQLSchema
  rootValue?: any
  resolvers?: any
  context?: (req: Request, ctx: Context) => Record<string, any> | Promise<Record<string, any>>
  graphiql?: boolean
}

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
    try { variables = JSON.parse(variablesStr) } catch { return null }
  }
  return { query, variables, operationName: url.searchParams.get('operationName') || undefined }
}

async function parseParamsFromPost(req: Request): Promise<GraphQLParams | null> {
  try {
    const body = await req.json() as { query?: string; variables?: Record<string, any>; operationName?: string }
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

async function executeQuery(
  schema: GraphQLSchema,
  params: GraphQLParams,
  options: GraphQLOptions,
  req: Request,
  ctx: Context,
): Promise<Response> {
  const contextValue = options.context ? await options.context(req, ctx) : ctx
  const result = await executeGraphQL({
    schema,
    source: params.query,
    rootValue: options.rootValue,
    contextValue,
    variableValues: params.variables,
    operationName: params.operationName,
  }) as any
  return Response.json(result, { status: result.errors ? 400 : 200 })
}

function graphiqlHTML(endpoint: string): string {
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

      const fetcher = createGraphiQLFetcher({ url: "${endpoint}" });

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

export function graphql(options: GraphQLOptions): Router {
  const schema = buildSchemaFromOptions(options)
  const r = new Router()

  r.get('/', async (req, ctx) => {
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
    const params = await parseParamsFromPost(req)
    if (!params) {
      return Response.json({ errors: [{ message: 'Missing query' }] }, { status: 400 })
    }
    return executeQuery(schema, params, options, req, ctx)
  })

  return r
}
