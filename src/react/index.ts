import { Fragment, createElement, type ReactElement, type ComponentType, type ReactNode } from 'react'
import type { Context } from '../types.ts'
import type { ReactOptions, RenderOptions, ReactMiddleware } from './types.ts'
import { render, renderStream } from './render.ts'
import { loadTsxComponent } from './compile.ts'

const LAYOUTS_KEY = Symbol.for('weifuwu:react:layouts')
const SETUP_KEY = Symbol.for('weifuwu:react:setup')

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

type LayoutSpec = ComponentType<{ children: ReactNode }> | string

async function resolveLayout(spec: LayoutSpec): Promise<ComponentType<{ children: ReactNode }>> {
  if (typeof spec === 'string') return loadTsxComponent(spec)
  return spec
}

async function resolveElement(
  value: ReactElement | string,
  props?: Record<string, unknown>,
): Promise<ReactElement> {
  if (typeof value === 'string') {
    const component = await loadTsxComponent(value)
    if (props && Object.keys(props).length > 0) {
      return createElement(component, props)
    }
    return createElement(component)
  }
  return value
}

/**
 * React SSR middleware.
 *
 * Injects ctx.render() and ctx.renderStream() for server-side rendering.
 * Both accept ReactElements or file paths to .tsx/.ts components.
 *
 * Layouts accumulate: each react() call via Router.mount() adds one layout.
 *
 * @example
 * ```ts
 * app.use(react({ layout: './components/Layout.tsx' }))
 *
 * app.get('/', async (req, ctx) => {
 *   return ctx.render('./components/HomePage.tsx', {
 *     data: { title: 'Home' },
 *   })
 * })
 * ```
 */
export function react(opts: ReactOptions = {}): ReactMiddleware {
  const layoutSpec: LayoutSpec = opts.layout ?? Fragment

  const mw: ReactMiddleware = (req, ctx, next) => {
    const b = bag(ctx)

    // Accumulate layout specs for each nesting level
    const specs: LayoutSpec[] = (b[LAYOUTS_KEY] as LayoutSpec[]) ?? []
    b[LAYOUTS_KEY] = specs
    specs.push(layoutSpec)

    // Set up ctx.render / ctx.renderStream once (first react() call wins)
    if (!b[SETUP_KEY]) {
      b[SETUP_KEY] = true

      ctx.render = async (element: ReactElement | string, renderOpts?: RenderOptions) => {
        if (renderOpts?.data && isDataRequest(req)) {
          return Response.json(renderOpts.data)
        }
        const el = await resolveElement(element, renderOpts?.props)
        const layouts = await Promise.all(specs.map(resolveLayout))
        return render(el, layouts, renderOpts)
      }

      ctx.renderStream = async (element: ReactElement | string, renderOpts?: RenderOptions) => {
        if (renderOpts?.data && isDataRequest(req)) {
          return Response.json(renderOpts.data)
        }
        const el = await resolveElement(element, renderOpts?.props)
        const layouts = await Promise.all(specs.map(resolveLayout))
        return renderStream(el, layouts, renderOpts)
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
