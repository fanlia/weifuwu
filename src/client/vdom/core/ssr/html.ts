/**
 * vdom core — commandToHtml（命令事件流 → HTML——流式 SSR 核心）
 *
 * 设计（design/vdom-plan.md §3）：服务端消费同一 handler 的 Response——
 * `res.body.pipeThrough(commandToHtml())` → HTTP 流式响应（边构建边吐
 * HTML——React Fizz 同模式）：
 * - create（attrs 序列化面）→ 开标签（属性转义——style 对象 → CSS 文本）
 * - createText → 转义文本；createAnchor → 注释占位
 * - close → 闭标签（tag 栈——void 元素不闭合）
 * - insert/remove/setProp（事件/运行时面）/done → 无输出（HTML 无交互面）
 * - setText → 转义文本（增量流场景）
 *
 * 与客户端同构：同一命令流——客户端 apply DOM / 服务端吐 HTML——
 * 精准增量流 → 增量 HTML（服务端驱动更新后续）。
 */

import type { Command } from '../command/index.ts'
import { ariaBoolValue } from '../field/attributes.ts'

/** HTML 转义（文本/属性值） */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** void 元素（自闭——close 不吐闭标签） */
export const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
])

/** camelCase → kebab-case（style 对象序列化） */
export function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}

/** create attrs → HTML 属性字符串（转义——style 对象 → CSS 文本——boolean 空串） */
export function attrsToHtml(attrs: Record<string, unknown>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(attrs)) {
    // aria-* 枚举语义属性（布尔归一——客户端 applyAttribute 同规则单源）——
    // 必须在 false skip 之前——aria-expanded=false 是有效状态不可省略
    const ariaBool = ariaBoolValue(k, v)
    if (ariaBool !== null) {
      parts.push(`${k}="${ariaBool}"`)
      continue
    }
    if (v === null || v === undefined || v === false) continue
    if (k === 'style' && v && typeof v === 'object') {
      const css = Object.entries(v)
        .filter(([, sv]) => sv !== undefined && sv !== null && sv !== false)
        .map(([sk, sv]) => `${kebab(sk)}: ${sv}`)
        .join('; ')
      if (css) parts.push(`style="${escapeHtml(css)}"`)
    } else if (typeof v === 'boolean') {
      parts.push(`${k}=""`)
    } else {
      parts.push(`${k}="${escapeHtml(String(v))}"`)
    }
  }
  return parts.length ? ' ' + parts.join(' ') : ''
}

/** 命令事件流 → HTML 字符串流（TransformStream——tag 栈闭合） */
export function commandToHtml(): TransformStream<Command, string> {
  const stack: string[] = []
  return new TransformStream<Command, string>({
    transform(cmd, controller) {
      switch (cmd.op) {
        case 'create':
          stack.push(cmd.tag)
          controller.enqueue(`<${cmd.tag}${attrsToHtml(cmd.attrs)}>`)
          break
        case 'createText':
          controller.enqueue(escapeHtml(cmd.value))
          break
        case 'createAnchor':
          controller.enqueue('<!--wf-hole-->')
          break
        case 'close': {
          const tag = stack.pop()
          if (tag && !VOID_ELEMENTS.has(tag)) controller.enqueue(`</${tag}>`)
          break
        }
        case 'setText':
          controller.enqueue(escapeHtml(cmd.value))
          break
        case 'insert':
        case 'remove':
        case 'setProp':
        case 'ref':
        case 'unref':
        case 'mount':
        case 'unmount':
        case 'move':
        case 'done':
          break // HTML 无结构/运行时面——无输出
      }
    },
  })
}

/** 完整 HTML 文档包装（SSR 页面——<!DOCTYPE html> + root 容器） */
export function htmlDocument(html: string, opts: { title?: string; rootId?: string; data?: Record<string, unknown> } = {}): string {
  const rootId = opts.rootId ?? 'root'
  const dataScript = opts.data
    // **script 内 JSON 不 HTML 转义（引号会被 &quot; 破坏——window.__DATA__
    // SyntaxError 实证）**：只转义 `<`（防 </script> 注入——JSON 安全转义）
    ? `<script>window.__DATA__=${JSON.stringify(opts.data).replace(/</g, '\\u003c')}</script>`
    : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title ?? '')}</title></head><body><div id="${rootId}">${html}</div>${dataScript}</body></html>`
}
