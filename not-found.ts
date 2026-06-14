/* eslint-disable @typescript-eslint/no-explicit-any */
import { createElement } from 'react'
import { compile } from './compile.ts'
import { isDev } from './env.ts'
import type { Handler, Context } from './types.ts'
import { streamResponse } from './stream.ts'
import { buildHtmlShell } from './html-shell.ts'

export function notFound(path?: string): Handler {
  return async (_req, ctx) => {
    if (!path) return new Response('Not Found', { status: 404 })

    let Component: any
    try {
      const mod = await compile(path)
      Component = mod?.default
    } catch {
      return new Response('Not Found', { status: 404 })
    }
    if (!Component) return new Response('Not Found', { status: 404 })

    const ctx2 = ctx as Context & {
      layoutStack?: Array<{ component: unknown }>
      mountPath?: string
      tailwind?: { css: string; url: string }
    }
    const layouts = ctx2.layoutStack || []
    const layoutComponents = layouts.map((l) => l.component)
    const base = (ctx2.mountPath || '').replace(/\/$/, '')

    let element: any = createElement(
      'div',
      { id: '__weifuwu_root' },
      createElement(Component, null),
    )

    element = buildHtmlShell('404', element, layoutComponents)

    const { renderToReadableStream } = await import('react-dom/server')
    const stream = await renderToReadableStream(element)
    return streamResponse(stream, {
      ctx: ctx2,
      base,
      isDev: isDev(),
      tailwind: ctx2.tailwind,
      status: 404,
    })
  }
}
