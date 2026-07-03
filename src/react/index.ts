import { Fragment, createElement, type ReactElement, type ComponentType, type ReactNode } from 'react'
import type { Context, Middleware } from '../types.ts'
import type { ReactOptions, RenderOptions } from './types.ts'
import { render as renderImpl } from './render.ts'
import { loadTsxComponent } from './compile.ts'

const LAYOUTS_KEY = Symbol.for('weifuwu:react:layouts')
const SETUP_KEY = Symbol.for('weifuwu:react:setup')

type InternalBag = Record<string | symbol, unknown>
function bag(ctx: Context): InternalBag { return ctx as unknown as InternalBag }

function isDataRequest(req: Request): boolean {
  try { return new URL(req.url).searchParams.has('_data') } catch { return false }
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
    return createElement(component, props && Object.keys(props).length > 0 ? props : {})
  }
  return value
}

export function react(opts: ReactOptions = {}): Middleware {
  const layoutSpec: LayoutSpec = opts.layout ?? Fragment

  return (req, ctx, next) => {
    const b = bag(ctx)
    const specs: LayoutSpec[] = (b[LAYOUTS_KEY] as LayoutSpec[]) ?? []
    b[LAYOUTS_KEY] = specs
    specs.push(layoutSpec)

    if (!b[SETUP_KEY]) {
      b[SETUP_KEY] = true
      ctx.render = async (element: ReactElement | string, renderOpts?: RenderOptions) => {
        if (renderOpts?.data && isDataRequest(req)) {
          return Response.json(renderOpts.data)
        }
        const el = await resolveElement(element, renderOpts?.props)
        const layouts = await Promise.all(specs.map(resolveLayout))
        return renderImpl(el, layouts, renderOpts)
      }
    }
    return next(req, ctx)
  }
}

export { useServerData } from './hooks.ts'
export { ServerDataContext } from './context.ts'
export type { ReactOptions, RenderOptions } from './types.ts'
