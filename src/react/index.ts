import { createElement, type ReactElement, type ComponentType } from 'react'
import { renderToReadableStream, type ReactDOMServerReadableStream } from 'react-dom/server'
import type { Middleware } from '../types.ts'
import { HttpError } from '../types.ts'
import { Router } from '../core/router.ts'
import type { ReactOptions, RenderOptions, ReactRouterOptions, ReactAppOptions } from './types.ts'
import { loadTsxComponent, setReactCacheDir } from './compile.ts'
import { ServerDataContext } from './context.ts'

// ═══════════════════════════════════════════════════════════════
// HtmlShell
// ═══════════════════════════════════════════════════════════════

function HtmlShell({ children, importMap, stylesheets, data }: {
  children: ReactElement
  importMap?: { imports?: Record<string, string> }
  stylesheets?: string[]
  data?: Record<string, unknown>
}): ReactElement {
  const headChildren: ReactElement[] = [
    createElement('meta', { charSet: 'utf-8', key: 'charset' }) as unknown as ReactElement,
    createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1', key: 'viewport' }) as unknown as ReactElement,
  ]
  if (stylesheets) {
    for (const href of stylesheets) {
      headChildren.push(
        createElement('link', { rel: 'stylesheet', href, key: `css-${href}` }) as unknown as ReactElement,
      )
    }
  }
  if (importMap) {
    headChildren.push(
      createElement('script', {
        type: 'importmap',
        key: 'importmap',
        dangerouslySetInnerHTML: { __html: JSON.stringify(importMap) },
      }) as unknown as ReactElement,
    )
  }

  const bodyChildren: ReactElement[] = [
    createElement('div', { id: 'root', key: 'root' }, children),
  ]

  // Inject server data for client-side useServerData()
  if (data && Object.keys(data).length > 0) {
    bodyChildren.push(
      createElement('script', {
        id: '__WEIFUWU_DATA__',
        type: 'application/json',
        key: 'weifuwu-data',
        dangerouslySetInnerHTML: { __html: JSON.stringify(data).replace(/</g, '\\u003c') },
      }) as unknown as ReactElement,
    )
  }

  return createElement('html', { lang: 'en' },
    createElement('head', null, ...headChildren),
    createElement('body', null, ...bodyChildren),
  ) as unknown as ReactElement
}

// ═══════════════════════════════════════════════════════════════
// Shared render pipeline
// ═══════════════════════════════════════════════════════════════

async function renderComponent(
  Component: ComponentType,
  data: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layout: ComponentType<any> | null,
  renderOpts: RenderOptions,
): Promise<Response> {
  let element: ReactElement = createElement(Component, renderOpts.props ?? {})

  if (layout) {
    element = createElement(layout, { children: element })
  }

  // Wrap in ServerDataContext (always, for client hydration to match)
  element = createElement(ServerDataContext.Provider, { value: data }, element)

  const page = createElement(HtmlShell, {
    children: element,
    importMap: renderOpts.importMap,
    stylesheets: renderOpts.stylesheets,
    data: Object.keys(data).length > 0 ? data : undefined,
  })

  const rstream: ReactDOMServerReadableStream = await renderToReadableStream(page, {
    bootstrapScripts: renderOpts.bootstrapScripts,
    bootstrapModules: renderOpts.bootstrapModules,
  })

  if (renderOpts.stream === false) {
    await rstream.allReady
  }

  return new Response(rstream as unknown as ReadableStream<Uint8Array>, {
    status: renderOpts.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...renderOpts.headers },
  })
}

/**
 * React SSR middleware — injects `ctx.render(path, opts?)`.
 *
 * Options:
 * - `layout`: Wrap every page in a shared layout component (nav, footer, etc.)
 *
 * For Tailwind CSS: use `tailwindDev` middleware.
 * For client bundles: use `esbuildDev` middleware.
 *
 * @example
 * ```ts
 * app.use(tailwindDev({ '/assets/tailwind.css': { entry: './styles/input.css' } }))
 * app.use(esbuildDev({ '/assets/client.js': { entry: './client.ts', ... } }))
 * app.use(react({ layout: './components/PageShell.tsx' }))
 * app.get('/', (_req, ctx) => ctx.render('./pages/HomePage.tsx', {
 *   stylesheets: ['/assets/tailwind.css'],
 *   bootstrapModules: ['/assets/client.js'],
 * }))
 * ```
 */
