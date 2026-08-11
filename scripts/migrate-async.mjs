#!/usr/bin/env node
/**
 * S3 保守迁移：测试文件 await 化（安全模式——官方 API + it/test 转 async）
 * 用法: node scripts/migrate-async.mjs <dir1> <dir2> ...
 * 只处理：it/test 回调转 async；renderVNode(/mountComponent( 调用点 await。
 * 特殊形态（直接工厂调用/辅助函数）跑测试后人工修。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
if (args.length === 0) { console.error('usage: node scripts/migrate-async.mjs <dir1> <dir2> ...'); process.exit(1) }

let changed = 0
for (const dir of args) {
  const test = join('src/components', dir, dir + '.test.ts')
  if (!existsSync(test)) continue
  let src = readFileSync(test, 'utf8')
  const orig = src
  src = src.replace(/\bit\('([^']*)', \(\) => \{/g, "it('$1', async () => {")
  src = src.replace(/\bit\("([^"]*)", \(\) => \{/g, 'it("$1", async () => {')
  src = src.replace(/\btest\('([^']*)', \(\) => \{/g, "test('$1', async () => {")
  src = src.replace(/\btest\("([^"]*)", \(\) => \{/g, 'test("$1", async () => {')
  src = src.replace(/(?<![\w.])(?<!await )(renderVNode|mountComponent)\(/g, 'await $1(')
  if (src !== orig) { writeFileSync(test, src); changed++ }
}
console.log(`migrated ${changed} test files`)
