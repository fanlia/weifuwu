#!/usr/bin/env node
/**
 * dev-links — 本地开发包映射（apps 运行时解析 weifuwu/* → src）
 *
 * apps 的 import 'weifuwu/ui-dom' / 'weifuwu/ui-dom/vdom3' / 'weifuwu/components'
 * 在 dev 模式经 node_modules 软链解析到源码（esbuild bundle 的模块解析——
 * tsconfig paths 只用于类型检查）。新环境需执行本脚本（npm install 后）：
 *   node scripts/dev-links.mjs
 *
 * 结构：
 *   node_modules/weifuwu/ui-dom        → ../../src/ui-dom        （主入口）
 *   node_modules/weifuwu/ui-dom/vdom3  → ../../src/ui-dom/vdom3  （子路径——自动）
 *   node_modules/weifuwu/components    → ../../src/components
 *   node_modules/weifuwu/layout        → ../../src/layout
 */
import { mkdirSync, symlinkSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const links = [
  ['ui-dom', '../../src/ui-dom'],
  ['components', '../../src/components'],
  ['layout', '../../src/layout'],
]

mkdirSync(join(root, 'node_modules/weifuwu'), { recursive: true })
for (const [name, target] of links) {
  const p = join(root, 'node_modules/weifuwu', name)
  if (existsSync(p)) rmSync(p, { recursive: true, force: true })
  symlinkSync(target, p, 'dir')
  console.log(`  node_modules/weifuwu/${name} → ${target}`)
}
console.log('✓ dev links ready')
