import { Fragment, type ReactElement, type ComponentType, type ReactNode } from 'react'
import type { Context } from '../types.ts'
import type { ReactOptions, RenderOptions, ReactMiddleware } from './types.ts'
import { render, renderStream } from './render.ts'

const LAYOUTS_KEY = Symbol.for('weifuwu:react:layouts')
const SETUP_KEY = Symbol.for('weifuwu:react:setup')
const REQ_KEY = Symbol.for('weifuwu:react:req')

/** Internal property bag stored on ctx via Symbol keys. */
type InternalBag = Record<string | symbol, unknown>

function bag(ctx: Context): InternalBag {
  return ctx as unknown as InternalBag
}

/** Check if the request is a client-side data fetch (?_data query param). */
function isDataRequest(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.has('_data')
  } catch {
    return false
  }
}

/**
 * React SSR middleware.
 *
 * Injects ctx.render() and ctx.renderStream() for server-side rendering
 * React components to HTML. Supports layout composition via mount nesting.
 *
 * @example
 * ```ts
 * app.use(react({
 *   layout: ({ children }) => (
 *     <html><body><div id="root">{children}</div></body></html>
 *   ),
 * }))
 *
 * app.get('/', async (req, ctx) => {
 *   return ctx.render(<Home />, { data: { title: 'Home' } })
 * })
 * ```
 */
export function react(opts: ReactOptions = {}): ReactMiddleware {
  const layout: ComponentType<{ children: ReactNode }> = opts.layout ?? Fragment

  const mw: ReactMiddleware = (req, ctx, next) => {
    const b = bag(ctx)

    // Accumulate layouts for each nesting level
    const layouts: ComponentType<{ children: ReactNode }>[] =
      (b[LAYOUTS_KEY] as ComponentType<{ children: ReactNode }>[]) ?? []
    b[LAYOUTS_KEY] = layouts
    layouts.push(layout)

    // Set up ctx.render / ctx.renderStream once (first react() call wins)
    if (!b[SETUP_KEY]) {
      b[SETUP_KEY] = true

      ctx.render = (element: ReactElement, renderOpts?: RenderOptions) => {
        // Auto ?_data: return JSON instead of HTML for SPA navigation
        if (renderOpts?.data && isDataRequest(req)) {
          return Promise.resolve(Response.json(renderOpts.data))
        }
        return Promise.resolve(render(element, layouts, renderOpts))
      }

      ctx.renderStream = (element: ReactElement, renderOpts?: RenderOptions) => {
        if (renderOpts?.data && isDataRequest(req)) {
          return Promise.resolve(Response.json(renderOpts.data))
        }
        return renderStream(element, layouts, renderOpts)
      }
    }

    return next(req, ctx)
  }

  return mw
}

export { useServerData } from './hooks.ts'
export { ServerDataContext } from './context.ts'
export { Link, useParams, useNavigate, useRevalidate, Form, useNavigation } from './navigation.ts'
export type { LinkProps, FormProps, NavigationState } from './navigation.ts'
export { ErrorBoundary } from './error-boundary.ts'
export type { ErrorBoundaryProps } from './error-boundary.ts'
export type { ReactOptions, RenderOptions, ReactInjected } from './types.ts'
