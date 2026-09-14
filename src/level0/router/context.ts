/**
 * 请求目标解析 + ctx 注入纯函数（SHARED-TRIE-EXCELLENCE B1——2027-10）
 *
 * **双端重复面收敛**（盘点实证：URL→segments 三处重复、query 注入
 * 双端同式、params fresh 语义等价实现分散）——单一实现源：
 * - server：handler() / serve.ts createRequest
 * - client：UIRouter.resolve / has
 *
 * **URIError 防御双端统一**：param 段 decodeURIComponent 对非法编码
 * （%zz）抛 URIError——非法编码 URL 是客户端错误 → 400 信号
 * （server C3 修复迁移至此——client 同享——双端 400 语义一致）。
 */

/** 解析结果——ok=false 时 reason 分类（400 响应由调用方构造） */
export type RequestTarget =
  | { ok: true; segments: string[]; pathname: string; query: Record<string, string> }
  | { ok: false; reason: 'malformed-encoding' | 'invalid-url' }

/**
 * Request → 匹配输入（segments/pathname/query 一次拿全——零二次解析）。
 * URIError（非法 percent-encoding）→ { ok: false, reason: 'malformed-encoding' }
 * ——**不抛出**（调用方按 400 分类——双端统一语义）。
 */
export function parseRequestTarget(req: Request): RequestTarget {
  let url: URL
  try {
    url = new URL(req.url)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  const query = parseQuery(url)
  // **param 段 decode 的 URIError 提前捕获**：trieMatch 内 exactDfs 对
  // param 槽 decodeURIComponent——非法编码在此暴露（pathname 预检）
  try {
    decodeURI(url.pathname)
  } catch {
    return { ok: false, reason: 'malformed-encoding' }
  }
  // 段级检测（%zz 在段中——decodeURI 不抛（只检保留字），段 decode 才抛
  // ——逐段预检与 exactDfs 的 decodeURIComponent 行为对齐）
  for (const seg of splitSegments(url.pathname)) {
    try {
      decodeURIComponent(seg)
    } catch {
      return { ok: false, reason: 'malformed-encoding' }
    }
  }
  return { ok: true, segments: splitSegments(url.pathname), pathname: url.pathname, query }
}

/** 路径分段（trie splitPath 同源逻辑——空段过滤） */
function splitSegments(pathname: string): string[] {
  return pathname.split('/').filter(Boolean)
}

/** fresh params（match.params 克隆——**不残留旧路由键**——client 契约
 *  语义（params 每次渲染替换）单一实现源） */
export function freshParams(
  match?: { params: Record<string, string> } | null,
): Record<string, string> {
  return match ? { ...match.params } : {}
}

/** query 提取（Object.fromEntries(searchParams)——双端同一实现源） */
export function parseQuery(url: URL): Record<string, string> {
  return Object.fromEntries(url.searchParams)
}
