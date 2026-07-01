import { compile } from './compile.ts'
import type { Middleware } from '@weifuwujs/core'

export function layout(path: string): Middleware {
  return async (req, ctx, next) => {
    const mod = await compile(path)
    const Component = mod.default
    if (!Component) throw new Error(`Layout ${path} has no default export`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(ctx as any).layoutStack = [...((ctx as any).layoutStack || []), { path, component: Component }]
    return next(req, ctx)
  }
}