export function react(opts?: ReactOptions): Middleware {
  // Configure compilation cache directory
  if (opts?.cacheDir) setReactCacheDir(opts.cacheDir)

  // Pre-load layout component once at startup (it's shared across all routes)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let LayoutComponent: ComponentType<any> | null = null
  let layoutLoaded = false
  let layoutLoadError: Error | null = null

  async function getLayout() {
    if (!opts?.layout) return null
    if (layoutLoaded) {
      if (layoutLoadError) throw layoutLoadError
      return LayoutComponent
    }
    try {
      LayoutComponent = await loadTsxComponent(opts.layout)
      layoutLoaded = true
      return LayoutComponent
    } catch (err) {
      layoutLoadError = err instanceof Error ? err : new Error(String(err))
      layoutLoaded = true
      throw layoutLoadError
    }
  }

  return async (_req, ctx, next) => {
    ctx.render = async (path: string, renderOpts?: RenderOptions) => {
      // Run loader if provided — merges into data
      let data = renderOpts?.data ?? {}
      if (renderOpts?.loader) {
        try {
          const loaderData = await renderOpts.loader(ctx)
          data = { ...data, ...loaderData }
        } catch (err) {
          // If loader throws HttpError, use its status
          if (err instanceof HttpError && !renderOpts?.status) {
            renderOpts = { ...renderOpts, status: (err as HttpError).status }
          }
          throw err
        }
      }

      const Component = await loadTsxComponent(path)
      const layout = await getLayout()
      return renderComponent(Component, data, layout, renderOpts ?? {})
    }
    return next(_req, ctx)
  }
}

// ═══════════════════════════════════════════════════════════════
// reactRouter — auto-register routes from a shared config
// ═══════════════════════════════════════════════════════════════

/** Extract the import path from a dynamic import function. */
function extractImportPath(fn: () => Promise<unknown>): string {
  const src = fn.toString()
  const m = src.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/)
  if (!m) throw new Error(`Cannot extract import path from: ${src}`)
  return m[1]
}

/**
 * Auto-register routes from a shared route config.
 *
 * Use a single routes file shared between server and client to eliminate duplication.
 * Routes with data dependencies use the `loaders` option — request ctx is passed
 * to the loader, which can throw `HttpError` for non-200 status codes.
 *
 * @example
 * ```ts
 * // routes.ts — shared by server and client
 * export const routes = {
 *   '/':        () => import('./pages/Home.tsx'),
 *   '/users':   () => import('./pages/Users.tsx'),
 *   '/users/:id': () => import('./pages/UserDetail.tsx'),
 * }
 *
 * // server.ts
 * import { reactRouter } from 'weifuwu/react'
 * import { routes } from './routes.ts'
 *
 * reactRouter(app, routes, {
 *   layout: './layouts/Root.tsx',
 *   stylesheets: ['/assets/tailwind.css'],
 *   bootstrapModules: ['/assets/client.js'],
 *   loaders: {
 *     '/users': async (ctx) => ({ users: await db.listUsers() }),
 *     '/users/:id': async (ctx) => {
 *       const user = await db.findUser(ctx.params.id)
 *       if (!user) throw new HttpError('Not found', 404)
 *       return { user }
 *     },
 *   },
 * })
 *
 * // client.ts — same routes config, no loaders
 * import { createBrowserRouter } from 'weifuwu/react/client'
 * import { routes } from './routes.ts'
 *
 * createBrowserRouter({ layout: Root, routes })
 * ```
 */
export function reactRouter(
  app: Router,
  routes: Record<string, () => Promise<{ default: ComponentType }>>,
  opts: ReactRouterOptions = {},
): void {
  // Pre-load layout
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let LayoutComponent: ComponentType<any> | null = null
  let layoutPromise: Promise<ComponentType<any> | null> | null = null

  async function getLayout(): Promise<ComponentType<any> | null> {
    if (!opts.layout) return null
    if (LayoutComponent) return LayoutComponent
    if (!layoutPromise) {
      layoutPromise = loadTsxComponent(opts.layout).then(c => {
        LayoutComponent = c
        return c
      })
    }
    return layoutPromise
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const [path, importer] of Object.entries(routes)) {
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    app.get(path, async (_req, ctx) => {
      const cmpPath = extractImportPath(importer)
      const Component = await loadTsxComponent(cmpPath)
      const layout = await getLayout()

      // Execute per-route loader if present
      let data: Record<string, unknown> = {}
      const loader = opts.loaders?.[path]
      if (loader) {
        try {
          data = await loader(ctx)
        } catch (err) {
          // Preserve HttpError status
          const status = err instanceof HttpError ? (err as HttpError).status : 500
          throw err
        }
      }

      return renderComponent(Component, data, layout, opts as RenderOptions)
    })
  }
}

// ═══════════════════════════════════════════════════════════════
// createReactApp — unified React app setup
// ═══════════════════════════════════════════════════════════════

/**
 * Create a React SSR app in one call — replaces react(), reactRouter(),
 * and manual esbuildDev configuration.
 *
 * @example
 * ```ts
 * const app = new Router()
 * createReactApp(app, {
 *   pages: {
 *     '/':        './pages/Home.tsx',
 *     '/users':   './pages/Users.tsx',
 *   },
 *   layout:  './layouts/Root.tsx',
 *   notFound: './pages/NotFound.tsx',
 *   loaders: {
 *     '/users': async (ctx) => ({ users: await db.list() }),
 *   },
 *   stylesheets: ['/assets/tailwind.css'],
 *   client: { minify: false },
 * })
 * serve(app, { port: 3000 })
 * ```
 */
