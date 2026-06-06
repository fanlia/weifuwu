import { createElement } from 'react'
import { compileTsx } from './compile.ts'
import type { Middleware } from '../types.ts'
import { TextEncoder } from 'node:util'

export function errorBoundary(errorPath: string): Middleware {
  return async (req, ctx, next) => {
    try {
      return await next(req, ctx)
    } catch (err) {
      const mod = await compileTsx(errorPath)
      const ErrorComponent = mod.default
      if (!ErrorComponent) throw err

      const layouts = (ctx.layoutStack || []).map((l: any) => l.component)
      const stream = await import('react-dom/server').then(m => m.renderToReadableStream(
        createElement(ErrorComponent, {
          error: err instanceof Error ? err : new Error(String(err)),
          reset: () => { },
        }),
      ))

      const reader = stream.getReader()
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }

      const encoder = new TextEncoder()
      const body = chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length)
        merged.set(acc)
        merged.set(c, acc.length)
        return merged
      }, new Uint8Array(0))

      return new Response(body as BodyInit, {
        status: 500,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    }
  }
}
