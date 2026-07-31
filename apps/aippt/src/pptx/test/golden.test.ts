/**
 * 黄金文件回归测试 — 版式输出字节级比对
 *
 * 版式/组件有意变更后，运行 `node scripts/gen-golden.mjs` 重建基线
 * （需人工 LibreOffice 验证），否则本测试会失败并提示。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deckToPptx } from '../components/layouts.ts'
import { goldenDeck, GOLDEN_THEMES } from './golden-fixture.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const goldenPath = (theme: string) => resolve(__dirname, 'golden', `${theme}.pptx`)

for (const theme of GOLDEN_THEMES) {
  test(`黄金文件: ${theme} 字节级一致`, () => {
    const buf = deckToPptx(goldenDeck(theme))
    const golden = readFileSync(goldenPath(theme))
    assert.deepEqual(
      buf,
      golden,
      `${theme} 输出与黄金基线不一致 — 版式改动需重建基线: node scripts/gen-golden.mjs + LibreOffice 验证`,
    )
  })
}
