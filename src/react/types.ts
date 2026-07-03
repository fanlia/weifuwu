import type { ReactElement, ComponentType, ReactNode } from 'react'
import type { Context, Middleware } from '../types.ts'

declare module '../types.ts' {
  interface Context {
    render(element: ReactElement | string, opts?: RenderOptions): Promise<Response>
  }
}

export interface RenderOptions {
  data?: Record<string, unknown>
  props?: Record<string, unknown>
  status?: number
  headers?: Record<string, string>
}

export interface ReactOptions {
  layout?: ComponentType<{ children: ReactNode }> | string
}

export interface ReactInjected {
  render: (element: ReactElement | string, opts?: RenderOptions) => Promise<Response>
}

export type ReactMiddleware = Middleware<Context, Context & ReactInjected>
