import { createElement, type ReactElement, type ComponentType } from 'react'
import { renderToReadableStream, type ReactDOMServerReadableStream } from 'react-dom/server'
import type { Middleware } from '../types.ts'
import { HttpError } from '../types.ts'
import type { ReactOptions, RenderOptions } from './types.ts'
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
// Layout cache
// ═══════════════════════════════════════════════════════════════
// react() middleware
// ═══════════════════════════════════════════════════════════════

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
      let status = renderOpts?.status
      if (renderOpts?.loader) {
        try {
          const loaderData = await renderOpts.loader(ctx)
          data = { ...data, ...loaderData }
        } catch (err) {
          // If loader throws HttpError, use its status
          if (err instanceof HttpError && !status) {
            status = (err as HttpError).status
          }
          throw err
        }
      }

      const Component = await loadTsxComponent(path)
      let element: ReactElement = createElement(Component, renderOpts?.props ?? {})

      // Wrap in layout if configured
      if (opts?.layout) {
        const Layout = await getLayout()
        if (Layout) {
          element = createElement(Layout, { children: element })
        }
      }

      // Wrap in ServerDataContext (always, for client hydration to match)
      element = createElement(ServerDataContext.Provider, { value: data }, element)

      const page = createElement(HtmlShell, {
        children: element,
        importMap: renderOpts?.importMap,
        stylesheets: renderOpts?.stylesheets,
        data: Object.keys(data).length > 0 ? data : undefined,
      })

      const rstream: ReactDOMServerReadableStream = await renderToReadableStream(page, {
        bootstrapScripts: renderOpts?.bootstrapScripts,
        bootstrapModules: renderOpts?.bootstrapModules,
      })

      // When streaming is disabled, wait for all Suspense boundaries to resolve
      if (renderOpts?.stream === false) {
        await rstream.allReady
      }

      return new Response(rstream as unknown as ReadableStream<Uint8Array>, {
        status: renderOpts?.status ?? 200,
        headers: { 'content-type': 'text/html; charset=utf-8', ...renderOpts?.headers },
      })
    }
    return next(_req, ctx)
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
export type { ReactOptions, RenderOptions } from './types.ts'
