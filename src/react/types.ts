import type { Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /**
     * Compile and render a .tsx file to HTML.
     * The component should render a full page.
     */
    render(path: string, opts?: RenderOptions): Promise<Response>
  }
}

export interface BootstrapScriptDescriptor {
  src: string
  crossOrigin?: string
  integrity?: string
}

export interface RenderOptions {
  /** Data passed to useServerData() in the component tree. */
  data?: Record<string, unknown>
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
}

export type ReactMiddleware = Middleware
