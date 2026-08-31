/**
 * 中间件链执行（ROUTER-CORE 波次 E 纯移动拆解——2027-10）
 *
 * runChain 自 router.ts Router 类移出（零 this 依赖——纯函数）。
 * next() 重复调用守卫在案（called 标志——路由测试锁定 500 语义）。
 */
import type { Handler, Middleware } from '../types.ts'

export async function runChain(
  mws: Middleware[], finalHandler: Handler, req: Request, ctx: any,
): Promise<Response> {
  if (mws.length === 0) return finalHandler(req, ctx)
  let i = 0
  const dispatch: Handler = (r, c) => {
    if (i >= mws.length) return Promise.resolve(finalHandler(r, c))
    const mw = mws[i++]
    let called = false
    const next: Handler = (r2, c2) => {
      if (called) throw new Error('[router] next() called more than once in middleware')
      called = true
      return dispatch(r2, c2)
    }
    return Promise.resolve(mw(r, c, next as Parameters<typeof mw>[2]))
  }
  return dispatch(req, ctx)
}
