import {
  createElement,
  Fragment,
  type ReactElement,
  type ComponentType,
  type ReactNode,
} from 'react'
import { renderToString, renderToReadableStream } from 'react-dom/server'
import { ServerDataContext } from './context.ts'
import type { RenderOptions } from './types.ts'

/**
 * Wrap an element through the layout chain (inner → outer).
 * Then wrap in ServerDataContext.Provider + DataScript.
 */
function wrapElement(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  data: Record<string, unknown>,
): ReactElement {
  // Wrap element with layouts: innermost first, outermost last
  let wrapped: ReactElement = element
  for (let i = layouts.length - 1; i >= 0; i--) {
    wrapped = createElement(layouts[i], null, wrapped)
  }

  // Build data script element
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const dataScript = createElement('script', {
    id: '__WEIFUWU_DATA__',
    type: 'application/json',
    dangerouslySetInnerHTML: { __html: json },
  })

  // Wrap everything in ServerDataContext.Provider + data script
  return createElement(
    ServerDataContext.Provider,
    { value: data },
    createElement(Fragment, null, wrapped, dataScript),
  )
}

/**
 * Render element to a non-streaming Response via renderToString.
 */
export function render(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  options: RenderOptions = {},
): Response {
  const data = options.data ?? {}
  const wrapped = wrapElement(element, layouts, data)
  const html = renderToString(wrapped)

  return new Response('<!DOCTYPE html>\n' + html, {
    status: options.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...options.headers,
    },
  })
}

/**
 * Render element to a streaming Response via renderToReadableStream.
 * Prepends <!DOCTYPE html> to the stream.
 */
export async function renderStream(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  options: RenderOptions = {},
): Promise<Response> {
  const data = options.data ?? {}
  const wrapped = wrapElement(element, layouts, data)
  const stream = await renderToReadableStream(wrapped)

  // Prepend doctype to the stream
  const doctype = new TextEncoder().encode('<!DOCTYPE html>\n')
  const combined = new ReadableStream({
    async start(controller) {
      controller.enqueue(doctype)
      try {
        const reader = stream.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            break
          }
          controller.enqueue(value)
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return new Response(combined, {
    status: options.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'transfer-encoding': 'chunked',
      ...options.headers,
    },
  })
}
