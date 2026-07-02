import {
  createElement,
  type ReactElement,
  type ComponentType,
  type ReactNode,
} from 'react'
import { renderToReadableStream } from 'react-dom/server'
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

/**
 * Inject content before a closing tag in a streaming response.
 * Splits on the first occurrence of `beforeTag` and inserts `content` before it.
 */
function injectBeforeTag(
  sourceStream: ReadableStream<Uint8Array>,
  beforeTag: string,
  content: string,
): ReadableStream<Uint8Array> {
  if (!content) return sourceStream

  let injected = false

  return new ReadableStream({
    async start(controller) {
      const reader = sourceStream.getReader()
      let buffer = ''
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })

          if (!injected) {
            const idx = buffer.indexOf(beforeTag)
            if (idx !== -1) {
              controller.enqueue(
                encoder.encode(buffer.slice(0, idx) + content + buffer.slice(idx)),
              )
              buffer = ''
              injected = true
              continue
            }
          }

          if (injected && buffer) {
            controller.enqueue(encoder.encode(buffer))
            buffer = ''
          }
        }

        if (buffer) controller.enqueue(encoder.encode(buffer))
        controller.close()
      } catch (err) {
        controller.error(err)
      }
    },
  })
}

/** Inject head tags into a streaming response by patching the stream. */
function injectHeadIntoStream(
  sourceStream: ReadableStream<Uint8Array>,
  headTags: string,
): ReadableStream<Uint8Array> {
  if (!headTags) return sourceStream

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

          if (titleInjected && headInjected && buffer) {
            controller.enqueue(encoder.encode(buffer))
            buffer = ''
          }
        }

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

function buildDataScript(data: Record<string, unknown>): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return `<script id="__WEIFUWU_DATA__" type="application/json">${json}</script>`
}

function wrapElement(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  data: Record<string, unknown>,
): ReactElement {
  let wrapped: ReactElement = element
  for (let i = layouts.length - 1; i >= 0; i--) {
    wrapped = createElement(layouts[i], null, wrapped)
  }

  return createElement(
    ServerDataContext.Provider,
    { value: data },
    wrapped,
  )
}

// ═══════════════════════════════════════════════════════════════
// Read a stream fully into a string
// ═══════════════════════════════════════════════════════════════

async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const chunks: string[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value, { stream: true }))
  }
  return chunks.join('')
}

// ═══════════════════════════════════════════════════════════════
// Public render functions
// ═══════════════════════════════════════════════════════════════

/**
 * Render a React element to an HTML Response.
 * Uses renderToReadableStream (React 18+ hydration-safe SSR).
 */
export async function render(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  options: RenderOptions = {},
): Promise<Response> {
  const data = options.data ?? {}
  const wrapped = wrapElement(element, layouts, data)

  // renderToReadableStream produces text identical to client-side render,
  // avoiding hydration mismatches.
  const reactStream: any = await renderToReadableStream(wrapped)
  // Wait for all chunks (suspense boundaries, etc.)
  await (reactStream as any).allReady

  let stream = reactStream as ReadableStream<Uint8Array>

  // Inject head tags
  const headTags = buildHeadTags(options.head)
  stream = injectHeadIntoStream(stream, headTags)

  let html = await streamToString(stream)

  // Inject data script before </body> (not inside React tree)
  if (Object.keys(data).length > 0) {
    const dataScript = buildDataScript(data)
    if (html.includes('</body>')) {
      html = html.replace('</body>', dataScript + '</body>')
    } else {
      html += dataScript
    }
  }

  // renderToReadableStream auto-prepends <!DOCTYPE html> when root is <html>
  const hasDoctype = html.startsWith('<!DOCTYPE')

  return new Response((hasDoctype ? '' : '<!DOCTYPE html>\n') + html, {
    status: options.status ?? 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      ...options.headers,
    },
  })
}

/**
 * Streaming render — returns a Response with chunked transfer encoding.
 * Uses renderToReadableStream for hydration-safe output.
 */
export async function renderStream(
  element: ReactElement,
  layouts: ComponentType<{ children: ReactNode }>[],
  options: RenderOptions = {},
): Promise<Response> {
  const data = options.data ?? {}
  const wrapped = wrapElement(element, layouts, data)
  const headTags = buildHeadTags(options.head)

  let stream: ReadableStream<Uint8Array> = await renderToReadableStream(wrapped) as unknown as ReadableStream<Uint8Array>

  // Inject head tags
  stream = injectHeadIntoStream(stream, headTags)

  // Inject data script before </body>
  if (Object.keys(data).length > 0) {
    stream = injectBeforeTag(stream, '</body>', buildDataScript(data))
  }

  // renderToReadableStream auto-prepends <!DOCTYPE html> when root is <html>.
  // Detect the first chunk and prepend doctype only when React didn't.
  let doctypeDetected = false
  const doctypeBytes = encoder.encode('<!DOCTYPE html>\n')

  const combined = new ReadableStream({
    async start(controller) {
      try {
        const reader = stream.getReader()
        let first = true
        while (true) {
          const { done, value } = await reader.read()
          if (done) { controller.close(); break }

          if (first) {
            first = false
            const text = decoder.decode(value.slice(0, Math.min(value.length, 20)))
            if (!text.startsWith('<!DOCTYPE')) {
              controller.enqueue(doctypeBytes)
            }
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
