// Context — extensible via module augmentation.
// Built-in middleware modules declare additional properties here.
// e.g. postgres/types.ts → `declare module '../types.ts' { interface Context { sql: Sql<{}> } }`
export interface Context {
  params: Record<string, string>
  query: Record<string, string>
  mountPath?: string
  layoutStack?: { path: string; component: any }[]  // set by layout() middleware, read by ssr()
  env?: Record<string, string>  // public env vars (WEIFUWU_PUBLIC_*)
  [key: string]: unknown  // allow arbitrary middleware-injected data
}

// Generic handler — T extends Context so middleware-injected properties are visible.
// Default T = Context means no generics needed for simple cases.
export type Handler<T extends Context = Context> = (
  req: Request,
  ctx: T,
) => Response | Promise<Response>

// Generic middleware — In receives accumulated context from previous middlewares,
// Out adds new properties. next receives the enriched Out type.
// Default In = Out = Context means backward-compatible.
export type Middleware<
  In extends Context = Context,
  Out extends In = In,
> = (
  req: Request,
  ctx: In,
  next: Handler<Out>,
) => Response | Promise<Response>

export type ErrorHandler<T extends Context = Context> = (
  error: Error,
  req: Request,
  ctx: T,
) => Response | Promise<Response>
