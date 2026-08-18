/**
 * weifuwu QR 编码器（零依赖自研）
 *
 * 支持：版本 1-6（17-41 模块）、纠错 L/M/Q/H、字节模式、8 掩码惩罚分自动选择。
 * 裁剪：版本 7+（需版本信息模块）、数字/字母模式、Kanji、多字节 UTF-8 之外编码。
 */

// ── GF(256) 对数/反对数表（本原多项式 0x11D）──
const EXP = new Array(256)
const LOG = new Array(256)
let _x = 1
for (let i = 0; i < 255; i++) {
  EXP[i] = _x
  LOG[_x] = i
  _x <<= 1
  if (_x & 0x100) _x ^= 0x11d
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[(LOG[a] + LOG[b]) % 255]
}

// ── 版本表（总码字, [L,M,Q,H] 每块纠错码字数）──
// v: total, ecPerBlock per level, blocks per level
const VERSION_TABLE: Array<{ total: number; ec: [number, number, number, number]; blocks: [number, number, number, number] }> = [
  { total: 26, ec: [7, 10, 13, 17], blocks: [1, 1, 1, 1] },   // v1
  { total: 44, ec: [10, 16, 22, 28], blocks: [1, 1, 1, 1] },  // v2
  { total: 70, ec: [15, 26, 18, 22], blocks: [1, 1, 2, 2] },  // v3
  { total: 100, ec: [20, 18, 26, 16], blocks: [1, 2, 2, 4] }, // v4
  { total: 134, ec: [26, 24, 18, 22], blocks: [1, 2, 4, 4] }, // v5
  { total: 172, ec: [18, 16, 24, 28], blocks: [2, 4, 4, 4] }, // v6
]

const EC_LEVELS: Record<string, number> = { L: 0, M: 1, Q: 2, H: 3 }

export type QrEcLevel = 'L' | 'M' | 'Q' | 'H'

function versionFor(dataLen: number, level: number): number {
  for (let v = 0; v < VERSION_TABLE.length; v++) {
    const t = VERSION_TABLE[v]
    const dataCodewords = t.total - t.ec[level] * t.blocks[level]
    if (dataLen <= dataCodewords) return v + 1
  }
  throw new Error('数据超出 QR 容量（版本 1-6）')
}

// ── Reed-Solomon 纠错码 ──
function gfPow2(k: number): number {
  return EXP[k % 255]
}

function rsEncode(data: number[], ecCount: number): number[] {
  // 标准：生成多项式连乘 (x - α^i)
  let gen: number[] = [1]
  for (let i = 0; i < ecCount; i++) {
    const next = new Array(gen.length + 1).fill(0)
    for (let j = 0; j < gen.length; j++) {
      next[j] ^= gfMul(gen[j], gfPow2(i))
      next[j + 1] ^= gen[j]
    }
    gen = next
  }
  const poly = [...data, ...new Array(ecCount).fill(0)]
  for (let i = 0; i < data.length; i++) {
    const coef = poly[i]
    if (coef === 0) continue
    for (let j = 1; j < gen.length; j++) {
      poly[i + j] ^= gfMul(gen[j], coef)
    }
  }
  return poly.slice(data.length)
}

// ── 数据编码（字节模式）──
function encodeData(bytes: Uint8Array, dataCapacity: number): number[] {
  const bits: number[] = []
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  pushBits(0b0100, 4)          // 字节模式
  pushBits(bytes.length, 8)    // 计数（v1-9 用 8 位）
  for (const b of bytes) pushBits(b, 8)
  pushBits(0, Math.min(4, dataCapacity * 8 - bits.length)) // 终止符
  while (bits.length % 8 !== 0) bits.push(0)
  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]
    codewords.push(v)
  }
  // 填充到容量
  const pads = [0b11101100, 0b00010001]
  let pi = 0
  while (codewords.length < dataCapacity) {
    codewords.push(pads[pi++ % 2])
  }
  return codewords
}

// ── 矩阵构建 ──
const ALIGNMENT: Record<number, number[]> = {
  1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
}

