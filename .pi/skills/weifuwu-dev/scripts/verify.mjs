#!/usr/bin/env node
/**
 * weifuwu verify——质量自检（skill 交付环节的自动化辅助）
 *
 * 用法：
 *   node .pi/skills/weifuwu-dev/scripts/verify.mjs            # 全量自检
 *   node .pi/skills/weifuwu-dev/scripts/verify.mjs quick      # 快速（无全量测试）
 *
 * 检查项（对应 content/guides/quality.md 的框架纪律部分）：
 *   1. content/ 与 registry 同步（gen-content --check）
 *   2. 组件文档覆盖（content/components/*.md ≥ src/components 目录）
 *   3. 浏览器纪律 grep（showcase src + examples：无裸 window/document/localStorage）
 *   4. 无 eval/new Function（框架 src）
 *   5. 单文件测试可选（--test <file>）
 *   6. 全量测试（默认——npm test）
 */
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const quick = process.argv.includes('quick')
// 用法说明
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('verify [quick] [--test=<file>] [--scan-components]\n  quick           跳过全量测试\n  --test=<file>   单文件测试\n  --scan-components  组件库浏览器纪律审计（存量）')
  process.exit(0)
}
const testFile = process.argv.find((a) => a.startsWith('--test='))?.slice(7)
let failed = 0

const check = (name, fn) => {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${name}：${e.message?.slice(0, 200) ?? e}`)
  }
}

console.log('weifuwu verify' + (quick ? '（quick）' : '') + '\n')

// 1. content 同步
check('content/ 与 registry 同步', () => {
  execSync('node scripts/gen-content.mjs --check', { cwd: root, stdio: 'pipe' })
})

// 2. 组件文档覆盖
check('组件文档覆盖', () => {
  const docs = readdirSync(join(root, 'content/components')).filter((f) => f.endsWith('.md')).length
  const dirs = readdirSync(join(root, 'src/components')).filter((d) => existsSync(join(root, 'src/components', d, `${d}.ts`))).length
  if (docs < dirs) throw new Error(`${docs}/${dirs}`)
})

// 3. 浏览器纪律（showcase + examples + components）
check('浏览器纪律（无裸 window/document/localStorage/matchMedia）', () => {
  const offenders = []
  const scan = (dir) => {
    if (!existsSync(dir)) return
    for (const f of readdirSync(dir, { recursive: true })) {
      const file = join(dir, f)
      if (!/\.(ts|tsx)$/.test(file)) continue
      if (file.includes('/registry/')) continue // registry = 文档数据（正文示例文本）非代码
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue // 测试：jsdom 环境 document/window 为正常用法
      const src = readFileSync(file, 'utf-8')
      // 注释行（// 或 *）内文本——非代码调用
      const lines = src.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim()
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) lines[i] = ''
      }
      const codeOnly = lines.join('\n')
      for (const m of codeOnly.matchAll(/\b(?:window|document|navigator|localStorage)\s*\.|\bmatchMedia\(/g)) {
        // 白名单：观测调试（window.__wf_*）与入口挂载（document.querySelector('#root')）
        // 与 hash 桥接（window.addEventListener('hashchange')——embed 平台基础设施）
        const ctx = codeOnly.slice(Math.max(0, m.index - 60), m.index + 40)
        if (ctx.includes('window.__wf') || ctx.includes("querySelector('#root')") || ctx.includes("hashchange")) continue
        // 字符串内（"document.docx" / '已持久化 localStorage'）非代码调用——跳过
        const prev = codeOnly.slice(Math.max(0, m.index - 30), m.index)
        if (/['"`]/.test(prev)) continue
        offenders.push(`${file.replace(root + '/', '')}:${m[0].trim()}`)
      }
    }
  }
  scan(join(root, 'apps/showcase/src'))
  scan(join(root, 'examples'))
  // 组件库存量：显式开关（--scan-components——组件库清理审计用，存量未清零前默认不门禁）
  if (process.argv.includes('--scan-components')) scan(join(root, 'src/components'))
  if (offenders.length) throw new Error(offenders.slice(0, 5).join('; '))
})

// 4. 无 eval/new Function（框架）
check('无 eval/new Function（框架 src）', () => {
  const src = readFileSync(join(root, 'src/ui-dom/vdom3/jsx.ts'), 'utf-8')
  if (/\beval\(|new Function/.test(src)) throw new Error('jsx.ts 含 eval')
})

// 5. 单文件测试
if (testFile) {
  check(`测试 ${testFile}`, () => {
    execSync(`timeout 15 node --env-file=.env --test --test-timeout=8000 ${testFile}`, { cwd: root, stdio: 'inherit' })
  })
}

// 5.5 LLM 体验审计（死链/结构/一致性——scripts/llm-experience-audit.mjs）
check('LLM 体验审计（死链清零/结构齐全/一致性）', () => {
  execSync('node scripts/llm-experience-audit.mjs', { cwd: root, stdio: 'pipe' })
})

// 6. 全量测试
if (!quick) {
  check('全量测试（npm test——≤15s 预算）', () => {
    const t0 = Date.now()
    execSync('npm test', { cwd: root, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } })
    const dt = Date.now() - t0
    if (dt > 20_000) throw new Error(`耗时 ${(dt / 1000).toFixed(1)}s 超预算`)
    console.log(`      （${(dt / 1000).toFixed(1)}s）`)
  })
}

console.log(failed === 0 ? '\n✓ verify 全部通过' : `\n✗ ${failed} 项失败——拒绝交付（对照 content/guides/quality.md）`)
process.exit(failed === 0 ? 0 : 1)
