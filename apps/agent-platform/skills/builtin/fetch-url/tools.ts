/**
 * fetch-url skill — 公开 URL 内容读取（SSRF 防护：仅 http/https + 非内网）
 */

import type { ToolDefinition } from '../../../src/ai/types.ts'
import type { Context } from 'weifuwu'

export function isPrivate(addr: string): boolean {
  const m = addr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export const tools: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'http_get',
      description: '读取公开网页或 API 内容（HTTP GET，返回纯文本，最多 2KB——足够提取标题/要点）。调用一次即可，直接基于返回内容回答，不要重复调用本工具。仅限公网 http/https URL。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '完整 URL，如 https://example.com/doc' },
        },
        required: ['url'],
      },
    },
  },
]

export function createHandlers() {
  return {
    http_get: async (args: Record<string, unknown>): Promise<unknown> => {
      const raw = String(args.url ?? '')
      const url = new URL(raw)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, error: '仅支持 http/https' }
      const { lookup } = await import('node:dns/promises')
      const addrs = await lookup(url.hostname, { all: true }).catch(() => [])
      for (const a of addrs) {
        if (isPrivate(a.address)) return { ok: false, error: `拒绝内网地址: ${a.address}` }
      }
      try {
        const res = await fetch(url.toString(), {
          headers: { 'User-Agent': 'agent-platform-skill/1.0' },
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
        const text = await res.text()
        return { ok: true, content: text.slice(0, 2000) }
      } catch (e: any) {
        return { ok: false, error: `请求失败: ${e?.message ?? e}` }
      }
    },
  }
}
