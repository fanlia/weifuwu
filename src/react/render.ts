import {
  createElement,
  type ReactElement,
  type ComponentType,
  type ReactNode,
} from 'react'
import { renderToReadableStream } from 'react-dom/server'
import { ServerDataContext } from './context.ts'
import type { RenderOptions } from './types.ts'

function wrapElement(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  data: Record<string, unknown>,
): ReactElement {
  let wrapped: ReactElement = element
  for (let i = layouts.length - 1; i >= 0; i--) {
    wrapped = createElement(layouts[i], null, wrapped)
  }
  return createElement(ServerDataContext.Provider, { value: data }, wrapped)
}

/**
 * Server-render a React element to a streaming HTML Response.
 *
 * Wraps with layouts + ServerDataContext, then delegates to React's
 * renderToReadableStream. The Layout is responsible for <html>, <head>,
 * <title>, <meta>, and the __WEIFUWU_DATA__ script tag.
 */
export async function render(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  options: RenderOptions = {},
): Promise<Response> {
  const data = options.data ?? {}
  const wrapped = wrapElement(element, layouts, data)

  const stream = (await renderToReadableStream(wrapped)) as unknown as ReadableStream<Uint8Array>

  return new Response(stream, {
    status: options.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...options.headers,
    },
  })
}
