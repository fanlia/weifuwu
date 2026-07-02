import {
  createElement,
  Fragment,
  type ReactElement,
  type ComponentType,
  type ReactNode,
} from 'react'
import { renderToString, renderToReadableStream } from 'react-dom/server'
import { ServerDataContext } from './context.ts'
import type { RenderOptions, HeadOptions } from './types.ts'

// ═══════════════════════════════════════════════════════════════
// Head tag builder
// ═══════════════════════════════════════════════════════════════

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function buildHeadTags(head?: HeadOptions): string {
  if (!head) return ''
  const tags: string[] = []
  if (head.title) tags.push(`<title>${escapeAttr(head.title)}</title>`)
  if (head.meta) {
    for (const [name, content] of Object.entries(head.meta)) {
      tags.push(`<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`)
    }
  }
  if (head.links) {
    for (const link of head.links) {
      const attrs = Object.entries(link).map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')
      tags.push(`<link ${attrs}>`)
    }
  }
  if (head.scripts) {
    for (const script of head.scripts) {
      const entries = Object.entries(script).filter(([, v]) => v !== undefined) as Array<[string, string]>
      const attrs = entries.map(([k, v]) => `${k}="${escapeAttr(v)}"`).join(' ')
      tags.push(`<script ${attrs}></script>`)
    }
  }
  return tags.join('')
}

function injectHeadIntoHtml(html: string, headTags: string): string {
  if (!headTags) return html
  // Replace existing <title> if present, then inject remaining tags before </head>
  let result = html
  if (headTags.includes('<title>')) {
    const titleMatch = headTags.match(/<title>[^<]*<\/title>/)
    if (titleMatch) {
      result = result.replace(/<title>[^<]*<\/title>/, titleMatch[0])
      headTags = headTags.replace(titleMatch[0], '')
    }
  }
  if (headTags) {
    result = result.replace('</head>', headTags + '</head>')
  }
  return result
}

/** Inject head tags into a streaming response by patching the stream. */
function injectHeadIntoStream(
  sourceStream: ReadableStream<Uint8Array>,
  headTags: string,
): ReadableStream<Uint8Array> {
  if (!headTags) return sourceStream

  // Separate title tag from the rest
  let titleTag = ''
  let rest = headTags
  const titleMatch = headTags.match(/<title>[^<]*<\/title>/)
  if (titleMatch) {
    titleTag = titleMatch[0]
    rest = headTags.replace(titleMatch[0], '')
  }

  let titleInjected = !titleTag
  let headInjected = !rest

  return new ReadableStream({
    async start(controller) {
      const reader = sourceStream.getReader()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          // Inject title (replace existing <title>...</title>)
          if (!titleInjected) {
            const idx = buffer.indexOf('<title>')
            const endIdx = buffer.indexOf('</title>', idx)
            if (idx !== -1 && endIdx !== -1) {
              controller.enqueue(
                encoder.encode(buffer.slice(0, idx) + titleTag + buffer.slice(endIdx + 8)),
              )
              buffer = ''
              titleInjected = true
              continue
            }
          }

          // Inject remaining head tags before </head>
          if (!headInjected) {
            const idx = buffer.indexOf('</head>')
            if (idx !== -1) {
              controller.enqueue(
                encoder.encode(buffer.slice(0, idx) + rest + buffer.slice(idx)),
              )
              buffer = ''
              headInjected = true
              continue
            }
          }

          // Everything injected, pass through
          if (titleInjected && headInjected && buffer) {
            controller.enqueue(encoder.encode(buffer))
            buffer = ''
          }
        }

        // Flush remaining
        if (buffer) controller.enqueue(encoder.encode(buffer))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

// ═══════════════════════════════════════════════════════════════
// Element wrapping
// ═══════════════════════════════════════════════════════════════

function wrapElement(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  data: Record<string, unknown>,
): ReactElement {
  let wrapped: ReactElement = element
  for (let i = layouts.length - 1; i >= 0; i--) {
    wrapped = createElement(layouts[i], null, wrapped)
  }

  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  const dataScript = createElement('script', {
    id: '__WEIFUWU_DATA__',
    type: 'application/json',
    dangerouslySetInnerHTML: { __html: json },
  })

  return createElement(
    ServerDataContext.Provider,
    { value: data },
    createElement(Fragment, null, wrapped, dataScript),
  )
}

// ═══════════════════════════════════════════════════════════════
// Public render functions
// ═══════════════════════════════════════════════════════════════

export function render(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  options: RenderOptions = {},
): Response {
  const data = options.data ?? {}
  const wrapped = wrapElement(element, layouts, data)
  let html = renderToString(wrapped)

  // Inject head tags
  const headTags = buildHeadTags(options.head)
  html = injectHeadIntoHtml(html, headTags)

  return new Response('<!DOCTYPE html>\n' + html, {
    status: options.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...options.headers,
    },
  })
}

export async function renderStream(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  options: RenderOptions = {},
): Promise<Response> {
  const data = options.data ?? {}
  const wrapped = wrapElement(element, layouts, data)
  const headTags = buildHeadTags(options.head)

  let stream: ReadableStream<Uint8Array> = await renderToReadableStream(wrapped) as unknown as ReadableStream<Uint8Array>

  // Inject head tags into the stream
  stream = injectHeadIntoStream(stream, headTags)

  // Prepend doctype
  const doctype = encoder.encode('<!DOCTYPE html>\n')
  const combined = new ReadableStream({
    async start(controller) {
      controller.enqueue(doctype)
      try {
        const reader = stream.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) { controller.close(); break }
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
