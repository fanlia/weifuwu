export interface Context {
  params: Record<string, string>
  query: Record<string, string>
  user?: unknown
  parsed?: Record<string, unknown>
  mountPath?: string
  locale?: string
  t?: (key: string, params?: Record<string, string>) => string
  requestId?: string
  prefs?: Record<string, string>
  theme?: string
  setPref?: (name: string, value: string) => Response
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
