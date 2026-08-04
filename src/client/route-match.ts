/**
 * 路由匹配纯函数 — 客户端 router 与服务端 uiSsr 共用（无 DOM 依赖）
 *
 * 支持路径参数 :id、通配符 *、嵌套路由（children → chain）。
 * 与后端 Router（Trie）独立——本模块服务于"前端路由表驱动的页面"。
 */

import type { RouteDef } from './types.ts'

export interface FlattenedRoute {
  re: RegExp
  keys: string[]
  def: RouteDef
  chain: RouteDef[]
}

export function joinPaths(a: string, b: string): string {
  if (!b || b === '/') return a || '/'
  const left = a.endsWith('/') ? a.slice(0, -1) : a
  const right = b.startsWith('/') ? b : '/' + b
  return left + right
}

export function compilePath(path: string): { re: RegExp; keys: string[] } {
  const keys: string[] = []
  const reStr = path
    .replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)' })
    .replace(/\*/g, '.*')
  return { re: new RegExp(`^${reStr}$`), keys }
}

export function flattenRoutes(routes: RouteDef[], basePath = '', chain: RouteDef[] = []): FlattenedRoute[] {
  const result: FlattenedRoute[] = []
  for (const route of routes) {
    const fullPath = joinPaths(basePath, route.path)
    const { re, keys } = compilePath(fullPath)
    const fullChain = [...chain, route]
    result.push({ re, keys, def: route, chain: fullChain })
    if (route.children) {
      result.push(...flattenRoutes(route.children, fullPath, fullChain))
    }
  }
  return result
}

export function matchRoute(path: string, routes: FlattenedRoute[]): FlattenedRoute | null {
  let best: FlattenedRoute | null = null
  for (const fr of routes) {
    if (path.match(fr.re)) {
      if (!best || fr.chain.length > best.chain.length) best = fr
    }
  }
  return best
}

/** 从匹配结果提取路径参数 */
export function extractParams(path: string, match: FlattenedRoute): Record<string, string> {
  const params: Record<string, string> = {}
  const m = path.match(match.re)
  if (m) {
    for (let i = 0; i < match.keys.length; i++) {
      params[match.keys[i]] = decodeURIComponent(m[i + 1])
    }
  }
  return params
}
