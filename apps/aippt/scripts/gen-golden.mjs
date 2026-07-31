/**
 * 重建黄金文件（版式有意变更后运行）
 * 用法: node scripts/gen-golden.mjs
 * 生成后需人工 LibreOffice 打开验证一次，再提交。
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deckToPptx } from '../src/pptx/components/layouts.ts'
import { goldenDeck, GOLDEN_THEMES } from '../src/pptx/test/golden-fixture.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const GOLDEN_DIR = resolve(__dirname, '../src/pptx/test/golden')
mkdirSync(GOLDEN_DIR, { recursive: true })

for (const theme of GOLDEN_THEMES) {
  const buf = deckToPptx(goldenDeck(theme))
  const path = resolve(GOLDEN_DIR, `${theme}.pptx`)
  writeFileSync(path, buf)
  console.log(`✓ ${theme}.pptx (${(buf.length / 1024).toFixed(1)} KB)`)
}
console.log(`黄金文件已生成到 ${GOLDEN_DIR}`)
