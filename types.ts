export interface Context {
  params: Record<string, string>
  query: Record<string, string>
  user?: unknown
  parsed?: Record<string, unknown>
  mountPath?: string
  t?: (key: string, params?: Record<string, string>, fallback?: string) => string
  setPref?: (name: string, value: string) => Response
  prefs?: Record<string, string>
  env?: Record<string, string>
  layoutStack?: { path: string; component: any }[]  // set by layout() middleware, read by ssr()
  [key: string]: unknown  // allow arbitrary middleware-injected data
}

export type Handler = (
  req: Request,
  ctx: Context,
) => Response | Promise<Response>

export type Middleware = (
  req: Request,
  ctx: Context,
  next: Handler,
) => Response | Promise<Response>

export type ErrorHandler = (
  error: Error,
  req: Request,
  ctx: Context,
) => Response | Promise<Response>
