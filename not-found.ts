import { createElement } from 'react'
import { compile } from './compile.ts'
import { isDev } from './env.ts'
import type { Handler } from './types.ts'
import { streamResponse } from './stream.ts'
import { buildHtmlShell } from './html-shell.ts'

export function notFound(path?: string): Handler {
  return async (req, ctx) => {
    if (!path) return new Response('Not Found', { status: 404 })

    let Component: any
    try {
      const mod = await compile(path)
      Component = mod?.default
    } catch {
      return new Response('Not Found', { status: 404 })
    }
    if (!Component) return new Response('Not Found', { status: 404 })

    const layouts = (ctx.layoutStack || [])
    const layoutComponents = layouts.map((l: any) => l.component)
    const base = (ctx.mountPath || '').replace(/\/$/, '')

    let element: any = createElement('div', { id: '__weifuwu_root' },
      createElement(Component, null),
    )

    element = buildHtmlShell('404', element, layoutComponents)

    const { renderToReadableStream } = await import('react-dom/server')
    const stream = await renderToReadableStream(element)
    return streamResponse(stream, {
      ctx: ctx as any,
      base,
        isDev: isDev(),
      compiledTailwindCss: (ctx as any).compiledTailwindCss,
      status: 404,
    })
  }
}