export async function createReactApp(app: Router, opts: ReactAppOptions): Promise<void> {
  // 1. Tailwind CSS (before SSR, so stylesheet path is ready)
  const stylesheets = [...(opts.stylesheets ?? [])]
  if (opts.tailwind) {
    const twPath = opts.tailwind.path ?? '/assets/tailwind.css'
    const twEntry = opts.tailwind.entry ?? './styles/input.css'
    const { tailwindDev } = await import('../middleware/tailwind-dev.ts')
    app.use(tailwindDev({ entries: { [twPath]: { entry: twEntry } } }))
    if (!stylesheets.includes(twPath)) {
      stylesheets.push(twPath)
    }
  }

  // 2. SSR middleware (layout + ctx.render)
  app.use(react({ layout: opts.layout, cacheDir: opts.cacheDir }))

  // 3. Register page routes
  const renderOpts: RenderOptions = {
    stylesheets: stylesheets.length > 0 ? stylesheets : undefined,
    bootstrapModules: opts.bootstrapModules,
    stream: opts.stream,
  }

  for (const [path, component] of Object.entries(opts.pages)) {
    const loader = opts.loaders?.[path]
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    app.get(path, async (_req, ctx) => {
      let data: Record<string, unknown> = {}
      if (loader) {
        try {
          data = await loader(ctx)
        } catch (err) {
          // Let the global onError handler render the notFound page
          throw err
        }
      }
      return ctx.render(component, { ...renderOpts, data })
    })
  }

  // 3. Error handler with notFound page
  if (opts.notFound) {
    const notFoundPath = opts.notFound
    app.onError((err, _req, ctx) => {
      const status = err instanceof HttpError ? err.status : 500
      if (ctx.render) {
        return ctx.render(notFoundPath, { ...renderOpts, status, data: {} })
      }
      return new Response('Internal Server Error', { status })
    })
  }

  // 4. Client bundle (optional)
  if (opts.client !== undefined) {
    const { esbuildDev } = await import('../middleware/esbuild-dev.ts')
    app.use(esbuildDev({
      entries: {
        [opts.client?.path ?? '/assets/client.js']: {
          clientRouter: {
            pages: opts.pages,
            layout: opts.layout,
            layoutExport: opts.layoutExport,
            fallback: opts.notFound,
          },
          bundle: true,
          splitting: opts.client?.splitting ?? true,
          minify: opts.client?.minify ?? false,
        },
      },
    }))
  }
}

// ═══════════════════════════════════════════════════════════════
// createApp — one function to create a fully configured Router
// ═══════════════════════════════════════════════════════════════

/**
 * Create a React SSR app in one call.
 * Returns a pre-configured Router with SSR, routing, error handling,
 * Tailwind CSS, and client bundle generation all set up.
 *
 * @example
 * ```ts
 * import { createApp, serve } from 'weifuwu'
 *
 * const app = await createApp({
 *   pages: {
 *     '/':      './pages/Home.tsx',
 *     '/users': './pages/Users.tsx',
 *   },
 *   layout:  './layouts/Root.tsx',
 *   notFound: './pages/NotFound.tsx',
 *   tailwind: { entry: './styles/input.css' },
 *   loaders: {
 *     '/users': async (ctx) => ({ users: await db.list() }),
 *   },
 * })
 *
 * app.get('/api/hello', () => Response.json({ message: 'hi' }))
 * serve(app, { port: 3000 })
 * ```
 */
export async function createApp(opts: ReactAppOptions): Promise<Router> {
  const app = new Router()
  // Set up basic middleware (users can add more with app.use() later)
  const { trace } = await import('../core/trace.ts')
  const { logger } = await import('../core/logger.ts')
  app.use(trace())
  app.use(logger())

  await createReactApp(app, opts)
  return app
}

// ═══════════════════════════════════════════════════════════════
// Link — client-side navigation component
// ═══════════════════════════════════════════════════════════════

/**
 * Client-side navigation link. Renders as `<a>` on the server.
 * On the client, intercepted by `createBrowserRouter` for SPA navigation.
 */
export function Link({ href, children, ...props }: {
  href: string
  children: React.ReactNode
  [key: string]: unknown
}): ReactElement {
  return createElement('a', { href, ...props }, children) as unknown as ReactElement
}

export { ErrorBoundary } from './error-boundary.ts'

export { useServerData } from './hooks.ts'
export { ServerDataContext } from './context.ts'
export type { ReactOptions, RenderOptions, ReactRouterOptions } from './types.ts'
