import type { Middleware, Context } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /**
     * Compile and render a .tsx file to HTML.
     * The component should render a full page.
     */
    render(path: string, opts?: RenderOptions): Promise<Response>
  }
}

/** Options for the react() middleware. */
export interface ReactOptions {
  /**
   * Path to a shared layout component (relative to cwd or absolute).
   * The layout wraps every rendered page as its `children`.
   * Layout + page are wrapped in HtmlShell for <html>/<head>/<body> structure.
   *
   * The layout component receives `{ children: ReactNode }`.
   * Both layout and page can use `useServerData()`.
   *
   * @example
   * ```tsx
   * // layouts/Root.tsx
   * export default function Root({ children }: { children: ReactNode }) {
   *   const { user } = useServerData()
   *   return <><Nav user={user} /><main>{children}</main><Footer /></>
   * }
   * ```
   */
  layout?: string
  /**
   * Directory for compiled .tsx module cache.
   * Default: node_modules/.weifuwu/react
   * Persisted across restarts — source changes trigger recompilation.
   */
  cacheDir?: string
}

export interface BootstrapScriptDescriptor {
  src: string
  crossOrigin?: string
  integrity?: string
}

export interface RenderOptions {
  /** Props passed directly to the page component. */
  props?: Record<string, unknown>
  /** Data passed to useServerData() in the component tree. */
  data?: Record<string, unknown>
  /**
   * Async loader that runs before render.
   * Receives ctx (with params, query) and returns data merged into useServerData().
   * Throw HttpError for non-200 status codes.
   *
   * @example
   * ```ts
   * app.get('/users/:id', (_req, ctx) => ctx.render('./UserPage.tsx', {
   *   loader: async (ctx) => {
   *     const user = await db.findUser(ctx.params.id)
   *     if (!user) throw new HttpError('Not found', 404)
   *     return { user }
   *   },
   * }))
   * ```
   */
  loader?: (ctx: Context) => Promise<Record<string, unknown>>
  /** HTTP status code (default 200). */
  status?: number
  /** Extra response headers. */
  headers?: Record<string, string>
  /** Classic scripts injected by React. */
  bootstrapScripts?: Array<string | BootstrapScriptDescriptor>
  /** ES module scripts injected by React. */
  bootstrapModules?: Array<string | BootstrapScriptDescriptor>
  /**
   * Import map for ES module resolution.
   * Rendered as <script type="importmap"> in <head>.
   */
  importMap?: { imports?: Record<string, string> }
  /** Stylesheet URLs injected as <link rel="stylesheet"> in <head>. */
  stylesheets?: string[]
  /**
   * Enable streaming SSR (default: true).
   * When true, the response starts sending immediately and Suspense
   * boundaries are streamed as they resolve.
   * When false, waits for all Suspense boundaries before sending.
   */
  stream?: boolean
}

export type ReactMiddleware = Middleware
