/**
 * shared router 类型（SHARED-TRIE-EXCELLENCE B0——2027-10）
 *
 * **双端同构的机制形状**（server/types.ts 与 client PageHandler 字面同构——
 * handler 签名 `(req: Request, ctx) => Response`、middleware洋葱
 * `(req, ctx, next) => Response`——单一实现源）。server/types.ts 可
 * re-export（D 波次收紧时统一）——当前结构类型兼容并存。
 */

/** 路由 handler——双端签名同构（req 标准 Request 零扩展；Response 原生） */
export type SharedHandler<TCtx = unknown> = (
  req: Request,
  ctx: TCtx,
) => Response | Promise<Response>

/** 中间件——洋葱模型（next 调用透传——可短路可改写响应） */
export type SharedMiddleware<TCtx = unknown> = (
  req: Request,
  ctx: TCtx,
  next: SharedHandler<TCtx>,
) => Response | Promise<Response>

/** middleware 元信息（ctx 扩展声明——depends 必须先注册/injects 登记字段） */
export interface MiddlewareMeta {
  /** Fields this middleware injects into ctx. */
  injects: string[]
  /** Fields this middleware depends on (must be injected earlier). */
  depends: string[]
}

/** 带 meta 的 middleware（__meta 可选——ctx-fields 注册表检查依据） */
export type MetaMiddleware<TCtx = unknown> = SharedMiddleware<TCtx> & {
  __meta?: MiddlewareMeta
}
