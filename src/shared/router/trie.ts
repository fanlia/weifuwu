/**
 * weifuwu shared — Trie 路径匹配核心（前后端共用——零 HTTP 依赖）
 *
 * 来源：后端 Router（src/server/core/router.ts）的 Trie 匹配逻辑抽离——
 * 真实事故语义保留：
 * - **静态段优先** → :param → * 通配（O(path_segments) 匹配——确定性——
 *   注册序优先静态）
 * - **param 冲突检查**：同一位置 :id 与 :name 并存抛错（不静默）
 * - **通配独立槽**：精确 value 与通配 value 互不覆盖（showcase SSR 事故——
 *   '/' + '/*' 并存时通配曾抢先精确 handler）
 * - **根路径 '/'**：splitPath 过滤空段返回 []——value 绑 root 节点
 *
 * 泛型 value：后端 = method 表（{ handlers, middlewares }）；前端 = 页面
 * handler。匹配返回 { value, params }——params 注入由调用方决定
 * （后端 ctx/前端 req）。
 */

/** 泛型 Trie 节点 */
export interface TrieNode<T> {
  children: Map<string, TrieNode<T>>
  /** 参数段名（:id → 'id'——该子节点是参数槽） */
  param?: string
  /** 通配段（*——匹配剩余任意段） */
  wildcard?: boolean
  /** 精确路径 value（路径完全匹配） */
  value?: T
  /** 通配路径 value（独立槽——不被精确覆盖；反之亦然） */
  wildcardValue?: T
}

export function createTrie<T>(): TrieNode<T> {
  return { children: new Map() }
}

/** 路径分段（'/a/b' → ['a','b']——空段过滤——根路径 '/' → []） */
export function splitPath(path: string): string[] {
  return path.split('/').filter(Boolean)
}

function createParamChild<T>(
  node: TrieNode<T>, segment: string, createNode: () => TrieNode<T>,
): TrieNode<T> {
  const paramName = segment.slice(1)
  if (!node.children.has(':')) {
    const child = createNode()
    child.param = paramName
    node.children.set(':', child)
  }
  const child = node.children.get(':')!
  if (child.param !== paramName) {
    throw new Error(
      `[router] param conflict: ":${child.param}" already registered, cannot register ":${paramName}"`,
    )
  }
  return child
}

function getOrCreateChild<T>(
  node: TrieNode<T>, segment: string, createNode: () => TrieNode<T>,
): TrieNode<T> {
  if (segment === '*') {
    node.wildcard = true
    return node
  }
  if (segment.startsWith(':')) return createParamChild(node, segment, createNode)
  if (!node.children.has(segment)) node.children.set(segment, createNode())
  return node.children.get(segment)!
}

/**
 * 查找路径终点节点（不含通配语义——用于冲突检查/多方法合并）——
 * 遇 '*' 段返回当前节点（通配槽）；未注册路径返回 null。
 *
 * **精确匹配纪律（真实事故——agent-platform 沙盒路由）**：静态段只匹配
 * 静态子节点——参数段（:xxx）只匹配参数槽。此前静态段用 `children.get(':')`
 * 兜底——`:id/debug` 会命中 `:id/:action` 参数槽（children key ':'）——
 * 冲突检查返回 POST action 节点——value.handlers.set('GET', debugHandler)
 * **污染共享 value**（GET 写进 POST action 的 handlers）——后续
 * `:id/<静态段>`（processes/stats）注册时再次命中 action 槽——误报
 * `route conflict already registered`。
 */
export function trieFind<T>(root: TrieNode<T>, path: string): TrieNode<T> | null {
  const segments = splitPath(path)
  let node: TrieNode<T> | null = root
  for (const segment of segments) {
    if (!node) return null
    if (segment === '*') return node
    node = segment.startsWith(':')
      ? (node.children.get(':') ?? null)
      : (node.children.get(segment) ?? null)
  }
  return node
}

/**
 * 注册（path → value）——分段插入：
 * '/'（空段）→ value 绑 root；'*' 结尾 → wildcardValue（独立槽）；
 * 其余逐段 getOrCreateChild——终点绑 value。返回终点节点（冲突检查）。
 */
export function trieRegister<T>(
  root: TrieNode<T>, path: string, value: T, isWildcardValue = false,
): TrieNode<T> {
  const segments = splitPath(path)
  let node = root
  for (const segment of segments) {
    if (segment === '*') {
      node.wildcard = true
      node.wildcardValue = value
      return node
    }
    node = getOrCreateChild(node, segment, () => createTrie<T>())
  }
  if (isWildcardValue) node.wildcardValue = value
  else node.value = value
  return node
}

