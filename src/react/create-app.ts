import { Router } from '../core/router.ts'
import { trace } from '../core/trace.ts'
import { logger } from '../core/logger.ts'
import { HttpError } from '../types.ts'
import { tailwindDev } from '../middleware/tailwind-dev.ts'
import { esbuildDev } from '../middleware/esbuild-dev.ts'
import { react } from './index.ts'
import type { ReactAppOptions, RenderOptions } from './types.ts'

/**
 * Create a React SSR app in one call.
 * Returns a pre-configured Router with SSR, routing, error handling,
 * Tailwind CSS, and client bundle generation all set up.
 *
 * @example
 * ```ts
 * import { createApp } from 'weifuwu/react'
 *
 * const app = createApp({
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
export function createApp(opts: ReactAppOptions): Router {
  const app = new Router()
  app.use(trace())
  app.use(logger())

  createReactApp(app, opts)

  return app
}

/**
 * Configure an existing Router for React SSR.
 * Prefer `createApp()` for the common case; use this when you need
 * to insert custom middleware before the React setup.
 */
export function createReactApp(app: Router, opts: ReactAppOptions): void {
  // 1. Tailwind CSS (before SSR, so stylesheet path is ready)
  const stylesheets = [...(opts.stylesheets ?? [])]
  if (opts.tailwind) {
    const twPath = opts.tailwind.path ?? '/assets/tailwind.css'
    const twEntry = opts.tailwind.entry ?? './styles/input.css'
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

  // 4. Error handler with notFound page
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

  // 5. Client bundle (optional)
  if (opts.client !== undefined) {
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
