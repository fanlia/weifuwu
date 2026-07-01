import { TextDecoder, TextEncoder } from 'node:util'
import type { Context } from '@weifuwujs/core'
import { vendorHash } from './compile.ts'

/** Options for {@link streamResponse}. */
export interface StreamOpts {
  ctx: Context
  base: string
  tailwind?: { css: string; url: string }
  isDev: boolean
  status?: number
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
  const { ctx, base, tailwind } = opts
  let result = ''

  result += `<script>window.__wfw={_cache:{},_k:function(u){return u.split('?')[0]},h:async function(u){var k=this._k(u);if(this._cache[k])return this._cache[k];var m=await import(u);this._cache[k]=m;return m},_update:function(u,mod){var k=this._k(u);this._cache[k]=mod}}</script>\n`

  const vUrl = `${base}/__wfw/v/bundle?h=${vendorHash}`
  result += `<script type="importmap">{
  "imports": {
    "react": "${vUrl}",
    "react-dom": "${vUrl}",
    "react-dom/client": "${vUrl}",
    "react/jsx-runtime": "${vUrl}",
    "weifuwu/react": "${vUrl}"
  }
}</script>\n`

  if (ctx.theme?.value) {
    result += `<script>!function(){var t=(document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/)||[])[1]||'system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}()</script>\n`
  }

  if (tailwind?.css) {
    result += `<link rel="stylesheet" href="${tailwind.url}" />\n`
  }

  const loaderData = opts.loaderData || {}
  const ctxData: Record<string, unknown> = {
    params: ctx.params,
    query: ctx.query,
    parsed: ctx.parsed,
    theme: ctx.theme,
    i18n: ctx.i18n,
    flash: ctx.flash,
    loaderData,
  }

  const rawUser = ctx.user as unknown as Record<string, unknown> | undefined
  if (rawUser && typeof rawUser === 'object') {
    const safeUser: Record<string, unknown> = {}
    for (const k of ['id', 'name', 'email', 'role', 'avatar']) {
      if (k in rawUser) safeUser[k] = rawUser[k]
    }
    ctxData.user = safeUser
  }

  const publicEnv = getPublicEnv()
  if (Object.keys(publicEnv).length > 0) {
    ctxData.env = publicEnv
  }

  result += `<script>window.__WEIFUWU_CTX=${JSON.stringify(ctxData)}</script>\n`

  return result
}

function buildBodyScripts(opts: StreamOpts, hydrationScript?: string): string {
  const parts: string[] = []
  if (hydrationScript) parts.push(hydrationScript)
  return parts.join('\n')
}

/**
 * Create an HTML response from a React SSR stream.
 */
export function streamResponse(
  reactStream: ReadableStream,
  opts: StreamOpts,
  hydrationScript?: string,
): Response {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  const output = new ReadableStream({
    async start(controller) {
      try {
        const reader = reactStream.getReader()
        let html = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          html += decoder.decode(value, { stream: true })
        }
        html += decoder.decode()

        const headTmpl = html.match(/<template id="__wfw_head">([\s\S]*?)<\/template>/)
        if (headTmpl) {
          const extractedHead = headTmpl[1]
          html = html.replace(headTmpl[0], '')
          const headIdx = html.indexOf('</head>')
          if (headIdx !== -1) {
            html = html.slice(0, headIdx) + '\n' + extractedHead + html.slice(headIdx)
          }
        }

        const headPayload = buildHeadPayload(opts)
        const headIdx = html.indexOf('</head>')
        if (headIdx !== -1) {
          html = html.slice(0, headIdx) + headPayload + html.slice(headIdx)
        }

        let bodyScripts = ''
        const built = buildBodyScripts(opts, hydrationScript)
        if (built) bodyScripts += built

        if (opts.isDev) {
          const wsUrl = `${opts.base}/__weifuwu/livereload`
          bodyScripts += `\n<script>
(function(){
var ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'${wsUrl}');
var t=0;
var _w=window;
ws.onmessage=function(e){
  try{
    var m=JSON.parse(e.data);
    if(m.type==='update'&&m.url&&m.code){
      var blob=new Blob([m.code],{type:'application/javascript'});
      var blobUrl=URL.createObjectURL(blob);
      import(blobUrl).then(function(mod){
        if(_w.__wfw) _w.__wfw._update(m.url,mod);
        var pageUrl=_w.__WFW_PAGE_URL;
        if(pageUrl&&_w.__WFW_REFRESH){
          import(pageUrl.split('?')[0]+'?t='+Date.now()).then(function(pageMod){
            if(pageMod.default) _w.__WFW_REFRESH(pageMod.default);
            if(m.css){
              var s=document.querySelector('style[data-lr]')||function(){
                var x=document.createElement('style');
                x.setAttribute('data-lr','');
                document.head.appendChild(x);
                return x
              }();
              s.textContent=m.css
            }
          });
        }else{location.reload()}
      }).catch(function(){location.reload()});
      return
    }
    if(m.type==='css'){
      var s=document.querySelector('style[data-lr]')||function(){
        var x=document.createElement('style');
        x.setAttribute('data-lr','');
        document.head.appendChild(x);
        return x
      }();
      s.textContent=m.css
      return
    }
  }catch(_){}
  if(e.data==='reload'&&Date.now()-t>1e3){t=Date.now();location.reload()}
};
ws.onclose=function(){
  if(Date.now()-t>1e3){
    t=Date.now();
    setTimeout(function(){location.reload()},500)
  }
};
})();
</script>`
        }

        if (bodyScripts) {
          const bodyIdx = html.lastIndexOf('</body>')
          if (bodyIdx !== -1) {
            html = html.slice(0, bodyIdx) + bodyScripts + html.slice(bodyIdx)
          }
        }

        controller.enqueue(encoder.encode(html))
      } catch {
        const fallback =
          '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
          '<title>500</title></head><body><h1>500 - Internal Server Error</h1></body></html>'
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
