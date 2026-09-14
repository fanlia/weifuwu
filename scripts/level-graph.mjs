#!/usr/bin/env node
/**
 * weifuwu/core import-graph 断言（W1——core-分层与冻结计划）
 *
 * 目的：防"传递依赖偷渡"——core 的直接 import 干净，不代表其闭包干净
 * （index/再导出链可把 esbuild/graphql/ws 拖进来）。用 esbuild metafile
 * 对全部 core 文件做一次全量打包，收集 node_modules 输入 = core 真实依赖面。
 *
 * 用法：
 *   node scripts/level-graph.mjs          # 报告分层依赖面
 *   node scripts/level-graph.mjs --check  # 新增依赖（不在基线）= exit 1
 *
 * 基线登记：scripts/level-map-baseline.json → graphThirdParty
 * （W2 目标：0——ws/graphql 全部出核或端口化）
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '')
const { build } = await import('esbuild')

const levels = JSON.parse(readFileSync(join(ROOT, 'src/levels.json'), 'utf8'))
const coreFiles = Object.entries(levels.files)
  .filter(([, v]) => v.level !== 'equipment')
  .map(([k]) => join(ROOT, k))

// 虚拟入口：import 全部 core 文件（副作用导入——不关心导出）
const dir = mkdtempSync(join(tmpdir(), 'level-graph-'))
const entry = join(dir, 'entry.ts')
writeFileSync(entry, coreFiles.map((f) => `import ${JSON.stringify(f)}`).join('\n') + '\n')

let result
try {
  result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
    absWorkingDir: ROOT,
  })
} catch (e) {
  console.error('✖ level-graph 打包失败（存在不可解析依赖）：')
  console.error(e.message?.split('\n').slice(0, 12).join('\n') ?? e)
  process.exit(1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

const pkgs = new Set()
for (const input of Object.keys(result.metafile.inputs)) {
  const m = input.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)/)
  if (m) pkgs.add(m[1])
}
const graphThirdParty = [...pkgs].sort()

const BASELINE = join(ROOT, 'scripts/level-map-baseline.json')
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'))
const CHECK = process.argv.includes('--check')
const old = new Set(baseline.graphThirdParty ?? [])
const added = graphThirdParty.filter((p) => !old.has(p))
const removed = [...old].filter((p) => !pkgs.has(p))

console.log(`[level-graph] 闭包三方依赖：${graphThirdParty.length ? graphThirdParty.join(', ') : '（无）'}`)
if (removed.length) console.log(`  已移除（基线收缩——请更新基线）：${removed.join(', ')}`)

if (CHECK) {
  if (added.length) {
    console.error(`✖ level-graph 校验失败：新增三方依赖 ${added.join(', ')}（L0–L4 禁三方——目标 0）`)
    process.exit(1)
  }
  console.log('✔ level-graph 校验通过（无新增依赖）')
} else {
  baseline.graphThirdParty = graphThirdParty
  writeFileSync(BASELINE, JSON.stringify(baseline, null, 2) + '\n')
  console.log(`写入基线 graphThirdParty（${graphThirdParty.length}）`)
}
