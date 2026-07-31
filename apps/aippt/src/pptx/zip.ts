/**
 * pptx-vdom zip.ts — 轻量 ZIP writer（零依赖）
 *
 * 支持 STORE(0) / DEFLATE(8)，确定性输出：
 * - 固定 DOS 时间戳（2024-01-01 00:00:00）→ 同一输入永远同一字节
 * - 文件名按给定顺序写入 → 黄金文件字节级比对成立
 *
 * 结构：Local File Header × N + Central Directory + End of Central Directory
 */

import { deflateRawSync } from 'node:zlib'

// ── CRC32（标准查表法）─────────────────────────────
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

// ── 固定 DOS 时间戳（确定性）───────────────────────
// 2024-01-01 00:00:00
const DOS_TIME = 0x0000
const DOS_DATE = ((2024 - 1980) << 9) | (1 << 5) | 1 // 22561

export interface ZipEntry {
  /** 存储路径，如 'ppt/slides/slide1.xml' */
  name: string
  data: Uint8Array
  /** 默认 deflate；小文件可用 store 减少开销 */
  method?: 0 | 8
}

/**
 * 将 entries 打包为 ZIP Buffer。
 * entries 的顺序即文件在包内的顺序（也即黄金测试的比对顺序）。
 */
export function zipEntries(entries: ZipEntry[]): Buffer {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8')
    const raw = Buffer.from(entry.data)
    const method: 0 | 8 = entry.method ?? 8
    const data =
      method === 8
        ? deflateRawSync(raw, { level: 6 })
        : raw
    const crc = crc32(raw)

    // ── Local File Header ──
    const lfh = Buffer.alloc(30)
    lfh.writeUInt32LE(0x04034b50, 0) // signature
    lfh.writeUInt16LE(20, 4) // version needed
    lfh.writeUInt16LE(0x0800, 6) // flags: UTF-8 names
    lfh.writeUInt16LE(method, 8)
    lfh.writeUInt16LE(DOS_TIME, 10)
    lfh.writeUInt16LE(DOS_DATE, 12)
    lfh.writeUInt32LE(crc, 14)
    lfh.writeUInt32LE(data.length, 18)
    lfh.writeUInt32LE(raw.length, 22)
    lfh.writeUInt16LE(nameBuf.length, 26)
    lfh.writeUInt16LE(0, 28) // extra len
    parts.push(lfh, nameBuf, data)

    // ── Central Directory 记录 ──
    const cd = Buffer.alloc(46)
    cd.writeUInt32LE(0x02014b50, 0) // signature
    cd.writeUInt16LE(20, 4) // version made by
    cd.writeUInt16LE(20, 6) // version needed
    cd.writeUInt16LE(0x0800, 8) // flags
    cd.writeUInt16LE(method, 10)
    cd.writeUInt16LE(DOS_TIME, 12)
    cd.writeUInt16LE(DOS_DATE, 14)
    cd.writeUInt32LE(crc, 16)
    cd.writeUInt32LE(data.length, 20)
    cd.writeUInt32LE(raw.length, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30) // extra
    cd.writeUInt16LE(0, 32) // comment
    cd.writeUInt16LE(0, 34) // disk
    cd.writeUInt16LE(0, 36) // internal attrs
    cd.writeUInt32LE(0, 38) // external attrs
    cd.writeUInt32LE(offset, 42) // local header offset
    central.push(cd, nameBuf)

    offset += lfh.length + nameBuf.length + data.length
  }

  // ── End of Central Directory ──
  const centralSize = central.reduce((n, b) => n + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk
  eocd.writeUInt16LE(0, 6) // cd start disk
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20) // comment len

  return Buffer.concat([...parts, ...central, eocd])
}
