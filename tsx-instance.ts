import { createElement } from 'react'
import { renderToReadableStream } from 'react-dom/server'
import * as esbuild from 'esbuild'
import { readdirSync, statSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { AsyncLocalStorage } from 'node:async_hooks'
import chokidar from 'chokidar'
import type { WebSocket } from './vendor.ts'
import { Router } from './router.ts'
import type { Context, Handler } from './types.ts'
import type { CtxValue } from './tsx-context.ts'
import { TsxContext, useCtx, setCtx, getCtx, __registerAls } from './tsx-context.ts'

export { TsxContext, useCtx, setCtx, getCtx }

// ── Per-request context isolation via AsyncLocalStorage ────────────
const als = new AsyncLocalStorage<CtxValue>()
__registerAls(() => als.getStore())

export interface TsxOptions {
  dir: string
}

type PageEntry = {
  route: string
  entryPath: string
  loadPath?: string
  layouts: string[]
  routePath?: string
  routeOnly?: boolean
}

type NodeEntry = {
  route: string
  entryPath: string
  layouts: string[]
  loadPath?: string
  routePath?: string
}

// ── live reload (shared across all instances) ──────────────────────────────
const liveReloadClients = new Set<WebSocket>()

function broadcastReload() {
  for (const ws of liveReloadClients) {
    try { ws.send('reload') } catch { liveReloadClients.delete(ws) }
  }
}

const isDev = process.env.NODE_ENV !== 'production'

// ── Tailwind CSS singletons (lazy imports, shared) ─────────────────────────
let _tailwindPlugin: any = null
let _postcss: any = null

// ── helpers (shared) ───────────────────────────────────────────────────────

const _cjsRequire = createRequire(import.meta.url)

function loadSSRModule(code: string): any {
  const ctx = vm.createContext(Object.create(globalThis))
  const mod = { exports: {} }
  ctx.require = (name: string) => _cjsRequire(name)
  ctx.module = mod
  ctx.exports = mod.exports
  new vm.Script(code).runInContext(ctx)
  return mod.exports
}

function id(s: string): string {
  return createHash('md5').update(s).digest('hex').slice(0, 8)
}

let _alias: Record<string, string> | null = null

function resolveAliases(): Record<string, string> {
  if (_alias) return _alias
  const configFiles = ['tsconfig.json', 'jsconfig.json']
  for (const file of configFiles) {
    const p = resolve(file)
    if (existsSync(p)) {
      try {
        const config = JSON.parse(readFileSync(p, 'utf-8'))
        const paths = config.compilerOptions?.paths
        if (paths) {
          const alias: Record<string, string> = {}
          for (const [key, values] of Object.entries(paths as Record<string, string[]>)) {
            const cleanKey = key.replace('/*', '')
            const val = values[0]?.replace('/*', '')
            if (val) alias[cleanKey] = resolve(dirname(p), val)
          }
          _alias = alias
          return alias
        }
      } catch {}
    }
  }
  _alias = {}
  return {}
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

async function readStream(stream: ReadableStream): Promise<string> {
  const chunks: Uint8Array[] = []
  const reader = stream.getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  return new TextDecoder().decode(concatUint8(chunks))
}

// ── file scanning (pure functions) ─────────────────────────────────────────

function scanPages(dir: string): PageEntry[] {
  const pages: PageEntry[] = []

  function walk(current: string) {
    let entries: string[]
    try {
      entries = readdirSync(current)
    } catch {
      return
    }

    const dirs: string[] = []
    for (const name of entries) {
      const full = join(current, name)
      const st = statSync(full)
      if (st.isDirectory()) {
        if (!name.startsWith('.')) dirs.push(full)
      }
    }

    const pagePath = join(current, 'page.tsx')
    const tsPagePath = join(current, 'page.ts')
    let entryPath = ''
    if (existsSync(pagePath)) {
      entryPath = pagePath
    } else if (existsSync(tsPagePath)) {
      entryPath = tsPagePath
    }

    if (entryPath) {
      let relPath = relative(dir, entryPath).replace(sep, '/')
      relPath = relPath.replace(/\/page\.tsx?$/, '')
      relPath = relPath.replace(/^page\.tsx?$/, '')

      const route = filePathToRoute(relPath)
      const layouts = resolveLayouts(current, dir)
      const loadPath = existsSync(join(current, 'load.ts'))
        ? join(current, 'load.ts') : undefined
      const rPath = existsSync(join(current, 'route.ts'))
        ? join(current, 'route.ts') : undefined

      pages.push({
        route, entryPath, loadPath, layouts, routePath: rPath,
      })

    } else {
      const rPath = join(current, 'route.ts')
      if (existsSync(rPath)) {
        let relPath = relative(dir, rPath).replace(sep, '/')
        relPath = relPath.replace(/\/route\.tsx?$/, '')
        const route = filePathToRoute(relPath)
        pages.push({
          route, entryPath: '', layouts: [], routePath: rPath, routeOnly: true,
        })
      }
    }

    for (const d of dirs) walk(d)
  }

  walk(dir)
  return pages
}

function filePathToRoute(relPath: string): string {
  let route = relPath.replace(/\\/g, '/')
  route = route.replace(/\[\.\.\.(\w+)\]/g, '*')
  route = route.replace(/\[(\w+)\]/g, ':$1')
  return route.startsWith('/') ? route : '/' + route
}

function resolveLayouts(dir: string, pagesDir: string): string[] {
  const layouts: string[] = []
  let current = dir

  while (current.startsWith(pagesDir)) {
    const p = join(current, 'layout.tsx')
    if (existsSync(p)) {
      layouts.push(p)
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return layouts.reverse()
}

// ── compilation (pure functions) ───────────────────────────────────────────

async function compileAll(
  files: string[],
  outDir: string,
  platform: 'node' | 'browser',
  alias?: Record<string, string>,
): Promise<void> {
  const entryPoints: Record<string, string> = {}
  for (const f of files) {
    entryPoints[id(f)] = f
  }

  const isBrowser = platform === 'browser'
  await esbuild.build({
    entryPoints,
    outdir: outDir,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    jsxImportSource: 'react',
    bundle: true,
    external: isBrowser ? undefined : [
      'react', 'react-dom', 'esbuild',
      'graphql', 'ws', 'zod',
      '@graphql-tools/schema', 'ai',
    ],
    write: true,
    alias,
    allowOverwrite: true,
  })
}

function compiledUrl(filePath: string, outDir: string): string {
  const hash = id(join(outDir, id(filePath)))
  const p = join(outDir, id(filePath) + '.js')
  return pathToFileURL(p).href
}

// ═══════════════════════════════════════════════════════════════════════════
// TsxInstance — each tsx() call creates an isolated instance
// ═══════════════════════════════════════════════════════════════════════════

export class TsxInstance {
  private uiDir: string
  private pagesDir: string
  private outDir: string
  private router: Router
  private pageModules = new Map<string, any>()
  private layoutModules = new Map<string, any>()
  private loadModules = new Map<string, any>()
  private routeModules = new Map<string, Map<string, Handler>>()
  private allFiles: string[] = []
  private nodeEntries: Record<string, NodeEntry> = {}
  private compiledTailwindCss = ''

  // client bundle cache (per-instance)
  private clientBundleCache = new Map<string, Uint8Array>()
  private clientBuildParams = new Map<string, { entryPath: string; layoutPaths: string[]; pagesDir: string }>()
  private clientRouteLog = new Set<string>()

  // file watchers (dev mode, stored for cleanup)
  private watcher: any = null
  private twWatcher: any = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null



  constructor(options: TsxOptions) {
    this.uiDir = resolve(options.dir)
    this.pagesDir = existsSync(join(this.uiDir, 'pages')) ? join(this.uiDir, 'pages') : this.uiDir
    this.outDir = join(this.uiDir, '.weifuwu', 'ssr')
    this.router = new Router()
  }

  async build(): Promise<Router & { stop: () => void }> {
    // 1. Scan
    const pages = scanPages(this.pagesDir)
    if (pages.length === 0) return attachStop(this.router, this)

    // 2. Collect all files to compile
    const allFiles = new Set<string>()

    for (const p of pages) {
      if (p.entryPath) allFiles.add(p.entryPath)
      if (p.loadPath) allFiles.add(p.loadPath)
      for (const lp of p.layouts) allFiles.add(lp)
      if (p.routePath) allFiles.add(p.routePath)
    }

    const nfPath = join(this.pagesDir, 'not-found.tsx')
    const hasNotFound = existsSync(nfPath)
    if (hasNotFound) {
      allFiles.add(nfPath)
      const rootLayouts = resolveLayouts(this.pagesDir, this.pagesDir)
      for (const lp of rootLayouts) allFiles.add(lp)
    }

    // 3. Compile for SSR
    mkdirSync(this.outDir, { recursive: true })
    this.allFiles = [...allFiles]
    await compileAll(this.allFiles, this.outDir, 'node', resolveAliases())

    // 4. Load modules into registry and register routes
    const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const

    for (const p of pages) {
      const nodeKey = p.entryPath || p.routePath || ''
      this.nodeEntries[nodeKey] = { route: p.route, entryPath: p.entryPath || '', layouts: p.layouts, loadPath: p.loadPath, routePath: p.routePath }

      if (p.routeOnly && p.routePath) {
        const rUrl = compiledUrl(p.routePath, this.outDir)
        const modR = await import(rUrl)
        const handlers = new Map<string, Handler>()
        for (const m of ['GET', ...methods] as const) {
          if (modR[m]) handlers.set(m, modR[m])
        }
        this.routeModules.set(p.routePath, handlers)

        this.router.route('GET', p.route, (req, ctx) =>
          this.routeModules.get(p.routePath!)?.get('GET')?.(req, ctx) ?? new Response('', { status: 501 }),
        )
        for (const m of methods) {
          this.router.route(m, p.route, (req, ctx) =>
            this.routeModules.get(p.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
          )
        }
        continue
      }

      const pageUrl = compiledUrl(p.entryPath, this.outDir)
      this.pageModules.set(p.entryPath, await import(pageUrl))

      if (p.loadPath) {
        const loadUrl = compiledUrl(p.loadPath, this.outDir)
        this.loadModules.set(p.loadPath, await import(loadUrl))
      }

      for (const lp of p.layouts) {
        const lUrl = compiledUrl(lp, this.outDir)
        this.layoutModules.set(lp, await import(lUrl))
      }

      if (p.routePath) {
        const rUrl = compiledUrl(p.routePath, this.outDir)
        const modR = await import(rUrl)
        const handlers = new Map<string, Handler>()
        for (const m of methods) {
          if (modR[m]) handlers.set(m, modR[m])
        }
        this.routeModules.set(p.routePath, handlers)
      }

      const handler = this.makeSsrHandler(p.entryPath, p.layouts, p.loadPath)
      this.router.get(p.route, handler)

      if (p.routePath) {
        for (const m of methods) {
          this.router.route(m, p.route, (req, ctx) =>
            this.routeModules.get(p.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
          )
        }
      }
    }

    // not-found.tsx — catch-all with 404 status
    if (hasNotFound) {
      const nfUrl = compiledUrl(nfPath, this.outDir)
      this.pageModules.set(nfPath, await import(nfUrl))

      const rootLayouts = resolveLayouts(this.pagesDir, this.pagesDir)
      for (const lp of rootLayouts) {
        if (!this.layoutModules.has(lp)) {
          const lUrl = compiledUrl(lp, this.outDir)
          this.layoutModules.set(lp, await import(lUrl))
        }
      }

      const handler: Handler = async (req, ctx) => {
        const base = (ctx.mountPath || '').replace(/\/$/, '')
        const nfMod = this.pageModules.get(nfPath)
        if (!nfMod) return new Response('Not Found', { status: 404 })
        const NfComponent = nfMod.default

        const ctxValue: CtxValue = {
          params: ctx.params,
          query: ctx.query,
          user: (ctx.user ?? {}) as { id?: string },
          parsed: ctx.parsed ?? {},
          prefs: ctx.prefs ?? {},
          t: ctx.t ?? ((key: string) => key),
          env: ctx.env ?? {},
        }

        return als.run(ctxValue, async () => {
          setCtx(ctxValue)

          let element: any = createElement(TsxContext.Provider, { value: ctxValue },
            createElement(NfComponent, { params: ctx.params, query: ctx.query }),
          )

          for (let i = rootLayouts.length - 1; i >= 0; i--) {
            const LMod = this.layoutModules.get(rootLayouts[i])
            if (!LMod) continue
            element = createElement(LMod.default, { children: element })
          }

          const stream = await renderToReadableStream(element)
          return streamResponse(stream, {
            ctx, base,
            compiledTailwindCss: this.compiledTailwindCss,
            isDev,
            status: 404,
          })
        })
      }

      this.router.all('/*', handler)
    }

    // Register client bundle routes eagerly so they work with flattened router
    for (const p of pages) {
      if (p.entryPath) {
        const rootLayouts = resolveLayouts(this.pagesDir, this.pagesDir)
        this.registerClientBundleRoute(p.entryPath, p.layouts.length > 0 ? p.layouts : rootLayouts, this.pagesDir)
      }
    }

    await this.setupTailwind()

    if (isDev) {
      this.router.ws('/__weifuwu/livereload', {
        open: (ws) => {
          liveReloadClients.add(ws)
          ws.on('close', () => liveReloadClients.delete(ws))
          ws.on('error', () => liveReloadClients.delete(ws))
        },
      })
      this.startFileWatcher()
    }

    return attachStop(this.router, this)
  }

  /**
   * Clean up file watchers and pending timers. Call when shutting down
   * to prevent resource leaks.
   */
  stop() {
    this.watcher?.close()
    this.twWatcher?.close()
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = null
  }

  // ── Tailwind CSS ──────────────────────────────────────────────────────────

  private async compileTailwind(): Promise<string> {
    if (this.compiledTailwindCss) return this.compiledTailwindCss

    try {
      _tailwindPlugin ??= (await import('@tailwindcss/postcss')).default
      _postcss ??= (await import('postcss')).default
    } catch {
      return ''
    }

    const inputFile = resolve(this.uiDir, 'app.css')
    if (!existsSync(inputFile)) {
      mkdirSync(this.uiDir, { recursive: true })
      writeFileSync(inputFile, '@import "tailwindcss"\n', 'utf-8')
      console.log('ℹ weifuwu/tsx: created ' + relative(process.cwd(), inputFile))
    }

    try {
      let src = readFileSync(inputFile, 'utf-8')
      // Tell Tailwind to scan the instance's pages directory for class candidates
      const sourceRel = relative(this.uiDir, this.pagesDir) || '.'
      const sourcePath = sourceRel === '.' ? './' : `./${sourceRel}/`
      src = `@source "${sourcePath}";\n${src}`
      const result = await _postcss([_tailwindPlugin()]).process(src, { from: inputFile })
      this.compiledTailwindCss = result.css
    } catch (err) {
      console.warn('Tailwind CSS processing failed:', (err as Error).message)
    }

    return this.compiledTailwindCss
  }

  private async setupTailwind() {
    await this.compileTailwind()

    this.router.get('/__wfw/style.css', () => new Response(this.compiledTailwindCss || '', {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    }))

    if (isDev) {
      const inputFile = resolve(this.uiDir, 'app.css')
      this.twWatcher = chokidar.watch(inputFile, { persistent: false })
      this.twWatcher.on('change', async () => {
        this.compiledTailwindCss = ''
        await this.compileTailwind()
        broadcastReload()
      })
    }
  }

  // ── client bundle ─────────────────────────────────────────────────────────

  private async buildClientBundle(
    entryPath: string,
    layoutPaths: string[],
    pagesDir: string,
  ): Promise<Uint8Array | null> {
    try {
      const code = [
        `import{hydrateRoot}from'react-dom/client';`,
        `import{createElement,useState,useEffect}from'react';`,
        `import{TsxContext}from'weifuwu/react';`,
        `import P from${JSON.stringify(entryPath)};`,
        `const c=document.getElementById('__weifuwu_root');`,
        `if(!window.__WFW_ROOT){`,
        `function App(){`,
        `const[p,setP]=useState({C:P,props:window.__WEIFUWU_PROPS});`,
        `useEffect(()=>{window.__WFW_SET_PAGE=(C,props)=>setP({C,props})},[]);`,
        `const ctx=window.__WEIFUWU_CTX||{params:{},query:{}};`,
        `return createElement(TsxContext.Provider,{value:ctx},`,
        `createElement(p.C,p.props))`,
        `}`,
        `window.__WFW_ROOT=hydrateRoot(c,createElement(App));`,
        `}else{`,
        `window.__WFW_SET_PAGE?.(P,window.__WEIFUWU_PROPS);`,
        `}`,
      ].join('')

      const publicEnv: Record<string, string> = {}
      for (const key of Object.keys(process.env)) {
        if (key.startsWith('WEIFUWU_PUBLIC_')) {
          publicEnv[`process.env.${key}`] = JSON.stringify(process.env[key])
        }
      }

      const result = await esbuild.build({
        stdin: { contents: code, loader: 'tsx', resolveDir: pagesDir },
        bundle: true,
        format: 'esm',
        jsx: 'automatic',
        jsxImportSource: 'react',
        alias: resolveAliases(),
        banner: { js: 'self.process={env:{}};' },
        define: Object.keys(publicEnv).length > 0 ? publicEnv : undefined,
        loader: { '.node': 'empty' },
        write: false,
        minify: true,
      })

      return result.outputFiles[0].contents
    } catch (err) {
      console.error('hydration bundle failed:', err)
      return null
    }
  }

  private async getOrBuildClientBundle(
    entryPath: string,
    layoutPaths: string[],
    pagesDir: string,
  ): Promise<{ url: string } | null> {
    const key = id(entryPath)
    const url = `/__wfw/client/${key}.js`

    this.clientBuildParams.set(key, { entryPath, layoutPaths, pagesDir })

    if (!this.clientBundleCache.has(key)) {
      const buf = await this.buildClientBundle(entryPath, layoutPaths, pagesDir)
      if (!buf) return null
      this.clientBundleCache.set(key, buf)
    }

    return { url }
  }

  private registerClientBundleRoute(entryPath: string, layoutPaths: string[], pagesDir: string) {
    const key = id(entryPath)
    const url = `/__wfw/client/${key}.js`

    this.clientBuildParams.set(key, { entryPath, layoutPaths, pagesDir })

    if (!this.clientRouteLog.has(url)) {
      this.router.get(url, async () => {
        let buf = this.clientBundleCache.get(key)
        if (!buf) {
          const params = this.clientBuildParams.get(key)
          if (params) {
            const rebuilt = await this.buildClientBundle(params.entryPath, params.layoutPaths, params.pagesDir)
            if (rebuilt) {
              this.clientBundleCache.set(key, rebuilt)
              buf = rebuilt
            }
          }
        }
        return buf
          ? new Response(buf as BodyInit, {
              headers: { 'content-type': 'application/javascript; charset=utf-8' },
            })
          : new Response('', { status: 500 })
      })
      this.clientRouteLog.add(url)
    }
  }

  // ── SSR handler ───────────────────────────────────────────────────────────

  private makeSsrHandler(
    entryPath: string,
    layoutPaths: string[],
    loadPath: string | undefined,
  ): Handler {
    return async (req, ctx) => {
      const base = (ctx.mountPath || '').replace(/\/$/, '')
      const pageMod = this.pageModules.get(entryPath)
      if (!pageMod) return new Response('', { status: 500 })
      const Component = pageMod.default

      const ctxValue: CtxValue = {
        params: ctx.params,
        query: ctx.query,
        user: (ctx.user ?? {}) as { id?: string },
        parsed: ctx.parsed ?? {},
        prefs: ctx.prefs ?? {},
        t: ctx.t ?? ((key: string) => key),
        env: ctx.env ?? {},
      }

      // Isolate per-request context so load() and render see the correct ctx
      return als.run(ctxValue, async () => {
        setCtx(ctxValue)

        const loadMod = loadPath ? this.loadModules.get(loadPath) : undefined
        const loadFn = loadMod?.default
        const loadProps = loadFn ? await loadFn({ params: ctx.params, query: ctx.query }) : {}
        const allProps = { ...loadProps, params: ctx.params, query: ctx.query }

        let element: any = createElement(TsxContext.Provider, { value: ctxValue },
          createElement('div', { id: '__weifuwu_root' },
            createElement(Component, allProps),
          ),
        )

        if (layoutPaths.length === 0) {
          element = createElement('html', { lang: 'en' },
            createElement('head', null,
              createElement('meta', { charSet: 'utf-8' }),
              createElement('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
              createElement('title', null, 'weifuwu'),
            ),
            createElement('body', null, element),
          )
        } else {
          for (let i = layoutPaths.length - 1; i >= 0; i--) {
            const lp = layoutPaths[i]
            const LMod = this.layoutModules.get(lp)
            if (!LMod) continue
            const Layout = LMod.default
            const isRoot = i === 0
            element = createElement(
              Layout,
              isRoot ? { children: element, req } : { children: element },
            )
          }
        }

        const bundle = await this.getOrBuildClientBundle(entryPath, layoutPaths, this.pagesDir)
        const stream = await renderToReadableStream(element)
        return streamResponse(stream, {
          ctx, base,
          compiledTailwindCss: this.compiledTailwindCss,
          isDev, bundle, allProps,
        })
      })
    }
  }

  // ── dev file watcher ──────────────────────────────────────────────────────

  private startFileWatcher() {
    const pending = new Set<string>()

    this.watcher = chokidar.watch(this.uiDir, {
      ignored: /(^|[/\\])\.(?!\.)|node_modules|[/\\]\.weifuwu[/\\]|[/\\]dist[/\\]/,
      persistent: false,
      ignoreInitial: true,
    })
    this.watcher.on('all', async (event: string, filePath: string) => {
      if (event !== 'change' && event !== 'add') return
      if (!/\.tsx?$/.test(filePath)) return

      pending.add(filePath)

      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(async () => {
        this.debounceTimer = null
        const files = [...pending]
        pending.clear()
        const exists = files.filter(f => existsSync(f))

        const allKnown = exists.every(f =>
          this.pageModules.has(f) || this.layoutModules.has(f) || this.loadModules.has(f) || this.routeModules.has(f)
        )

        if (allKnown) {
          for (const f of exists) await this.recompileAndSwap(f)
          this.compiledTailwindCss = ''; await this.compileTailwind()
          broadcastReload()
        } else {
          await this.recompileAll()
        }
      }, 50)
    })
  }

  private async recompileAndSwap(filePath: string) {
    try {
      const result = await esbuild.build({
        entryPoints: { [id(filePath)]: filePath },
        outdir: this.outDir,
        format: 'cjs',
        platform: 'node',
        jsx: 'automatic',
        jsxImportSource: 'react',
        bundle: true,
        external: ['react', 'react-dom', 'esbuild', 'graphql', 'ws', 'zod', '@graphql-tools/schema', 'ai'],
        alias: resolveAliases(),
        write: false,
      })

      const code = new TextDecoder().decode(result.outputFiles[0].contents)
      const mod = loadSSRModule(code)

      const name = basename(filePath)
      if (name === 'layout.tsx') {
        this.layoutModules.set(filePath, mod)
        this.clientBundleCache.clear()
      } else if (name === 'route.ts') {
        const handlers = new Map<string, Handler>()
        for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const) {
          if ((mod as any)[m]) handlers.set(m, (mod as any)[m])
        }
        this.routeModules.set(filePath, handlers)
      } else if (name === 'load.ts') {
        this.loadModules.set(filePath, mod)
      } else {
        this.pageModules.set(filePath, mod)
        this.clientBundleCache.delete(id(filePath))
      }
    } catch (err) {
      console.error('recompile failed:', (err as Error).message)
    }
  }

  private async recompileAll() {
    try {
      const freshPages = scanPages(this.pagesDir)
      const freshFiles = new Set<string>()
      const nodeEntries: Record<string, NodeEntry> = {}
      for (const p of freshPages) {
        const nodeKey = p.entryPath || p.routePath || ''
        nodeEntries[nodeKey] = { route: p.route, entryPath: p.entryPath, layouts: p.layouts, loadPath: p.loadPath, routePath: p.routePath }
        if (p.entryPath) freshFiles.add(p.entryPath)
        if (p.loadPath) freshFiles.add(p.loadPath)
        for (const lp of p.layouts) freshFiles.add(lp)
        if (p.routePath) freshFiles.add(p.routePath)
      }
      const nfPath = join(this.pagesDir, 'not-found.tsx')
      if (existsSync(nfPath)) {
        freshFiles.add(nfPath)
        const rootLayouts = resolveLayouts(this.pagesDir, this.pagesDir)
        for (const lp of rootLayouts) freshFiles.add(lp)
      }

      this.allFiles = [...freshFiles]

      const result = await esbuild.build({
        entryPoints: Object.fromEntries(this.allFiles.map(f => [id(f), f])),
        outdir: this.outDir,
        format: 'cjs',
        platform: 'node',
        jsx: 'automatic',
        jsxImportSource: 'react',
        bundle: true,
        external: ['react', 'react-dom', 'esbuild', 'graphql', 'ws', 'zod', '@graphql-tools/schema', 'ai'],
        alias: resolveAliases(),
        write: false,
      })

      for (const file of result.outputFiles) {
        const code = new TextDecoder().decode(file.contents)
        const mod = loadSSRModule(code)

        const srcPath = this.allFiles.find(f => file.path.endsWith(id(f) + '.js'))
        if (!srcPath) continue

        const name = basename(srcPath)
        if (name === 'layout.tsx') {
          this.layoutModules.set(srcPath, mod)
        } else if (name === 'route.ts') {
          const handlers = new Map<string, Handler>()
          for (const m of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const) {
            if ((mod as any)[m]) handlers.set(m, (mod as any)[m])
          }
          this.routeModules.set(srcPath, handlers)
        } else if (name === 'load.ts') {
          this.loadModules.set(srcPath, mod)
        } else if (name !== 'not-found.tsx') {
          this.pageModules.set(srcPath, mod)
        }
      }

      const methods = ['POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'] as const
      for (const [key, entry] of Object.entries(nodeEntries)) {
        if (this.nodeEntries[key]) continue

        if (entry.routePath && !entry.entryPath) {
          this.router.route('GET', entry.route, (req, ctx) =>
            this.routeModules.get(entry.routePath!)?.get('GET')?.(req, ctx) ?? new Response('', { status: 501 }),
          )
          for (const m of methods) {
            this.router.route(m, entry.route, (req, ctx) =>
              this.routeModules.get(entry.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
            )
          }
        }

        if (entry.entryPath) {
          const handler = this.makeSsrHandler(entry.entryPath, entry.layouts, entry.loadPath)
          this.router.get(entry.route, handler)

          if (entry.routePath) {
            for (const m of methods) {
              this.router.route(m, entry.route, (req, ctx) =>
                this.routeModules.get(entry.routePath!)?.get(m)?.(req, ctx) ?? new Response('', { status: 501 }),
              )
            }
          }
        }

        console.log('ℹ weifuwu/tsx: registered new route ' + entry.route)
      }
      this.nodeEntries = nodeEntries

      this.clientBundleCache.clear()
      this.compiledTailwindCss = ''; await this.compileTailwind()
      broadcastReload()
    } catch (err) {
      console.error('recompile all failed:', (err as Error).message)
    }
  }
}

function attachStop(router: Router, instance: TsxInstance): Router & { stop: () => void } {
  ;(router as any).stop = () => instance.stop()
  return router as Router & { stop: () => void }
}

interface StreamOpts {
  ctx: Context
  base: string
  compiledTailwindCss?: string
  isDev: boolean
  status?: number
  bundle?: { url: string } | null
  allProps?: Record<string, unknown>
}

function streamResponse(reactStream: ReadableStream, opts: StreamOpts): Response {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()

  // Pre-compute head injection payload (static before streaming)
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

          // Extract <template id="__wfw_head"> content and remove from body
          if (!extractedHead) {
            const m = buffer.match(/<template id="__wfw_head">([\s\S]*?)<\/template>/)
            if (m) {
              extractedHead = m[1]
              buffer = buffer.replace(m[0], '')
            }
          }

          // Flush when we hit </head>, injecting all head content
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

        // Flush remaining buffer (clean up any unflushed template tags)
        buffer = buffer.replace(/<template id="__wfw_head">[\s\S]*?<\/template>/g, '')
        if (buffer) controller.enqueue(encoder.encode(buffer))

        // Body scripts
        const body = buildBodyScripts(opts)
        if (body) controller.enqueue(encoder.encode('\n' + body))

        // Dev livereload
        if (opts.isDev) {
          controller.enqueue(encoder.encode(
            `\n<script>(function(){var ws=new WebSocket((location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'${opts.base}/__weifuwu/livereload');ws.onmessage=function(e){if(e.data==='reload')location.reload()};ws.onclose=function(){setTimeout(function(){location.reload()},500)}})()<\/script>`
          ))
        }
      } catch (err) {
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
  const { ctx, base, compiledTailwindCss } = opts
  let result = ''

  if (ctx.prefs?.theme) {
    result += `<script>!function(){var t=(document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/)||[])[1]||'system';if(t==='system'){t=window.matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}()<\/script>\n`
  }

  if (compiledTailwindCss) {
    result += `<link rel="stylesheet" href="${base}/__wfw/style.css" />\n`
  }

  const localeData = (ctx.parsed as any)?.__localeData
  if (localeData && Object.keys(localeData).length > 0) {
    result += `<script>window.__LOCALE_DATA__=${JSON.stringify(localeData)}<\/script>\n`
  }

  const ctxData: Record<string, unknown> = {
    params: ctx.params,
    query: ctx.query,
    user: ctx.user,
    parsed: ctx.parsed,
    prefs: ctx.prefs,
  }

  // Collect WEIFUWU_PUBLIC_* env vars for client (cached)
  const publicEnv = getPublicEnv()
  if (Object.keys(publicEnv).length > 0) {
    ctxData.env = publicEnv
  }

  result += `<script>window.__WEIFUWU_CTX=${JSON.stringify(ctxData)}<\/script>\n`

  return result
}

function buildBodyScripts(opts: StreamOpts): string {
  if (!opts.bundle) return ''
  const parts: string[] = []
  if (opts.allProps) {
    parts.push(`<script>window.__WEIFUWU_PROPS=${JSON.stringify(opts.allProps)}<\/script>`)
  }
  parts.push(`<script type="module" src="${opts.base}${opts.bundle.url}"><\/script>`)
  return parts.join('\n')
}
