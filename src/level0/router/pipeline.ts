/**
 * 路由内核——流程骨架 + 差异钩子（SHARED-TRIE-EXCELLENCE B0——2027-10）
 *
 * **机制公用、实现不一样**（用户论证采纳——handler 签名双端同构 +
 * 流程 6 步中 3 步完全同构、3 步是差异点而非不同流程）：
 *
 * ```
 * dispatchRouter 流程骨架（单一实现源——改一处双端生效）：
 *   1. parseRequestTarget（URIError → 400 信号——双端统一防御）
 *   2. trieMatch（shared Trie——静态/param/通配——回溯语义在案）
 *   3. enrichCtx（ctx 扩展——机制一致能力不同）
 *   4. resolveHandler（verb 差异点：server method 表 / client 直调）
 *   5. run → onRouteSuccess（恢复清出）| catch → onError
 *   6. 404/405 兜底（形态差异钩子化）
 * ```
 *
 * **双端类 API 零变化**：Router.handler() / UIRouter.resolve() 内部
 * 换 dispatchRouter——405/Allow/去重收敛 serverPipeline；route 注入/
 * 前端 404 收敛 clientPipeline；serve（Request/Response 编解码边界）
 * 留双端——pipeline 不关心。
 */
import { trieMatch, type TrieNode } from './trie.ts'
import { parseRequestTarget, freshParams } from './context.ts'

/** 匹配结果（trieMatch 返回 + verb 分类的输入载荷） */
export interface RouteMatch<TValue> {
  value: TValue
  params: Record<string, string>
  wildcard: boolean
}

export interface RouterPipeline<TValue, TCtx> {
  /**
   * **verb 差异点**（负载 → 实际执行闭包）：
   * - server：value 是 method 表——method 查找 + HEAD fallback（mw 联动）
   *   + 405 分类 + runChain 链组装（globalMws + routeMws）
   * - client：value 是 PageHandler——直调闭包
   */
  resolveHandler(
    m: RouteMatch<TValue>, req: Request, ctx: TCtx,
  ):
    | { kind: 'route'; run: () => Response | Promise<Response> }
    /** method 表分类（405 Allow 头）——server 独有 */
    | { kind: 'not-allowed'; methods: string[] }
    /** 通配命中但 method 落空 → 404（通配不产生 405——探针实证锁死） */
    | { kind: 'not-found' }

  /** 404 兜底（server: JSON + globalMws 链；client: notFound ?? null body） */
  onNotFound(req: Request, ctx: TCtx, path: string): Response | Promise<Response>

  /** 405 兜底（server 实现——globalMws 链 + Allow 头；client 不实现） */
  onMethodNotAllowed?(
    methods: string[], req: Request, ctx: TCtx, path: string,
  ): Response | Promise<Response>

  /** 错误语义（server: onError 优先/HttpError/去重计数；client 可缺省直抛） */
  onError?(e: unknown, req: Request, ctx: TCtx, path: string): Response | Promise<Response>

  /** 路由成功完成（server: 恢复清出错误状态——再错再报；client 可缺省） */
  onRouteSuccess?(req: Request, ctx: TCtx, path: string): void

  /**
   * **ctx 扩展钩子**（机制一致能力不同）：
   * - server：params merge 进既有 ctx.params（Object.assign 语义）
   * - client：params fresh + query + ctx.route 三面注入
   * - 404（m null）时也执行——client notFound handler 收到空 params +
   *   query + route（原语义精确保留）
   */
  enrichCtx?(
    ctx: TCtx, m: RouteMatch<TValue> | null, pathname: string, query: Record<string, string>,
  ): void
}

/** 400 响应（URIError 信号统一形态——双端一致） */
function badRequest(reason: string): Response {
  return Response.json({ error: 'Bad Request', reason }, { status: 400 })
}

/**
 * **路由分发流程骨架**——双端 Router 的内核（机制公用、实现不一样）。
 * 差异全部在 pipeline 钩子——骨架只编排顺序与错误边界。
 */
export async function dispatchRouter<TValue, TCtx>(
  root: TrieNode<TValue>,
  pipeline: RouterPipeline<TValue, TCtx>,
  req: Request,
  ctx: TCtx,
): Promise<Response> {
  // 1. 解析（非法编码/非法 URL → 400 信号——双端统一防御）
  const target = parseRequestTarget(req)
  if (!target.ok) return badRequest(target.reason)

  // 2. Trie 匹配（静态/param 回溯/通配兜底——语义在 trie.ts）
  const m = trieMatch(root, target.segments)
  const match: RouteMatch<TValue> | null = m
    ? { value: m.value, params: freshParams(m), wildcard: m.wildcard }
    : null

  // 3. ctx 扩展（enrichCtx 恒执行——404 时也注入——client notFound 语义保留）
  pipeline.enrichCtx?.(ctx, match, target.pathname, target.query)

  try {
    // 4. 无匹配 → 404 兜底
    if (!match) return await pipeline.onNotFound(req, ctx, target.pathname)

    // 5. verb 差异点（负载 → 执行闭包）
    const resolved = pipeline.resolveHandler(match, req, ctx)
    if (resolved.kind === 'not-found') {
      return await pipeline.onNotFound(req, ctx, target.pathname)
    }
    if (resolved.kind === 'not-allowed') {
      if (pipeline.onMethodNotAllowed) {
        return await pipeline.onMethodNotAllowed(resolved.methods, req, ctx, target.pathname)
      }
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { Allow: resolved.methods.join(', ') },
      })
    }

    // 6. 执行 + 成功钩子
    const res = await resolved.run()
    pipeline.onRouteSuccess?.(req, ctx, target.pathname)
    return res
  } catch (e) {
    // 错误边界（onError 缺省时直抛——serve 层兜底）
    if (pipeline.onError) return pipeline.onError(e, req, ctx, target.pathname)
    throw e
  }
}
