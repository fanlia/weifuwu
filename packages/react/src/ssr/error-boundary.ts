import { createElement, type ReactNode } from 'react'
import { compile } from './compile.ts'
import { isDev, type Middleware, type Context } from '@weifuwujs/core'
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

      const ctx2 = ctx as Context & {
        layoutStack?: Array<{ component: unknown }>
        mountPath?: string
        tailwind?: { css: string; url: string }
      }
      const layouts = (ctx2.layoutStack || []).map((l) => l.component)
      const base = (ctx2.mountPath || '').replace(/\/$/, '')

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let element: ReactNode = createElement(ErrorComponent as any, {
        error: err instanceof Error ? err : new Error(String(err)),
        reset: () => {},
      })

      element = buildHtmlShell('500', element, layouts)

      const { renderToReadableStream } = await import('react-dom/server')
      const stream = await renderToReadableStream(element)
      return streamResponse(stream, {
        ctx: ctx2,
        base,
        isDev: isDev(),
        tailwind: ctx2.tailwind,
        status: 500,
      })
    }
  }
}
