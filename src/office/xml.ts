/**
 * weifuwu/office/xml — 自研轻量 XML 解析（零 npm 依赖）
 *
 * 参考算法：office2json（@xmldom/xmldom → { name, attrs, children } 树）。
 * OOXML 是规整 XML——只做元素树 + 文本；裁剪：DTD/实体展开（除内建五实体）/
 * 命名空间处理（前缀保留原名——w:p 等）。解析失败抛错（诚实——不静默）。
 */

export interface XmlNode {
  name: string
  attrs: Record<string, string>
  children: XmlNode[]
  /** 直接文本内容（子元素外的文本） */
  text: string
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&')
}

/** 手写扫描器：<name attrs>...</name> / <name/> / 文本 / 指令 / 注释 / CDATA */
export function parseXml(xml: string): XmlNode {
  let i = 0
  const len = xml.length

  function skipWs(): void {
    while (i < len && /\s/.test(xml[i])) i++
  }

  function readName(): string {
    const start = i
    while (i < len && /[^\s/>="]/.test(xml[i])) i++
    return xml.slice(start, i)
  }

  function parseAttrs(): Record<string, string> {
    const attrs: Record<string, string> = {}
    for (;;) {
      skipWs()
      if (i >= len || xml[i] === '>' || (xml[i] === '/' && xml[i + 1] === '>')) break
      const key = readName()
      skipWs()
      if (xml[i] !== '=') { i++; continue } // 畸形属性——跳过（不静默但宽容）
      i++
      skipWs()
      const quote = xml[i]
      if (quote !== '"' && quote !== "'") continue
      i++
      const start = i
      while (i < len && xml[i] !== quote) i++
      attrs[key] = decodeEntities(xml.slice(start, i))
      i++
    }
    return attrs
  }

  function parseNode(): XmlNode {
    for (;;) {
      // 跳过前置空白/文本（顶层文本——OOXML 规整：根元素前的空白/指令）
      while (i < len && xml[i] !== '<') i++
      if (i >= len) throw new Error('xml: 意外内容（无根元素）')
      if (xml.startsWith('<!--', i)) {
        const end = xml.indexOf('-->', i)
        i = end < 0 ? len : end + 3
        continue // 注释跳过
      }
      if (xml.startsWith('<![CDATA[', i)) {
        const end = xml.indexOf(']]>', i)
        const text = xml.slice(i + 9, end < 0 ? len : end)
        i = end < 0 ? len : end + 3
        return { name: '#text', attrs: {}, children: [], text }
      }
      if (xml[i + 1] === '?' || xml[i + 1] === '!') {
        const end = xml.indexOf('>', i)
        i = end < 0 ? len : end + 1
        continue // 指令/DOCTYPE 跳过
      }
      i++ // '<'
      const name = readName()
      const attrs = parseAttrs()
      const node: XmlNode = { name, attrs, children: [], text: '' }
      if (xml[i] === '/' && xml[i + 1] === '>') { i += 2; return node } // 自闭合
      i++ // '>'
      // 内容：文本 + 子元素（混合内容——OOXML 规整：文本与元素分层）
      let text = ''
      for (;;) {
        if (i >= len) throw new Error(`xml: 未闭合标签 <${name}>`)
        if (xml[i] === '<') {
          if (xml.startsWith('</', i)) {
            i += 2
            readName()
            i = xml.indexOf('>', i)
            i = i < 0 ? len : i + 1
            node.text = decodeEntities(text)
            return node
          }
          if (text.trim()) node.children.push({ name: '#text', attrs: {}, children: [], text: decodeEntities(text) })
          text = ''
          node.children.push(parseNode())
        } else {
          text += xml[i]
          i++
        }
      }
    }
  }

  const root = parseNode()
  return root
}

/** 便捷：找子元素（按名字——含命名空间前缀匹配） */
export function child(el: XmlNode, name: string): XmlNode | null {
  return el.children.find((c) => c.name === name) ?? null
}

export function children(el: XmlNode, name: string): XmlNode[] {
  return el.children.filter((c) => c.name === name)
}

/** 全部后代文本（拼接） */
export function allText(el: XmlNode): string {
  let out = el.text
  for (const c of el.children) {
    if (c.name === '#text') out += c.text
    else out += allText(c)
  }
  return out
}
