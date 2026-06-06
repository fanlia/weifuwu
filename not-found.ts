import { compileTsx } from './compile.ts'
import type { Handler } from './types.ts'

export function notFound(path?: string): Handler {
  return async (req, ctx) => {
    if (!path) return new Response('Not Found', { status: 404 })

    const mod = await compileTsx(path)
    const Component = mod?.default
    const body = Component ? '404 - Not Found' : '404 - Not Found'

    return new Response(body, {
      status: 404,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
}
