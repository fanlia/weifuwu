import { createElement } from 'react'
import { compile } from './compile.ts'
import { isDev } from './env.ts'
import type { Middleware } from './types.ts'
import { streamResponse } from './stream.ts'

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

      if (layouts.length === 0) {
        element = createElement('html', { lang: 'en' },
          createElement('head', null,
            createElement('meta', { charSet: 'utf-8' }),
            createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
            createElement('title', null, '500'),
          ),
          createElement('body', null, element),
        )
      } else {
        for (const L of layouts.toReversed()) {
          element = createElement(L, { children: element })
        }
      }

      const { renderToReadableStream } = await import('react-dom/server')
      const stream = await renderToReadableStream(element)
      return streamResponse(stream, {
        ctx: ctx as any,
        base,
        isDev: isDev(),
        compiledTailwindCss: (ctx as any).compiledTailwindCss,
        status: 500,
      })
    }
  }
}