function buildMatrix(version: number, dataCodewords: number[], ecCodewords: number[], mask: number): boolean[][] {
  const n = 17 + 4 * version
  const matrix: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false))

  const set = (r: number, c: number, v: boolean) => { if (r >= 0 && r < n && c >= 0 && c < n) matrix[r][c] = v }

  // 功能模块
  const drawFinder = (row: number, col: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c
        if (rr < 0 || rr >= n || cc < 0 || cc >= n) continue
        const inOuter = r >= 0 && r <= 6 && c >= 0 && c <= 6
        if (!inOuter) continue
        // 外圈黑 + 中心 3x3 黑（2-4）；中间环（1-5）白
        const black = (r === 0 || r === 6 || c === 0 || c === 6) || (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        set(rr, cc, black)
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, n - 7)
  drawFinder(n - 7, 0)

  // timing
  for (let i = 8; i < n - 8; i++) {
    set(6, i, i % 2 === 0)
    set(i, 6, i % 2 === 0)
  }

  // alignment
  const aligns = ALIGNMENT[version]
  if (aligns.length > 1) {
    for (let a = 0; a < aligns.length; a++) {
      for (let b = 0; b < aligns.length; b++) {
        const r = aligns[a], c = aligns[b]
        if ((r === 6 && c === 6) || (r === 6 && c === n - 7) || (r === n - 7 && c === 6)) continue // 与 finder 重叠
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1)
          }
        }
      }
    }
  }

  // dark module
  set(n - 8, 8, true)

  // 数据位放置（zigzag）
  const bits: boolean[] = []
  for (const cw of dataCodewords) for (let i = 7; i >= 0; i--) bits.push(((cw >> i) & 1) === 1)
  for (const cw of ecCodewords) for (let i = 7; i >= 0; i--) bits.push(((cw >> i) & 1) === 1)

  const isFunction = (r: number, c: number): boolean => {
    if (r === 6 || c === 6) return true
    // finder + 分隔区
    for (const [fr, fc] of [[0, 0], [0, n - 7], [n - 7, 0]] as const) {
      if (r >= fr - 1 && r <= fr + 7 && c >= fc - 1 && c <= fc + 7) return true
    }
    // alignment
    const aligns = ALIGNMENT[version]
    if (aligns.length > 1) {
      for (const ar of aligns) {
        for (const ac of aligns) {
          if (Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2) return true
        }
      }
    }
    return false
  }

  let bitIdx = 0
  let upward = true
  for (let col = n - 1; col > 0; col -= 2) {
    if (col === 6) col-- // 跳过 timing 列
    for (let i = 0; i < n; i++) {
      const row = upward ? n - 1 - i : i
      for (let j = 0; j < 2; j++) {
        const c = col - j
        if (isFunction(row, c)) continue
        if (bitIdx < bits.length) {
          let bit = bits[bitIdx++]
          // 掩码
          const maskVal = maskFn(mask, row, c)
          set(row, c, bit !== maskVal)
        }
      }
    }
    upward = !upward
  }

  return matrix
}

function maskFn(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0: return (r + c) % 2 === 0
    case 1: return r % 2 === 0
    case 2: return c % 3 === 0
    case 3: return (r + c) % 3 === 0
    case 4: return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0
    case 5: return ((r * c) % 2) + ((r * c) % 3) === 0
    case 6: return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0
    case 7: return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
    default: return false
  }
}

// ── 格式信息（BCH(15,5) + XOR 0x5412）──
function formatBits(level: number, mask: number): number {
  const ecBits = [1, 0, 3, 2][level] // L=01 M=00 Q=11 H=10
  let data = (ecBits << 3) | mask
  let d = data << 10
  const gen = 0b10100110111 // 0x537
  while (Math.clz32(d) > Math.clz32(gen)) {
    const shift = Math.clz32(d) - Math.clz32(gen)
    d ^= gen << shift
  }
  // 或循环
  d = data << 10
  for (let i = 14; i >= 10; i--) {
    if ((d >> i) & 1) d ^= gen << (i - 10)
  }
  return ((data << 10) | d) ^ 0x5412
}

