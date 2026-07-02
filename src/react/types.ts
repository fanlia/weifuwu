import type { ReactElement, ComponentType, ReactNode } from 'react'
import type { Context, Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    /**
     * Server-render a React component to streaming HTML.
     * Accepts either a ReactElement or a path to a .tsx/.ts component file.
     */
    render(element: ReactElement | string, opts?: RenderOptions): Promise<Response>
  }
}

export interface RenderOptions {
  /** Data serialized to client — available via useServerData(). */
  data?: Record<string, unknown>
  /** Props passed to the component (only used when render() receives a string path). */
  props?: Record<string, unknown>
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
}

export type ReactMiddleware = Middleware<Context, Context & ReactInjected>
