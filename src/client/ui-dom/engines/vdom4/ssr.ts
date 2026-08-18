/**
 * vdom4 ssr — 服务端渲染（统一管线：build + diff → 命令（路径 id）→ HTML/序列化）
 *
 * 确定性路径 id（c0.0.c.t0 格式）——服务端与客户端同声明同路径——hydration 可
 * 按 id 精确吸收（无需结构猜测）。
 */

import type { VNode, Command, Ctx } from './types.ts'
import { ShadowState } from './shadow.ts'
import { buildVNode } from './build.ts'
import { diffTree } from './diff.ts'

/** 服务端 ctx shim（render/onUnmount no-op——data 管道服务端版（真 fetch）） */
export function makeSsrCtx(data?: Pick<Ctx['data'], 'get' | 'has'>): Ctx {
  const cache = new Map<string, Promise<unknown>>()
  const pipe = data ?? {
    get: <T = unknown>(key: string, fetcher?: () => Promise<T>): Promise<T> => {
      let p = cache.get(key)
      if (!p) {
        p = fetcher ? Promise.resolve(fetcher()) : (fetch(key).then((r) => r.json()) as Promise<T>)
        cache.set(key, p)
      }
      return p as Promise<T>
    },
    has: (key: string) => cache.has(key),
  }
  return {
    render: () => { /* SSR no-op */ },
    data: pipe as Ctx['data'],
    onUnmount: () => { /* SSR no-op */ },
    browser: null,
    ui: {},
  } as unknown as Ctx
}

/** 服务端渲染 → 命令（路径 id）+ 数据种子（工厂 ctx.data.get 的已解析值——
 *  客户端 preload 预热——hydration 同步命中——零二次 fetch） */
export async function renderToCommands(vnode: VNode): Promise<{ commands: Command[]; seed: Record<string, unknown> }> {
  const shadow = new ShadowState()
  // SSR 数据管道（真 fetch + 种子收集）
  const cache = new Map<string, Promise<unknown>>()
  const resolved = new Map<string, unknown>()
  const data = {
    get: <T = unknown>(key: string, fetcher?: () => Promise<T>): Promise<T> => {
      let p = cache.get(key)
      if (!p) {
        p = fetcher ? Promise.resolve(fetcher()) : (fetch(key).then((r) => r.json()) as Promise<T>)
        cache.set(key, p)
        p.then((v) => resolved.set(key, v)).catch(() => {})
      }
      return p as Promise<T>
    },
    has: (key: string) => cache.has(key),
  }
  const ctx = makeSsrCtx(data)
  const built = await buildVNode(vnode, ctx, shadow, null, 'root')
  const commands = diffTree(built, shadow)
  // 等待所有数据 resolve（工厂 await ctx.data——渲染完成即就绪）
  await Promise.allSettled([...cache.values()])
  return { commands, seed: Object.fromEntries(resolved) }
}

/** 命令 → HTML（按 insert 顺序 append 到 parent——锚点法命令序保证结构） */
export function commandsToHtml(commands: Command[]): string {
  const tags = new Map<string, string>()       // id → tag
  const attrs = new Map<string, Array<[string, unknown]>>()
  const texts = new Map<string, string>()
  const children = new Map<string, string[]>() // id → children ids（insert 顺序）
  const rootKids: string[] = []

  for (const c of commands) {
    switch (c.op) {
      case 'create':
        tags.set(c.id, c.tag)
        break
      case 'setProp':
        if (c.key === 'key' || c.key === 'children' || c.key === 'ref') break
        if (typeof c.value === 'function') break
        if (c.value != null && c.value !== false) {
          const arr = attrs.get(c.id) ?? []
          arr.push([c.key, c.value])
          attrs.set(c.id, arr)
        }
        break
      case 'createText':
        texts.set(c.id, c.value)
        break
      case 'createAnchor':
        tags.set(c.id, '#anchor')
        break
      case 'insert': {
        const target = c.parent === 'root' ? rootKids : (children.get(c.parent) ?? [])
        target.push(c.id)
        if (c.parent !== 'root') children.set(c.parent, target)
        break
      }
      default: break
    }
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const emit = (id: string): string => {
    const tag = tags.get(id)
    if (tag === '#anchor') return '<!--wf-anchor-->'
    const text = texts.get(id)
    if (text != null) return esc(text)
    if (tag) {
      const a = attrs.get(id) ?? []
      const attrStr = a
        .filter(([k]) => k !== 'data-v4-id' && k !== 'key' && k !== 'ref')
        .map(([k, v]) => ` ${k}="${esc(String(v))}"`).join('')
      // data-v4-id（吸收标记——路径 id——客户端精确匹配）
      const kids = (children.get(id) ?? []).map(emit).join('')
      return `<${tag} data-v4-id="${esc(id)}"${attrStr}>${kids}</${tag}>`
    }
    return ''
  }
  return rootKids.map(emit).join('')
}

/** 序列化（传输） */
export function serializeCommands(commands: Command[]): string {
  return JSON.stringify(commands.map((c) => ({ ...c, vn: undefined })))
}

/** 反序列化 */
export function deserializeCommands(json: string): Command[] {
  return JSON.parse(json) as Command[]
}
