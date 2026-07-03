import { createElement, type ReactElement, type ComponentType } from 'react'
import { renderToReadableStream, type ReactDOMServerReadableStream } from 'react-dom/server'
import type { Middleware } from '../types.ts'
import { HttpError } from '../types.ts'
import type { Router } from '../core/router.ts'
import type { ReactOptions, RenderOptions, ReactRouterOptions, ReactAppOptions } from './types.ts'
import { loadTsxComponent, loadTsxModule, setReactCacheDir } from './compile.ts'
import { ServerDataContext } from './context.ts'
import { tailwindDev } from '../middleware/tailwind-dev.ts'
import { esbuildDev } from '../middleware/esbuild-dev.ts'

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
/**
 * React SSR middleware — injects `ctx.render(path, opts?)`.
 *
 * **Lightweight mode** (no `pages`): returns middleware for `app.use()`.
 * Use with manual `app.get()` + `ctx.render()`.
 *
 * **Full mode** (has `pages`): returns a plugin for `app.plugin()`.
 * Handles routing, data loading, Tailwind, client bundle, and error pages.
 */
export function react(opts?: ReactOptions): Middleware
export function react(opts: ReactAppOptions): (app: Router) => void
export function react(
  opts?: ReactOptions | ReactAppOptions,
): Middleware | ((app: Router) => void) {
  // Full mode: pages → plugin
  if (opts && 'pages' in opts) {
    return (app: Router) => createFullReactApp(app, opts)
  }

  // Lightweight mode: middleware
  if (opts?.cacheDir) setReactCacheDir(opts.cacheDir)

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
      let data = renderOpts?.data ?? {}
      if (renderOpts?.loader) {
        try {
          const loaderData = await renderOpts.loader(ctx)
          data = { ...data, ...loaderData }
        } catch (err) {
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
// Full-mode react() — routing + tailwind + client + error handling
// ═══════════════════════════════════════════════════════════════

function createFullReactApp(app: Router, opts: ReactAppOptions): void {
  // 1. Tailwind CSS
  const stylesheets = [...(opts.stylesheets ?? [])]
  if (opts.tailwind) {
    const twPath = opts.tailwind.path ?? '/assets/tailwind.css'
    const twEntry = opts.tailwind.entry ?? './styles/input.css'
    app.use(tailwindDev({ entries: { [twPath]: { entry: twEntry } } }))
    if (!stylesheets.includes(twPath)) stylesheets.push(twPath)
  }

  // 2. SSR middleware (layout + ctx.render)
  app.use(react({ layout: opts.layout, cacheDir: opts.cacheDir }))

  // 3. Page routes
  const clientPath = opts.client?.path ?? '/assets/client.js'
  const bootstrapModules = [...(opts.bootstrapModules ?? [])]
  if (opts.client !== undefined && !bootstrapModules.includes(clientPath)) {
    bootstrapModules.push(clientPath)
  }

  const renderOpts: RenderOptions = {
    stylesheets: stylesheets.length > 0 ? stylesheets : undefined,
    bootstrapModules: bootstrapModules.length > 0 ? bootstrapModules : undefined,
    stream: opts.stream,
  }

  for (const [path, component] of Object.entries(opts.pages)) {
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    app.get(path, async (_req, ctx) => {
      let data: Record<string, unknown> = {}

      // Explicit loader from opts.loaders takes priority
      const loader = opts.loaders?.[path]
      if (loader) {
        try { data = await loader(ctx) } catch (err) { throw err }
      } else {
        // Auto-detect loader from page module exports
        const mod = await loadTsxModule(component)
        if (typeof mod.loader === 'function') {
          try {
            data = await (mod.loader as (c: typeof ctx) => Promise<Record<string, unknown>>)(ctx)
          } catch (err) { throw err }
        }
      }

      return ctx.render(component, { ...renderOpts, data })
    })
  }

  // 4. Error handler
  if (opts.notFound) {
    const notFoundPath = opts.notFound
    app.onError((err, _req, ctx) => {
      // Duck-type: instanceof fails across compiled module boundaries
      const status = (typeof err === 'object' && err !== null && 'status' in err)
        ? (err as { status: number }).status
        : 500
      if (ctx.render) {
        return ctx.render(notFoundPath, { ...renderOpts, status, data: {} })
      }
      return new Response('Internal Server Error', { status })
    })
  }

  // 5. Client bundle
  if (opts.client !== undefined) {
    app.use(esbuildDev({
      entries: {
        [clientPath]: {
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
export type { ReactOptions, RenderOptions, ReactRouterOptions, ReactAppOptions } from './types.ts'
