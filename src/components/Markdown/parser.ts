/**
 * weifuwu/components — Markdown 安全子集 parser
 *
 * 零依赖自研解析器，输出结构化 token（非 HTML 字符串）——
 * 组件层以 VNode 渲染，天然转义任何用户/AI 内容（无 innerHTML 注入面）。
 *
 * 支持块级：标题(#~####) / 段落 / 列表(有序·无序) / 围栏代码块 / 引用 / 分割线
 * 支持行内：**粗体** / *斜体* / `行内代码` / [文本](链接)
 *
 * 诚实裁剪：GFM 表格/任务列表/删除线/脚注/raw HTML/自动链接/语法高亮（见 roadmap）
 */

export interface MdInline {
  type: 'text' | 'code' | 'bold' | 'italic' | 'link'
  text?: string
  href?: string
  children?: MdInline[]
}

export interface MdBlock {
  type: 'heading' | 'paragraph' | 'list' | 'code' | 'quote' | 'hr'
  level?: number
  inline?: MdInline[]
  ordered?: boolean
  items?: MdInline[][]
  lang?: string
  code?: string
}

const URL_RE = /^https?:\/\//i

/** 链接安全：仅 http/https；javascript:/data:/vbscript: 一律拒绝 */
export function safeUrl(href: string): string | null {
  const trimmed = href.trim()
  if (!URL_RE.test(trimmed)) return null
  return trimmed
}

/** 行内解析：code / bold / italic / link，其余为 text（有序优先防嵌套误判） */
export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = []
  let i = 0
  let buf = ''

  const flush = () => {
    if (buf) { out.push({ type: 'text', text: buf }); buf = '' }
  }

  while (i < src.length) {
    const ch = src[i]

    // 行内代码 `...`
    if (ch === '`') {
      const end = src.indexOf('`', i + 1)
      if (end > i) {
        flush()
        out.push({ type: 'code', text: src.slice(i + 1, end) })
        i = end + 1
        continue
      }
      buf += ch; i++; continue
    }

    // 粗体 **...**
    if (ch === '*' && src[i + 1] === '*') {
      const end = src.indexOf('**', i + 2)
      if (end > i) {
        flush()
        out.push({ type: 'bold', children: parseInline(src.slice(i + 2, end)) })
        i = end + 2
        continue
      }
    }
    // 斜体 *...*
    if (ch === '*') {
      const end = src.indexOf('*', i + 1)
      if (end > i) {
        flush()
        out.push({ type: 'italic', children: parseInline(src.slice(i + 1, end)) })
        i = end + 1
        continue
      }
    }

    // 链接 [text](url)
    if (ch === '[') {
      const close = src.indexOf(']', i + 1)
      if (close > i && src[close + 1] === '(') {
        const paren = src.indexOf(')', close + 2)
        if (paren > close) {
          const label = src.slice(i + 1, close)
          const href = src.slice(close + 2, paren)
          const url = safeUrl(href)
          if (url) {
            flush()
            out.push({ type: 'link', href: url, children: parseInline(label) })
            i = paren + 1
            continue
          }
          // 非法 URL：降级为纯文本（不输出 <a>）
          buf += src.slice(i, paren + 1)
          i = paren + 1
          continue
        }
      }
    }

    buf += ch
    i++
  }
  flush()
  return out
}

/** 块级解析：逐行状态机 */
export function parseMarkdown(content: string): MdBlock[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let i = 0

  const push = (b: MdBlock) => {
    // 连续空行合并
    if (b.type === 'paragraph' && b.inline!.length === 0) return
    blocks.push(b)
  }

  while (i < lines.length) {
    const line = lines[i]

    // 空行 → 段落边界
    if (/^\s*$/.test(line)) { i++; continue }

    // 围栏代码块 ```lang
    if (/^```/.test(line.trim())) {
      const lang = line.trim().slice(3).trim()
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i]); i++
      }
      i++ // 跳过闭合围栏
      push({ type: 'code', lang: lang || undefined, code: buf.join('\n') + (buf.length ? '\n' : '') })
      continue
    }

    // 标题 #~####
    const h = line.match(/^(#{1,4})\s+(.+)$/)
    if (h) {
      push({ type: 'heading', level: h[1].length, inline: parseInline(h[2]) })
      i++
      continue
    }

    // 分割线 ---
    if (/^\s*-{3,}\s*$/.test(line)) {
      push({ type: 'hr' })
      i++
      continue
    }

    // 引用 >（连续行合并）
    if (/^\s*>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s*>/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i++
      }
      push({ type: 'quote', inline: parseInline(buf.join('\n')) })
      continue
    }

    // 无序列表 -/*/+
    const ul = line.match(/^\s*[-*+]\s+(.+)$/)
    if (ul) {
      const items: MdInline[][] = [parseInline(ul[1])]
      i++
      while (i < lines.length) {
        const m = lines[i].match(/^\s*[-*+]\s+(.+)$/)
        if (m) { items.push(parseInline(m[1])); i++ }
        else if (/^\s*$/.test(lines[i])) { i++; break }
        else if (/^\s{2,}/.test(lines[i])) { // 续行
          const last = items[items.length - 1]
          last.push({ type: 'text', text: ' ' + lines[i].trim() })
          i++
        } else break
      }
      push({ type: 'list', ordered: false, items })
      continue
    }

    // 有序列表 1.
    const ol = line.match(/^\s*\d+\.\s+(.+)$/)
    if (ol) {
      const items: MdInline[][] = [parseInline(ol[1])]
      i++
      while (i < lines.length) {
        const m = lines[i].match(/^\s*\d+\.\s+(.+)$/)
        if (m) { items.push(parseInline(m[1])); i++ }
        else if (/^\s*$/.test(lines[i])) { i++; break }
        else break
      }
      push({ type: 'list', ordered: true, items })
      continue
    }

    // 段落：收集直到空行/块级起始
    const buf: string[] = [line]
    i++
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^\s*```/.test(lines[i]) &&
      !/^\s*#/.test(lines[i]) &&
      !/^\s*>/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*-{3,}\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i++
    }
    push({ type: 'paragraph', inline: parseInline(buf.join('\n')) })
  }

  return blocks
}
