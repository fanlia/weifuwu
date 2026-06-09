import { TextDecoder, TextEncoder } from 'node:util'
import type { Context } from './types.ts'

export interface StreamOpts {
  ctx: Context
  base: string
  compiledTailwindCss?: string
  isDev: boolean
  status?: number
  bundle?: { url: string } | null
  loaderData?: Record<string, unknown>
}

function concatUint8(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((a, c) => a + c.length, 0)
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

export async function readStream(stream: ReadableStream): Promise<string> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return new TextDecoder().decode(concatUint8(chunks))
}

let _publicEnv: Record<string, string> | null = null

function getPublicEnv(): Record<string, string> {
  if (_publicEnv) return _publicEnv
  _publicEnv = {}
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('WEIFUWU_PUBLIC_')) {
      _publicEnv[key] = process.env[key]!
    }
  }
  return _publicEnv
}

function buildHeadPayload(opts: StreamOpts): string {
  const { ctx, base, compiledTailwindCss, isDev } = opts
  let result = ''

  if (isDev) {
    const vUrl = `${base}/__wfw/v/bundle`
    result += `<script type="importmap">{
  "imports": {
    "react": "${vUrl}",
    "react-dom": "${vUrl}",
    "react-dom/client": "${vUrl}",
    "react/jsx-runtime": "${vUrl}",
    "weifuwu/react": "${vUrl}"
  }
}<\/script>\n`
  }

  if (ctx.prefs?.theme) {
    result += `<script>!function(){var t=(document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/)||[])[1]||'system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}()<\/script>\n`
  }

  if (compiledTailwindCss) {
    const cssUrl = (ctx as any).tailwindCssUrl || '/__wfw/style.css'
    result += `<link rel="stylesheet" href="${cssUrl}" />\n`
  }

  const localeData = (ctx.parsed as any)?.__localeData ?? (globalThis as any).__LOCALE_DATA__
  if (localeData && Object.keys(localeData).length > 0) {
    result += `<script>window.__LOCALE_DATA__=${JSON.stringify(localeData)}<\/script>\n`
  }

  const loaderData = opts.loaderData || {}
  const ctxData: Record<string, unknown> = {
    params: ctx.params,
    query: ctx.query,
    user: ctx.user,
    parsed: ctx.parsed,
    prefs: ctx.prefs,
    loaderData,
  }

  const publicEnv = getPublicEnv()
  if (Object.keys(publicEnv).length > 0) {
    ctxData.env = publicEnv
  }

  result += `<script>window.__WEIFUWU_CTX=${JSON.stringify(ctxData)}<\/script>\n`

  return result
}

function buildBodyScripts(opts: StreamOpts): string {
  const parts: string[] = []
  if (opts.loaderData && Object.keys(opts.loaderData).length > 0) {
    parts.push(`<script>window.__WEIFUWU_PROPS=${JSON.stringify(opts.loaderData)}<\/script>`)
  }
  if (opts.bundle) {
    parts.push(`<script type="module" src="${opts.base}${opts.bundle.url}"><\/script>`)
  }
  return parts.join('\n')
}

export function streamResponse(reactStream: ReadableStream, opts: StreamOpts): Response {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const headPayload = buildHeadPayload(opts)

  let buffer = ''
  let headFlushed = false
  let extractedHead = ''

  const output = new ReadableStream({
    async start(controller) {
      try {
        const reader = reactStream.getReader()

        async function push(chunk: Uint8Array) {
          buffer += decoder.decode(chunk, { stream: true })

          if (!extractedHead) {
            const m = buffer.match(/<template id="__wfw_head">([\s\S]*?)<\/template>/)
            if (m) {
              extractedHead = m[1]
              buffer = buffer.replace(m[0], '')
            }
          }

          if (!headFlushed) {
            const idx = buffer.indexOf('</head>')
            if (idx !== -1) {
              const before = buffer.slice(0, idx)
              let injection = ''
              if (extractedHead) injection += '\n' + extractedHead
              injection += headPayload
              controller.enqueue(encoder.encode(before + injection))
              buffer = buffer.slice(idx)
              headFlushed = true
            }
            return
          }

          controller.enqueue(encoder.encode(buffer))
          buffer = ''
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await push(value)
        }

        buffer = buffer.replace(/<template id="__wfw_head">[\s\S]*?<\/template>/g, '')
        if (buffer) controller.enqueue(encoder.encode(buffer))

        const body = buildBodyScripts(opts)
        if (body) controller.enqueue(encoder.encode('\n' + body))

        if (opts.isDev) {
          const wsUrl = `${opts.base}/__weifuwu/livereload`
          const hbUrl = `${opts.base}/__wfw/h/`
          controller.enqueue(encoder.encode(
            `\n<script>(function(){var ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'${wsUrl}');var t=0;ws.onmessage=function(e){try{var m=JSON.parse(e.data);if(m.type==='component'){if(m.entry&&m.entry!==window.__WFW_ENTRY)return;import('${hbUrl}'+m.hash+'?'+Date.now()).catch(function(){location.reload()});if(m.css){var s=document.querySelector('style[data-lr]')||function(){var x=document.createElement('style');x.setAttribute('data-lr','');document.head.appendChild(x);return x}();s.textContent=m.css}return}if(m.type==='css'){var s=document.querySelector('style[data-lr]')||function(){var x=document.createElement('style');x.setAttribute('data-lr','');document.head.appendChild(x);return x}();s.textContent=m.css;return}}catch(_){}if(e.data==='reload'&&Date.now()-t>1e3){t=Date.now();location.reload()}};ws.onclose=function(){if(Date.now()-t>1e3){t=Date.now();setTimeout(function(){location.reload()},500)}}})()<\/script>`
          ))
        }
      } catch {
        const fallback = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>500</title></head><body><h1>500 - Internal Server Error</h1></body></html>`
        controller.enqueue(encoder.encode(fallback))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(output, {
    status: opts.status ?? 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
