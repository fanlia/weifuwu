import { compile } from './compile.ts'
import type { Middleware } from './types.ts'

export function layout(path: string): Middleware {
  return async (req, ctx, next) => {
    const mod = await compile(path)
    const Component = mod.default
    if (!Component) throw new Error(`Layout ${path} has no default export`)

    ctx.layoutStack = [...(ctx.layoutStack || []), { path, component: Component }]
    return next(req, ctx)
  }
}