/**
 * **精确匹配 DFS（ROUTER-CORE A3 fuzz 实证修复——2027-10）**：静态优先 +
 * param 回溯——**first hit = 逐段贪心最具体路线**。
 *
 * **回溯必要性（fuzz seed=11 req=c/c 实证）**：`/c/c/*`（通配）与
 * `/:p0/c`（精确）并存时——逐段贪心走静态 'c' 路线到通配 fallback——
 * param 路线（精确 `/:p0/c`）被静态首段**遮蔽后不回溯**——违反
 * 「精确 > 通配」语义。DFS：静态分支失败后回溯 param 分支——精确命中
 * 优先于任何通配。
 */
function exactDfs<T>(
  node: TrieNode<T>, segments: string[], i: number, params: Record<string, string>,
  want: 'value' | 'wildcard' = 'value',
): { value: T; params: Record<string, string>; node: TrieNode<T> } | null {
  if (i === segments.length) {
    const v = want === 'value' ? node.value : node.wildcardValue
    return v !== undefined ? { value: v, params: { ...params }, node } : null
  }
  const seg = segments[i]
  // 静态优先（逐段贪心——具体者胜）
  const st = node.children.get(seg)
  if (st) {
    const r = exactDfs(st, segments, i + 1, params, want)
    if (r) return r
  }
  // param 回溯（静态路线失败后——精确语义完整性）
  const p = node.children.get(':')
  if (p?.param) {
    const params2 = { ...params, [p.param]: decodeURIComponent(seg) }
    const r = exactDfs(p, segments, i + 1, params2, want)
    if (r) return r
  }
  return null
}

/**
 * 匹配（segments → { value, params, wildcard } | null）：
 * 精确优先（DFS——静态 → :param 回溯——见 exactDfs）——精确未命中 → 通配
 * 兜底（从 root 沿路径检查任意前缀深度的通配注册——params['*'] = 剩余段）；
 * 精确命中且节点有通配槽（'/' + '/*' 并存）→ params['*'] = ''（精确优先标记）。
 */
export function trieMatch<T>(
  root: TrieNode<T>, segments: string[],
): { value: T; params: Record<string, string>; wildcard: boolean } | null {
  // 精确匹配（DFS——静态优先 + param 回溯——A3 fuzz 实证修复）
  // **空段（根路径 '/'）天然处理**：exactDfs(root, [], 0) 终端即 root——
  // （A2 统一——原手写空段分支与 DFS 逻辑重复——语义漂移面）
  const exact = exactDfs(root, segments, 0, {})
  if (exact) {
    // 精确命中节点若有通配槽（'/' + '/*' 并存）→ '*': ''（精确优先标记）
    const hasWf = exact.node.wildcardValue !== undefined
    return { value: exact.value, params: hasWf ? { ...exact.params, '*': '' } : exact.params, wildcard: false }
  }
  // 精确未命中 → 通配兜底（SPA catch-all 场景）
  return wildcardFallback(root, segments, segments.length)
}

/**
 * 通配兜底（精确失败后——**逐前缀深度浅优先 + exactDfs 回溯**——A3 fuzz
 * seed=42 实证修复）：
 * **旧实现**（matchChild 逐段）与精确匹配同病——静态子节点遮蔽 param 槽
 * 且不回溯——`/a/:p1/c` 的静态 'a' 遮蔽 `/:p0/a/*` 的 param 前缀路线——
 * fallback 走错分支后失败返回 null（通配注册静默丢失）。
 * **新实现**：对每个前缀深度 d（0..len——**浅优先**：`/*` 与 `/a/*` 并存
 * 时 root 通配胜——探针②实证）——exactDfs（带回溯）匹配前 d 段——
 * 到达节点有 wildcardValue 即命中。
 */
function wildcardFallback<T>(
  root: TrieNode<T>, segments: string[], depth: number,
): { value: T; params: Record<string, string>; wildcard: boolean } | null {
  for (let d = 0; d <= depth; d++) {
    const r = exactDfs(root, segments.slice(0, d), 0, {}, 'wildcard')
    if (r) {
      return { value: r.value, params: { ...r.params, '*': segments.slice(d).join('/') }, wildcard: true }
    }
  }
  return null
}
