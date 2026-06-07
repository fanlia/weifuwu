import { createElement } from 'react'
import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { AsyncLocalStorage } from 'node:async_hooks'
import { compileTsx } from './compile.ts'
import { streamResponse } from './stream.ts'
import type { PageContext } from './tsx-context.ts'
import { TsxContext, setCtx, __registerAls } from './tsx-context.ts'
import { Router } from './router.ts'

const als = new AsyncLocalStorage<PageContext>()
__registerAls(() => als.getStore())

const isDev = process.env.NODE_ENV !== 'production'

const bundleCache = new Map<string, Uint8Array>()

export function clearClientBundleCache() {
  bundleCache.clear()
}

function id(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

function serializeLoaderData(ctx: any): Record<string, unknown> {
  const data: Record<string, unknown> = {}
  for (const key of Object.keys(ctx)) {
    if (!['params', 'query', 'mountPath', 'layoutStack'].includes(key)) {
      data[key] = (ctx as any)[key]
    }
  }
  return data
}

async function buildClientBundle(
  entryPath: string,
  layoutPaths: string[],
): Promise<Uint8Array | null> {
  try {
    const absEntry = resolve(entryPath)
    const absLayouts = layoutPaths.map(p => resolve(p))
    const layoutImports = absLayouts.map(p => `import${JSON.stringify(p)};`).join('')
    const _sc = `(function(){var k='__WEIFUWU_CTX_STORE';var s=typeof globalThis!='undefined'&&globalThis[k];if(!s)return function(){};return function(v){s._ctx={...s._ctx,...v};s._snapshot={params:s._ctx.params,query:s._ctx.query,user:s._ctx.user,parsed:s._ctx.parsed,prefs:s._ctx.prefs,env:s._ctx.env};s._listeners.forEach(function(fn){fn()})}})()`
    const code = [
      layoutImports,
      `${isDev ? "import{createRoot}from'react-dom/client';" : "import{hydrateRoot}from'react-dom/client';"}`,
      `import{createElement}from'react';`,
      `import{TsxContext}from'weifuwu/react';`,
      `import P from${JSON.stringify(absEntry)};`,
      `var setCtx=${_sc};`,
      `const c=document.getElementById('__weifuwu_root');`,
      `if(window.__WEIFUWU_PROPS)setCtx({loaderData:window.__WEIFUWU_PROPS});`,
      // Dev: stable proxy chain — _P → _W (stable) → actual component
      isDev ? `const _W=function(props){return(_W._fn||P)(props)};_W._fn=P;const _P=function(props){return createElement(_W,props)};` : '',
      // Dev: HMR handler — updates proxy + re-renders root
      isDev ? `window.__WFW_REFRESH=function(n){_W._fn=n;window.__WFW_ROOT.render(createElement(App))};` : '',
      `function App(){`,
      `const ctx=window.__WEIFUWU_CTX||{};`,
      `return createElement(TsxContext.Provider,{value:ctx},`,
      isDev ? `createElement(_P,null))` : `createElement(P,null))`,
      `}`,
      isDev ? `window.__WFW_ROOT=createRoot(c);window.__WFW_ROOT.render(createElement(App));` : `hydrateRoot(c,createElement(App));`,
    ].filter(Boolean).join('')

    const { default: esbuild } = await import('esbuild')
    const result = await esbuild.build({
      stdin: { contents: code, loader: 'tsx', resolveDir: dirname(absEntry) },
      bundle: true,
      format: 'esm',
      jsx: 'automatic',
      jsxImportSource: 'react',
      banner: { js: 'self.process={env:{}};' },
      loader: { '.node': 'empty' },
      external: isDev ? ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', 'weifuwu/react'] : undefined,
      write: false,
      minify: !isDev,
    })

    return result.outputFiles[0].contents
  } catch (err) {
    console.error('hydration bundle failed:', err)
    return null
  }
}

export function ssr(path: string): Router {
  const entryId = id(resolve(path))
  const bundleKey = `/__ssr/${entryId}.js`

  const r = new Router()

  r.get('/__ssr/:path', (req, ctx) => {
    const buf = bundleCache.get('/__ssr/' + ctx.params.path)
    return buf
      ? new Response(buf as BodyInit, {
          headers: { 'content-type': 'application/javascript; charset=utf-8' },
        })
      : new Response('', { status: 404 })
  })

  r.get('/', async (req, ctx) => {
    const pageMod = await compileTsx(path)
    const Component = pageMod.default
    if (!Component) return new Response('', { status: 500 })

    const layouts = (ctx.layoutStack || [])
    const layoutComponents = layouts.map((l: any) => l.component)
    const layoutPaths = layouts.map((l: any) => l.path)

    const base = (ctx.mountPath || '').replace(/\/$/, '')
    const loaderData = serializeLoaderData(ctx)

    const ctxValue: PageContext = {
      params: ctx.params,
      query: ctx.query,
      user: (ctx.user ?? {}) as { id?: string },
      parsed: ctx.parsed ?? {},
      prefs: ctx.prefs ?? {},
      loaderData,
      env: ctx.env ?? {},
    }

    return als.run(ctxValue, async () => {
      setCtx(ctxValue)

      let element: any = createElement('div', { id: '__weifuwu_root' },
        createElement(TsxContext.Provider, { value: ctxValue },
          createElement(Component, null),
        ),
      )

      if (layoutComponents.length === 0) {
        element = createElement('html', { lang: 'en' },
          createElement('head', null,
            createElement('meta', { charSet: 'utf-8' }),
            createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
            createElement('title', null, 'weifuwu'),
          ),
          createElement('body', null, element),
        )
      } else {
        for (const L of layoutComponents.toReversed()) {
          element = createElement(L, { children: element })
        }
      }

      let bundle: { url: string } | null = null
      if (!bundleCache.has(bundleKey)) {
        const buf = await buildClientBundle(path, layoutPaths)
        if (buf) bundleCache.set(bundleKey, buf)
      }
      if (bundleCache.has(bundleKey)) {
        bundle = { url: bundleKey }
      }

      const { renderToReadableStream } = await import('react-dom/server')
      const stream = await renderToReadableStream(element)
      return streamResponse(stream, {
        ctx: ctx as any,
        base,
        isDev,
        bundle,
        loaderData,
        compiledTailwindCss: (ctx as any).compiledTailwindCss,
      })
    })
  })

  return r
}
