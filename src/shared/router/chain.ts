/**
 * 中间件链执行（SHARED-TRIE-EXCELLENCE B0——2027-10 自 server/core/chain.ts
 * 移入 shared——**前端获得 middleware 能力**（机制就位——路由内核
 * dispatchRouter 的 resolveHandler 钩子消费））
 *
 * next() 重复调用守卫在案（called 标志——server 路由测试锁定 500 语义）。
 */
import type { SharedHandler, SharedMiddleware } from './types.ts'

export async function runChain<TCtx>(
  mws: SharedMiddleware<TCtx>[],
  finalHandler: SharedHandler<TCtx>,
  req: Request,
  ctx: TCtx,
): Promise<Response> {
  if (mws.length === 0) return finalHandler(req, ctx)
  let i = 0
  const dispatch: SharedHandler<TCtx> = (r, c) => {
    if (i >= mws.length) return Promise.resolve(finalHandler(r, c))
    const mw = mws[i++]
    let called = false
    const next: SharedHandler<TCtx> = (r2, c2) => {
      if (called) throw new Error('[router] next() called more than once in middleware')
      called = true
      return dispatch(r2, c2)
    }
    return Promise.resolve(mw(r, c, next))
  }
  return dispatch(req, ctx)
}
