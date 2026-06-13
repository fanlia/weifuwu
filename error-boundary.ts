import { createElement } from 'react'
import { compile } from './compile.ts'
import { isDev } from './env.ts'
import type { Middleware } from './types.ts'
import { streamResponse } from './stream.ts'
import { buildHtmlShell } from './html-shell.ts'

export function errorBoundary(errorPath: string): Middleware {
  return async (req, ctx, next) => {
    try {
      return await next(req, ctx)
    } catch (err) {
      const mod = await compile(errorPath)
      const ErrorComponent = mod.default
      if (!ErrorComponent) throw err

      const layouts = (ctx.layoutStack || []).map((l: any) => l.component)
      const base = (ctx.mountPath || '').replace(/\/$/, '')

      let element: any = createElement(ErrorComponent, {
        error: err instanceof Error ? err : new Error(String(err)),
        reset: () => {},
      })

      element = buildHtmlShell('500', element, layouts)

      const { renderToReadableStream } = await import('react-dom/server')
      const stream = await renderToReadableStream(element)
      return streamResponse(stream, {
        ctx: ctx as any,
        base,
        isDev: isDev(),
        tailwind: (ctx as any).tailwind,
        status: 500,
      })
    }
  }
}
