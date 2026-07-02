import type { ReactElement, ComponentType, ReactNode } from 'react'
import type { Context, Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /**
     * Server-render a React component to HTML.
     * Accepts either a ReactElement or a path to a .tsx/.ts component file.
     */
    render(element: ReactElement | string, opts?: RenderOptions): Promise<Response>
    /**
     * Streaming server-render a React component to HTML.
     * Accepts either a ReactElement or a path to a .tsx/.ts component file.
     */
    renderStream(element: ReactElement | string, opts?: RenderOptions): Promise<Response>
  }
}

export interface HeadOptions {
  /** Page title — injected as <title>. */
  title?: string
  /** Meta tags: name → content. */
  meta?: Record<string, string>
  /** Link tags (stylesheet, canonical, etc). */
  links?: Array<{ rel: string; href: string; [key: string]: string }>
  /** Additional <script> tags in <head>. */
  scripts?: Array<{ src?: string; [key: string]: string | undefined }>
}

export interface RenderOptions {
  /** Data serialized to client — available via useServerData(). */
  data?: Record<string, unknown>
  /** Props passed to the component (only used when render() receives a string path). */
  props?: Record<string, unknown>
  /** Head tags to inject into <head>. Supported in render() and renderStream(). */
  head?: HeadOptions
  status?: number
  headers?: Record<string, string>
}

export interface ReactOptions {
  /**
   * Layout component wrapping rendered content.
   * Accepts a React component or a path to a .tsx/.ts file.
   * Multiple react() calls via mount accumulate layouts from inner → outer.
   */
  layout?: ComponentType<{ children: ReactNode }> | string
}

export interface ReactInjected {
  render: (element: ReactElement | string, opts?: RenderOptions) => Promise<Response>
  renderStream: (element: ReactElement | string, opts?: RenderOptions) => Promise<Response>
}

export type ReactMiddleware = Middleware<Context, Context & ReactInjected>
