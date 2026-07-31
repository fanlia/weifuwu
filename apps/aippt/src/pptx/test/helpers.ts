/**
 * 测试辅助 — 最小 ZIP 解包器（只用于测试回读验证）
 * 读取 EOCD → Central Directory → 解压每个 entry
 */

import { inflateRawSync } from 'node:zlib'

export interface UnzippedEntry {
  name: string
  data: Buffer
}

/**
 * 断言 XML 语法合法：所有开始标签的属性必须是 name="value" 形式，
 * 不允许裸属性（如 <a:bodyPr ctr>）。
 */
export function assertWellFormedXml(xml: string, label: string): void {
  // 匹配每个开始/自闭合标签的属性部分
  const tagRe = /<([a-zA-Z][\w:.-]*)((?:\s+[^<>]*?)?)(\/?)>/g
  let m: RegExpExecArray | null
  // 合法属性对：name="value" 或 name='value'
  const pairRe = /[a-zA-Z][\w:.-]*\s*=\s*("[^"]*"|'[^']*')/g
  while ((m = tagRe.exec(xml)) !== null) {
    const attrsPart = m[2]
    if (!attrsPart.trim()) continue
    // 剥离所有合法属性对，若仍有残留 = 裸属性/非法 token
    const leftover = attrsPart.replace(pairRe, '').trim()
    if (leftover !== '') {
      throw new Error(`XML 语法错误（${label}）: 裸属性或非法属性 token <${m[1]} ... ${leftover}>`)
    }
  }
}

export function unzip(buf: Buffer): Map<string, Buffer> {
  // ── EOCD ──
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (eocd < 0) throw new Error('unzip: EOCD 未找到')
  const cdOffset = buf.readUInt32LE(eocd + 16)
  const cdCount = buf.readUInt16LE(eocd + 10)

  const map = new Map<string, Buffer>()
  let pos = cdOffset
  for (let i = 0; i < cdCount; i++) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) throw new Error(`unzip: 中央目录签名错误 @${pos}`)
    const method = buf.readUInt16LE(pos + 10)
    const compSize = buf.readUInt32LE(pos + 20)
    const uncompSize = buf.readUInt32LE(pos + 24)
    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const localOffset = buf.readUInt32LE(pos + 42)
    const name = buf.toString('utf-8', pos + 46, pos + 46 + nameLen)

    // 定位 local header 后的数据
    const lNameLen = buf.readUInt16LE(localOffset + 26)
    const lExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + lNameLen + lExtraLen
    const raw = buf.subarray(dataStart, dataStart + compSize)
    const data = method === 0 ? Buffer.from(raw) : inflateRawSync(raw)
    if (data.length !== uncompSize) {
      throw new Error(`unzip: ${name} 解压尺寸不符 (${data.length} != ${uncompSize})`)
    }
    map.set(name, data)
    pos += 46 + nameLen + extraLen + commentLen
  }
  return map
}
