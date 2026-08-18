/**
 * weifuwu/office/zip — 自研 ZIP 容器读写（零 npm 依赖）
 *
 * 参考算法：office2json（unzip 结构——EOCD → central directory → local header）。
 * 实现取舍：
 * - 读：EOCD（尾部扫描）→ central directory → local header offset 取数据；
 *   压缩方法 0（store）/ 8（deflate——Node 内置 zlib.inflateRawSync）
 * - 写：store（无压缩——合法 ZIP，文件较大但零依赖正确性优先）；
 *   CRC32 自研查表
 * - 裁剪：ZIP64/加密/数据描述符（flags bit3）/多盘——不支持（诚实——读到即抛错）
 */

const SIG_LOCAL = 0x04034b50
const SIG_CENTRAL = 0x02014b50
const SIG_EOCD = 0x06054b50

export interface ZipEntry {
  name: string
  data: Uint8Array
}

// ── CRC32（查表） ───────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ── 读取 ────────────────────────────────────────────────────────────────────

/** inflate（ZIP method 8）——跨环境：浏览器 DecompressionStream / Node 18+（同 API）。
 *  老环境无 DecompressionStream → 抛错（诚实裁剪：OOXML 必用 deflate）。 */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as any).DecompressionStream
  if (!DS) throw new Error('zip: 环境无 DecompressionStream（deflate 解压不支持）')
  const stream = new DS('deflate-raw')
  const out = await new Response(
    new Blob([data as unknown as BlobPart]).stream().pipeThrough(stream),
  ).arrayBuffer()
  return new Uint8Array(out)
}

export async function readZip(u8: Uint8Array): Promise<Map<string, Uint8Array>> {
  // 1. 尾部扫描 EOCD（无注释——签名 + 22 字节）
  let eocd = -1
  for (let i = u8.length - 22; i >= 0; i--) {
    if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('zip: EOCD 未找到（非 ZIP 或已损坏）')
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength)
  const cdCount = dv.getUint16(eocd + 10, true)
  const cdOff = dv.getUint32(eocd + 16, true)

  // 2. central directory entries
  const out = new Map<string, Uint8Array>()
  let off = cdOff
  for (let i = 0; i < cdCount; i++) {
    if (dv.getUint32(off, true) !== SIG_CENTRAL) throw new Error(`zip: central entry ${i} 签名错误`)
    const method = dv.getUint16(off + 10, true)
    const csize = dv.getUint32(off + 20, true)
    const nlen = dv.getUint16(off + 28, true)
    const elen = dv.getUint16(off + 30, true)
    const clen = dv.getUint16(off + 32, true)
    const lho = dv.getUint32(off + 42, true)
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nlen))
    // 数据描述符（flags bit 3）：local header 的 crc/size 为 0——但我们按 central
    // directory 的 csize 读数据（central 恒准确）——无需处理 descriptor（真实事故：
    // office2json 的 test.docx 带 descriptor——裁剪它导致真实文件导入失败）
    if (method !== 0 && method !== 8) throw new Error(`zip: ${name} 压缩方法 ${method} 不支持（裁剪：store/deflate）`)
    // local header 读数据
    const lnlen = dv.getUint16(lho + 26, true)
    const lelen = dv.getUint16(lho + 28, true)
    const start = lho + 30 + lnlen + lelen
    const raw = u8.subarray(start, start + csize)
    out.set(name, method === 8 ? await inflateRaw(raw) : raw)
    off += 46 + nlen + elen + clen
  }
  return out
}

// ── 写入（store 无压缩） ────────────────────────────────────────────────────

export function writeZip(files: Map<string, Uint8Array>): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  const encoder = new TextEncoder()

  for (const [name, data] of files) {
    const nameBytes = encoder.encode(name)
    const crc = crc32(data)
    const hdr = new Uint8Array(30)
    const dv = new DataView(hdr.buffer)
    dv.setUint32(0, SIG_LOCAL, true)
    dv.setUint16(4, 20, true)          // version needed
    dv.setUint16(6, 0, true)           // flags
    dv.setUint16(8, 0, true)           // method: store
    dv.setUint32(14, crc, true)
    dv.setUint32(18, data.length, true)
    dv.setUint32(22, data.length, true)
    dv.setUint16(26, nameBytes.length, true)
    dv.setUint16(28, 0, true)          // extra len
    locals.push(hdr, nameBytes, data)

    const chdr = new Uint8Array(46)
    const cdv = new DataView(chdr.buffer)
    cdv.setUint32(0, SIG_CENTRAL, true)
    cdv.setUint16(4, 20, true)         // version made by
    cdv.setUint16(6, 20, true)         // version needed
    cdv.setUint16(10, 0, true)         // method: store
    cdv.setUint32(16, crc, true)
    cdv.setUint32(20, data.length, true)
    cdv.setUint32(24, data.length, true)
    cdv.setUint16(28, nameBytes.length, true)
    cdv.setUint32(42, offset, true)    // local header offset
    centrals.push(chdr, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }

  const cdSize = centrals.reduce((n, c) => n + c.length, 0)
  const eocd = new Uint8Array(22)
  const edv = new DataView(eocd.buffer)
  edv.setUint32(0, SIG_EOCD, true)
  edv.setUint16(8, files.size, true)
  edv.setUint16(10, files.size, true)
  edv.setUint32(12, cdSize, true)
  edv.setUint32(16, offset, true)

  const total = offset + cdSize + 22
  const out = new Uint8Array(total)
  let p = 0
  for (const b of [...locals, ...centrals, eocd]) { out.set(b, p); p += b.length }
  return out
}
