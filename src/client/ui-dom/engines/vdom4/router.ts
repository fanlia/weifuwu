/**
 * vdom4 router — UIRouter（类比后端 Router——Trie 匹配 + 路径参数 + 通配符）
 *
 * 后端 `src/core/router.ts` 的 Trie 语义前端化：
 *  - get(path, handler)：静态段 / :id 参数段 / * 通配段（O(path_segments) 匹配）
 *  - notFound(handler)：404 兜底
 *  - match(path) → { handler, params }——确定性（首个匹配——注册序优先静态）
 *
 * 与 vdom3 createRouter（RouteDef[] 声明式数组）的差异：命令式注册
 * （get/use/notFound——类比后端）——路由定义零散注册、服务端/客户端共享同一实例。
 */

import type { VNode } from './types.ts'

/** 页面 handler（params → vnode——组件/元素/数组） */
export type PageHandler = (params: Record<string, string>) => VNode | VNode[] | null

interface TrieNode {
  /** 静态段 → 子节点 */
  children: Map<string, TrieNode>
  /** 参数段（:id）→ 子节点 */
  paramChild: TrieNode | null
  paramName: string | null
  /** 通配段（*）→ 子节点 */
  wildcardChild: TrieNode | null
  /** 本段终点 handler（注册序——先注册先匹配） */
  handler: PageHandler | null
}

function createNode(): TrieNode {
  return { children: new Map(), paramChild: null, paramName: null, wildcardChild: null, handler: null }
}

/** UIRouter（服务端/客户端共享同一实例——匹配/参数注入两端同源） */
export class UIRouter {
  private root = createNode()
  private notFoundHandler: PageHandler | null = null
  /** 路径段缓存（'/a/:id/*' → 段数组——注册时编译一次） */
  private readonly compiled = new Map<string, string[]>()

  /** 注册页面路由（:id 参数段 / * 通配段——与后端 Router 语义一致） */
  get(path: string, handler: PageHandler): this {
    const segments = this.compile(path)
    let node = this.root
    for (const seg of segments) {
      if (seg === '*') {
        if (!node.wildcardChild) node.wildcardChild = createNode()
        node = node.wildcardChild
      } else if (seg.startsWith(':')) {
        if (!node.paramChild) { node.paramChild = createNode(); node.paramName = seg.slice(1) }
        node = node.paramChild
      } else {
        if (!node.children.has(seg)) node.children.set(seg, createNode())
        node = node.children.get(seg)!
      }
    }
    node.handler = handler
    return this
  }

  /** 404 兜底 */
  notFound(handler: PageHandler): this {
    this.notFoundHandler = handler
    return this
  }

  /** 匹配（确定性：静态段优先于参数段——参数段优先于通配段；参数收集） */
  match(path: string): { handler: PageHandler; params: Record<string, string> } | null {
    const segments = this.compile(path)
    const params: Record<string, string> = {}
    let node = this.root
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      const staticNode = node.children.get(seg)
      if (staticNode) {
        node = staticNode
        continue
      }
      if (node.paramChild) {
        params[node.paramName ?? ''] = decodeURIComponent(seg)
        node = node.paramChild
        continue
      }
      if (node.wildcardChild) {
        // 通配：吞噬剩余段（* 匹配多段）
        params['*'] = segments.slice(i).map(decodeURIComponent).join('/')
        node = node.wildcardChild
        break
      }
      return null
    }
    if (node.handler) return { handler: node.handler, params }
    // 段匹配完但无 handler——通配节点下注册的 handler（/a/* 匹配 /a/x/y）
    if (node.wildcardChild?.handler) {
      params['*'] = ''
      return { handler: node.wildcardChild.handler, params }
    }
    return null
  }

  /** 未匹配 → notFound（无注册 → null） */
  resolve(path: string): { handler: PageHandler; params: Record<string, string> } | null {
    return this.match(path) ?? (this.notFoundHandler ? { handler: this.notFoundHandler, params: {} } : null)
  }

  private compile(path: string): string[] {
    let segs = this.compiled.get(path)
    if (!segs) {
      segs = path.split('/').filter(Boolean)
      this.compiled.set(path, segs)
    }
    return segs
  }
}
