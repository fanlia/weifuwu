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
 */
export function trieFind<T>(root: TrieNode<T>, path: string): TrieNode<T> | null {
  const segments = splitPath(path)
  let node: TrieNode<T> | null = root
  for (const segment of segments) {
    if (!node) return null
    if (segment === '*') return node
    node = node.children.get(segment) ?? node.children.get(':') ?? null
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
 * 匹配（segments → { value, params, wildcard } | null）：
 * 精确优先（静态 → :param 逐段）——段失败或终端无 value → 通配兜底
 * （从 root 沿路径检查任意前缀深度的通配注册——params['*'] = 剩余段）；
 * 精确命中且节点有通配槽（'/' + '/*' 并存）→ params['*'] = ''（精确优先标记）。
 */
export function trieMatch<T>(
  root: TrieNode<T>, segments: string[],
): { value: T; params: Record<string, string>; wildcard: boolean } | null {
  const params: Record<string, string> = {}
  // 根路径 '/'（空 segments）：root 精确优先——回退通配
  if (segments.length === 0) {
    if (root.value !== undefined) {
      if (root.wildcardValue !== undefined) params['*'] = ''
      return { value: root.value, params, wildcard: false }
    }
    return root.wildcardValue !== undefined
      ? { value: root.wildcardValue, params, wildcard: true }
      : null
  }
  // 精确匹配（静态 → :param 逐段）
  let node = root
  for (let i = 0; i < segments.length; i++) {
    const next = matchChild(node, segments[i], params)
    if (!next) return wildcardFallback(root, segments, i, params)
    node = next
  }
  if (node.value !== undefined) {
    if (node.wildcardValue !== undefined) params['*'] = ''
    return { value: node.value, params, wildcard: false }
  }
  // 终端节点是纯前缀（如 /dashboard 只有 /dashboard/overview 子路由）：
  // 无 value 时回退通配（SPA catch-all 场景）
  return wildcardFallback(root, segments, segments.length, params)
}

/** 通配兜底（精确失败后——从 root 沿路径检查任意前缀深度的通配注册） */
function wildcardFallback<T>(
  root: TrieNode<T>, segments: string[], depth: number, params: Record<string, string>,
): { value: T; params: Record<string, string>; wildcard: boolean } | null {
  let node = root
  for (let i = 0; i < depth; i++) {
    if (node.wildcardValue !== undefined) {
      params['*'] = segments.slice(i).join('/')
      return { value: node.wildcardValue, params, wildcard: true }
    }
    const next = matchChild(node, segments[i], params)
    if (!next) return null
    node = next
  }
  if (node.wildcardValue !== undefined) {
    params['*'] = segments.slice(depth).join('/')
    return { value: node.wildcardValue, params, wildcard: true }
  }
  return null
}

function matchChild<T>(
  node: TrieNode<T>, segment: string, params: Record<string, string>,
): TrieNode<T> | null {
  if (node.children.has(segment)) return node.children.get(segment)!
  if (node.children.has(':')) {
    const child = node.children.get(':')!
    if (child.param) params[child.param] = decodeURIComponent(segment)
    return child
  }
  return null
}