function placeFormat(matrix: boolean[][], level: number, mask: number): void {
  const n = matrix.length
  const bits = formatBits(level, mask)
  const bit = (i: number) => ((bits >> (14 - i)) & 1) === 1
  // 位置 1（左上）
  const positions1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ]
  positions1.forEach(([r, c], i) => { matrix[r][c] = bit(i) })
  // 位置 2（右上 + 左下副本）
  const positions2: [number, number][] = [
    [8, n - 8], [8, n - 7], [7, n - 8], [5, n - 8], [4, n - 8], [3, n - 8], [2, n - 8], [1, n - 8], [0, n - 8],
    [n - 1, 8], [n - 2, 8], [n - 3, 8], [n - 4, 8], [n - 5, 8], [n - 6, 8], [n - 7, 8],
  ]
  positions2.forEach(([r, c], i) => { matrix[r][c] = bit(i) })
}

// ── 惩罚分（4 规则）──
function penalty(matrix: boolean[][]): number {
  const n = matrix.length
  let score = 0
  const runPenalty = (arr: boolean[]) => {
    let run = 1
    for (let i = 1; i <= arr.length; i++) {
      if (i < arr.length && arr[i] === arr[i - 1]) { run++; continue }
      if (run >= 5) score += 3 + (run - 5)
      run = 1
    }
  }
  for (let r = 0; r < n; r++) runPenalty(matrix[r])
  for (let c = 0; c < n; c++) runPenalty(matrix.map(row => row[c]))
  // 2x2 块
  for (let r = 0; r < n - 1; r++) {
    for (let c = 0; c < n - 1; c++) {
      if (matrix[r][c] === matrix[r][c + 1] && matrix[r][c] === matrix[r + 1][c] && matrix[r][c] === matrix[r + 1][c + 1]) score += 3
    }
  }
  // 黑/白比例
  const dark = matrix.flat().filter(Boolean).length
  const ratio = (dark * 100) / (n * n)
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10
  return score
}

// ── 入口 ──
export interface QrMatrix {
  size: number
  version: number
  level: QrEcLevel
  mask: number
  matrix: boolean[][]
}

export function generateQr(text: string, level: QrEcLevel = 'M'): QrMatrix {
  const bytes = new TextEncoder().encode(text)
  const lvl = EC_LEVELS[level]
  const version = versionFor(bytes.length, lvl)
  const t = VERSION_TABLE[version - 1]
  const ecCount = t.ec[lvl]
  const blockCount = t.blocks[lvl]
  const dataCapacity = t.total - ecCount * blockCount

  const data = encodeData(bytes, dataCapacity)

  // 分块 + RS
  const blockDataLen = Math.floor(data.length / blockCount)
  const blocks: number[][] = []
  const ecBlocks: number[][] = []
  for (let b = 0; b < blockCount; b++) {
    const slice = data.slice(b * blockDataLen, (b + 1) * blockDataLen)
    blocks.push(slice)
    ecBlocks.push(rsEncode(slice, ecCount))
  }

  // 交织
  const interleaved: number[] = []
  for (let i = 0; i < blockDataLen; i++) for (const b of blocks) interleaved.push(b[i])
  for (let i = 0; i < ecCount; i++) for (const b of ecBlocks) interleaved.push(b[i])

  const dataCw = interleaved.slice(0, dataCapacity)
  const ecCw = interleaved.slice(dataCapacity)

  // 掩码选择
  let bestMask = 0
  let bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    const mtx = buildMatrix(version, dataCw, ecCw, m)
    placeFormat(mtx, lvl, m)
    const s = penalty(mtx)
    if (s < bestScore) { bestScore = s; bestMask = m }
  }

  const final = buildMatrix(version, dataCw, ecCw, bestMask)
  placeFormat(final, lvl, bestMask)

  return { size: 17 + 4 * version, version, level, mask: bestMask, matrix: final }
}
