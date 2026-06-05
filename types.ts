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
