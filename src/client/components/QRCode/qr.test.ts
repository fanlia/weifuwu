import { describe, it } from 'node:test'
import assert from 'node:assert'
import { generateQr } from './qr.ts'

describe('QR 编码器（自研零依赖）', () => {
  it('矩阵尺寸 = 17 + 4v（v1 → 21）', () => {
    const qr = generateQr('hi')
    assert.equal(qr.size, 21)
    assert.equal(qr.version, 1)
    assert.equal(qr.matrix.length, 21)
    assert.equal(qr.matrix[0].length, 21)
  })

  it('版本随数据量增长', () => {
    const small = generateQr('a')
    const big = generateQr('x'.repeat(100))
    assert.equal(small.version, 1)
    assert.ok(big.version > small.version, `大数据应用更高版本: ${big.version}`)
  })

  it('超过容量抛错', () => {
    assert.throws(() => generateQr('x'.repeat(200)))
  })

  it('三个 finder pattern 存在（7x7 边框）', () => {
    const qr = generateQr('hi')
    const m = qr.matrix
    // 左上 finder：外圈黑、内圈白、中心黑
    const isFinderAt = (r: number, c: number) => {
      // 外圈角黑 + 内环白(1,1) + 中心 3x3 黑(2,2)
      return m[r][c] && !m[r + 1][c + 1] && m[r + 2][c + 2]
    }
    assert.ok(isFinderAt(0, 0), '左上 finder')
    assert.ok(isFinderAt(0, qr.size - 7), '右上 finder')
    assert.ok(isFinderAt(qr.size - 7, 0), '左下 finder')
  })

  it('timing pattern 在行列 6', () => {
    const qr = generateQr('hi')
    const m = qr.matrix
    // row 6 交替（8..12 区域）
    assert.notEqual(m[6][8], m[6][9])
    assert.notEqual(m[8][6], m[9][6])
  })

  it('dark module 在 (n-8, 8)', () => {
    const qr = generateQr('hi')
    assert.equal(qr.matrix[qr.size - 8][8], true)
  })

  it('不同纠错级别产生不同矩阵', () => {
    const l = generateQr('hello', 'L')
    const h = generateQr('hello', 'H')
    assert.notDeepEqual(l.matrix, h.matrix)
  })

  it('同一输入确定性输出', () => {
    const a = generateQr('weifuwu')
    const b = generateQr('weifuwu')
    assert.deepEqual(a.matrix, b.matrix)
  })

  it('不同输入产生不同矩阵', () => {
    const a = generateQr('alpha')
    const b = generateQr('beta')
    assert.notDeepEqual(a.matrix, b.matrix)
  })

  it('矩阵有合理密度（非全空）', () => {
    const qr = generateQr('weifuwu components')
    const dark = qr.matrix.flat().filter(Boolean).length
    const total = qr.size * qr.size
    const ratio = dark / total
    assert.ok(ratio > 0.2 && ratio < 0.9, `密度 ${ratio.toFixed(2)}`)
  })

  it('UTF-8 中文支持', () => {
    const qr = generateQr('你好，世界')
    assert.ok(qr.matrix.some(row => row.some(Boolean)))
    assert.ok(qr.version >= 1)
  })
})
