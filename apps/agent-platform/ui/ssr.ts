/**
 * agent-platform SSR 支持（server 端——A1 首屏 SSR）
 *
 * 形态与 showcase 同构（验证过的根治模式）：
 * - loadSsrApp()：esbuild bundle ui/ssr-entry.ts → 临时 mjs → file:// import
 *   + 重试一次（编辑竞态——2026-08 data url 崩溃根因的治本方案）
 * - renderSsrPage()：uiSsr(router, path) → HTML → ctx.ui.html 包装
 *   （#root 内嵌 SSR 结构——客户端 uiServe 吸收接管——零闪烁）
 * - 只 SSR 登录/注册（无认证面——auth token 在 localStorage——其余页
 *   SPA 壳——ROADMAP A1 边界评估）
 */
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { build as esbuild } from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** 编译 + 加载 SSR bundle（无缓存——正确性优先——与 /app.js 同策略） */
let ssrMod: any = null
async function loadSsrApp(): Promise<any> {
  if (ssrMod) return ssrMod
  const entry = resolve(__dirname, '..', 'ui', 'ssr-entry.ts')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await esbuild({
        entryPoints: [entry],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        jsx: 'automatic',
        jsxImportSource: 'weifuwu/vdom',
      })
      const tmp = resolve(tmpdir(), `wf-ap-ssr-${process.pid}-${Date.now()}.mjs`)
      await writeFile(tmp, result.outputFiles[0].text)
      const mod = await import(pathToFileURL(tmp).href + `?v=${Date.now()}`)
      void rm(tmp, { force: true }).catch(() => {})
      ssrMod = mod
      return mod
    } catch (e) {
      if (attempt === 0) {
        console.error('[agent-platform] SSR bundle 编译失败——重试一次:', (e as Error).message.slice(0, 140))
        await new Promise((r) => setTimeout(r, 50))
        continue
      }
      throw e
    }
  }
  throw new Error('SSR bundle 加载失败')
}

/** 渲染 SSR 页面（登录/注册——首屏即表单——零 JS 可见） */
async function renderSsrPage(path: string): Promise<string | null> {
  try {
    const mod = await loadSsrApp()
    return await mod.uiSsr(mod.router, path, { title: path === '/login' ? '登录 — Agent Platform' : '注册 — Agent Platform' })
  } catch (e) {
    // SSR 失败不阻断（回退空壳——客户端渲染兜底）
    console.warn('[agent-platform] SSR 渲染失败（回退 SPA 壳）:', (e as Error).message.slice(0, 140))
    return null
  }
}

/** 完整 HTML 文档（uiSsr 输出 → 文档变换——head 替换 + script 注入——
 *  showcase 同构模式——不重新包装（uiSsr 返回完整 htmlDocument）） */
export function ssrToDocument(ssrHtml: string, title: string): string {
  const head = `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="/static/style.css">
</head>`
  return ssrHtml
    .replace(/<head>[\s\S]*?<\/head>/, head)
    .replace('</body>', '<script type="module" src="/static/app.js"></script></body>')
}

export { renderSsrPage }
