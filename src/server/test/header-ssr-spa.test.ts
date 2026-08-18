/**
 * Header SSR vs SPA 差异分析测试
 *
 * 背景：首页/文档页刷新时 header 区域有视觉变化（闪白/变样）。
 * 本测试渲染两端 header（SSR 内联版 vs SPA Shell 组件版）→ 输出差异清单：
 *   - 结构差异（元素/内容/类名体系）
 *   - 视觉等效性（品牌/六域导航/吸顶/背景）
 * 目标：定位 SSR → SPA 接管时 header 的"变化"来源。
 */
import { test, before } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setupJsdom } from '../../client/test/client/setup.ts'
import { shellHeader, NAV_ITEMS } from '../../../apps/showcase/src/ssr-header.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

before(setupJsdom)

test('Header SSR/SPA 差异分析：SSR 内联版 vs SPA Shell 类版', async () => {
  // ── SSR header（内联 style 版） ──
  const ssr = shellHeader('')
  const ssrEl = document.createElement('div')
  ssrEl.innerHTML = ssr

  // ── SSR header 使用的 var() 必须全部是已定义 token（防闪白事故回归：
  //    曾用不存在的 --wf-color-bg-primary → 恒回落 #fff → 暗色模式 SSR 白底 header） ──
  const varNames = [...ssr.matchAll(/var\((--wf-[a-z0-9-]+)/g)].map((m) => m[1])
  const tokenSrc = ['_tokens.css', '_dark.css', '_base.css']
    .map((f) => readFileSync(join(root, 'src/client/layout', f), 'utf-8'))
    .join('\n')
  const definedVars = new Set([...tokenSrc.matchAll(/(--wf-[a-z0-9-]+)\s*:/g)].map((m) => m[1]))
  const undefinedVars = [...new Set(varNames)].filter((v) => !definedVars.has(v))
  assert.deepEqual(undefinedVars, [], `SSR header 使用了未定义 token: ${undefinedVars.join(', ')}（会回落 fallback——暗色模式闪白）`)
  // 背景变量必须与 SPA Shell 的 wf-bg-primary 同源（var(--wf-color-primary-bg)）——接管前后底色一致
  assert.match(ssr, /background:var\(--wf-color-primary-bg/, 'SSR header 背景必须用 --wf-color-primary-bg（wf-bg-primary 同源）')

  // ── SPA header（Shell.tsx——wf-* 类版）——用 esbuild 编译（.tsx node 无法直 import） ──
  const esbuild = await import('esbuild')
  const code = await esbuild.transform(
    readFileSync(join(root, 'apps/showcase/src/shell.tsx'), 'utf-8'),
    { loader: 'tsx', jsx: 'automatic', jsxImportSource: 'weifuwu/ui-dom', format: 'esm' },
  ).then((r) => r.code)
  // 包名 → src 绝对路径（weifuwu 自引用包在 node_modules 无实体）
  const SRC = join(root, 'src')
  const finalCode = code
    .replaceAll('"weifuwu/ui-dom/jsx-runtime"', `"${join(SRC, 'client/ui-dom/jsx-runtime.ts')}"`)
    .replaceAll('"weifuwu/ui-dom"', `"${join(SRC, 'client/ui-dom/index.ts')}"`)
    .replaceAll('"weifuwu/components"', `"${join(SRC, 'client/components/index.ts')}"`)
  // 编译产物写临时文件（data URL 无法解析包名——文件 import 走 node_modules 解析）
  const tmpFile = join(root, 'node_modules/.cache/header-shell-test.mjs')
  const { mkdirSync, writeFileSync } = await import('node:fs')
  mkdirSync(join(root, 'node_modules/.cache'), { recursive: true })
  writeFileSync(tmpFile, finalCode)
  const shellModule = await import(tmpFile + '?t=' + Date.now())
  const Shell = shellModule.Shell
  const { createRouter } = await import('../../client/ui-dom/vdom3/index.ts')
  const { h } = await import('../../client/ui-dom/vdom3/jsx.ts')
  const host = document.createElement('div')
  document.body.appendChild(host)
  const router = createRouter([{ path: '/', render: () => h(Shell, { page: h('div', {}, 'x') }) }], host)
  await new Promise((r) => setTimeout(r, 80))
  const spaHeader = host.querySelector('.wf-sticky') as HTMLElement

  // ── 差异报告 ──
  const diff: string[] = []
  // 1. 品牌
  const ssrBrand = ssrEl.querySelector('a[href="/"]')?.textContent?.trim()
  const spaBrand = host.querySelector('.wf-sticky a[href="/"]')?.textContent?.trim()
  if (ssrBrand !== spaBrand) diff.push(`品牌文本不同: SSR="${ssrBrand}" SPA="${spaBrand}"`)
  // 2. 六域导航
  const ssrNav = [...ssrEl.querySelectorAll('nav a')].map((a) => a.textContent)
  const spaNav = [...host.querySelectorAll('.wf-sticky nav a')].map((a) => a.textContent)
  if (JSON.stringify(ssrNav) !== JSON.stringify(spaNav)) {
    diff.push(`导航项不同:\n  SSR: ${ssrNav.join(',')}\n  SPA: ${spaNav.join(',')}`)
  }
  // 3. 吸顶
  const ssrSticky = ssrEl.firstElementChild as HTMLElement
  if (ssrSticky.style.position !== 'sticky') diff.push('SSR header 非 sticky')
  const spaPos = getComputedStyle(spaHeader).position
  if (spaPos !== 'sticky') diff.push(`SPA header 非 sticky（${spaPos}——jsdom 可能不应用类样式）`)
  // 4. 类名体系差异（已知有意差异——报告不失败）
  const ssrInline = ssrEl.querySelectorAll('[style]').length
  const spaClass = host.querySelectorAll('.wf-sticky [class]').length
  diff.push(`样式体系: SSR 内联 style 元素 ${ssrInline} 个 · SPA wf-* 类元素 ${spaClass} 个（有意差异——SSR 用 inline 保证首帧渲染，SPA 用类）`)
  // 5. ThemeSwitch（SSR 静态占位——同宽同文——接管无重排）
  const spaSwitch = host.querySelectorAll('.wf-sticky button').length
  const ssrPlaceholder = ssrEl.querySelector('[data-wf-role="theme-placeholder"]')
  const ssrPlaceholderText = ssrPlaceholder?.textContent?.trim() ?? ''
  diff.push(`ThemeSwitch: SSR 静态占位「${ssrPlaceholderText}」 · SPA ${spaSwitch} 个真实按钮（同宽同文——接管无重排）`)
  assert.ok(ssrPlaceholder, 'SSR 含 ThemeSwitch 占位')
  assert.equal(ssrPlaceholderText.replace(/\s+/g, ''), '自动亮色暗色', 'SSR 占位与 SPA 同文（同宽）')

  // ── 输出报告 + 关键一致性断言 ──
  console.log('\n=== Header SSR/SPA 差异报告 ===')
  for (const d of diff) console.log(' ', d)
  // 关键一致性（接管不应"变样"的部分）：
  assert.equal(ssrBrand, 'wf/showcase', '品牌一致')
  assert.deepEqual(ssrNav, NAV_ITEMS.map(([, n]) => n), 'SSR 六域导航完整')
  assert.deepEqual(spaNav, NAV_ITEMS.map(([, n]) => n), 'SPA 六域导航完整')
  assert.equal(ssrSticky.style.position, 'sticky', 'SSR 吸顶')

  router.close()
  document.body.removeChild(host)
})
