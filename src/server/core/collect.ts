/**
 * Trie 遍历收集纯函数（ROUTER-CORE 波次 E 纯移动拆解——2027-10）
 *
 * 自 router.ts Router 类移出（零 this 依赖——树遍历纯函数）。
 * - collectAll/collectAllWs：mount 展平负载（A1 wildcardValue 修复在案）
 * - collectRoutes/collectWsRoutes：routes() 调试清单
 */
import type { Handler, Middleware } from '../types.ts'
import type { WebSocketHandler } from './ws.ts'
import type { TrieNode } from '../../shared/router/trie.ts'

export type RouteValue = {
  handlers: Map<string, Handler>
  middlewares: Map<string, Middleware[]>
}

export type WsValue = {
  handler: WebSocketHandler
  middlewares: Middleware[]
}

export function collectAll(node: TrieNode<RouteValue>, prefix = ''): Array<{
  method: string; path: string; handler: Handler; middlewares: Middleware[]
}> {
  const out: Array<{ method: string; path: string; handler: Handler; middlewares: Middleware[] }> = []
  // 精确 value（path = prefix 无条件——node.wildcard 只表示该节点存在通配
  // 子槽，不改变精确注册自身的路径）
  for (const [method, handler] of node.value?.handlers ?? []) {
  const rmws = node.value?.middlewares.get(method) || []
  out.push({ method, path: prefix || '/', handler, middlewares: [...rmws] })
  }
  // **通配 value 收集（ROUTER-CORE A1——2027-10 P3 实证修复）**：
  // `sub.get('/files/*')` 注册在 files 节点的 wildcardValue 槽（`*` 段
  // 不建子节点）——展平只查 node.value 时静默丢失（mount 后 404）——
  // 展平 path = prefix + '/*'（trieRegister('*', wildcardValue) 逆变换）
  const wv = node.wildcardValue
  if (wv) {
  for (const [method, handler] of wv.handlers) {
      const rmws = wv.middlewares.get(method) || []
      out.push({ method, path: (prefix || '/') + '/*', handler, middlewares: [...rmws] })
  }
  }
  for (const [seg, child] of node.children) {
  out.push(...collectAll(child, prefix + '/' + (seg === ':' ? `:${child.param}` : seg)))
  }
  return out
}

export function collectAllWs(node: TrieNode<WsValue>, prefix = ''): Array<{
  path: string; handler: WebSocketHandler; middlewares: Middleware[]
}> {
  const out: Array<{ path: string; handler: WebSocketHandler; middlewares: Middleware[] }> = []
  if (node.value?.handler) out.push({ path: prefix || '/', handler: node.value.handler, middlewares: [...node.value.middlewares] })
  // 通配 value 收集（A1——与 _collectAll 同根因——ws 通配路由 mount 丢失）
  if (node.wildcardValue?.handler) {
  out.push({ path: (prefix || '/') + '/*', handler: node.wildcardValue.handler, middlewares: [...node.wildcardValue.middlewares] })
  }
  for (const [seg, child] of node.children) {
  out.push(...collectAllWs(child, prefix + '/' + (seg === ':' ? `:${child.param}` : seg)))
  }
  return out
}

  export function collectRoutes(node: TrieNode<RouteValue>, prefix: string, result: string[]): void {
  for (const [method] of node.value?.handlers ?? []) {
    const m = method === '*' ? 'ANY' : method
    const path = (prefix || '/') + (node.wildcard ? '/*' : '')
    const middlewares = node.value?.middlewares.get(method)
    const mwCount = middlewares ? ` (+${middlewares.length} mw)` : ''
    result.push(`${m.padEnd(7)} ${path}${mwCount}`)
  }
  for (const [seg, child] of node.children) {
    const segment = seg === ':' ? `:${child.param}` : seg
    collectRoutes(child, prefix + '/' + segment, result)
  }
  }

  export function collectWsRoutes(node: TrieNode<WsValue>, prefix: string, result: string[]): void {
  if (node.value?.handler) {
    const path = prefix || '/'
    const mwCount = node.value.middlewares.length ? ` (+${node.value.middlewares.length} mw)` : ''
    result.push(`WS       ${path}${mwCount}`)
  }
  for (const [seg, child] of node.children) {
    const segment = seg === ':' ? `:${child.param}` : seg
    collectWsRoutes(child, prefix + '/' + segment, result)
  }
  }

