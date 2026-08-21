/**
 * showcase 测试共享——spawn showcase server（随机端口）+ 页面打开（错误收集）
 * 纯 playwright（项目场景层模式——node:test runner）。
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)))

export interface ScenarioServer {
  base: string
  stop(): void
}

/** spawn showcase server（PORT=0 随机端口——stdout 解析实际端口） */
export function startShowcaseServer(): Promise<ScenarioServer> {
  return new Promise((resolveP, reject) => {
    const server: ChildProcess = spawn('node', [resolve(__dirname, '..', 'server.ts')], {
      cwd: resolve(__dirname, '..', '..', '..'), // apps/showcase/test → 仓库根
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let logs = ''
    server.stdout?.on('data', (d) => { logs += String(d) })
    server.stderr?.on('data', (d) => { logs += String(d) })
    const timer = setTimeout(() => {
      server.kill()
      reject(new Error(`showcase server 启动超时:\n${logs}`))
    }, 6000)
    server.stdout?.on('data', (d) => {
      // serve 的 ready 打印
      const m = String(d).match(/weifuwu listening on http:\/\/localhost:(\d+)/)
      if (m) {
        clearTimeout(timer)
        resolveP({
          base: `http://localhost:${m[1]}`,
          stop: () => { try { server.kill() } catch { /* 已退出 */ } },
        })
      }
    })
  })
}

/** 打开页面（domcontentloaded + 等 root 渲染）——返回 console.error 列表 */
export async function openShowcase(page: Page, base: string, path: string): Promise<string[]> {
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 150)) })
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 150)))
  await page.goto(base + path, { waitUntil: 'domcontentloaded', timeout: 8000 })
  await page.waitForFunction(() => {
    const root = document.getElementById('root')
    return root !== null && root.childNodes.length > 0
  }, 'root 渲染', { timeout: 6000 })
  return errors
}

// ── 弹窗位置断言（所有浮层组件共用——批 17）──

export interface PopupGeometryOptions {
  /** 面板文字（portal 内可见元素 textContent 包含）——不传取第一个可见面板 */
  panelText?: string
  /** 面板选择器（portal 内限定——如 .wf-tooltip-content） */
  panelSel?: string
  /** 锚点选择器（main 内——方向/对齐断言用） */
  anchorSel?: string
  /** 锚点文字（main 内——find by textContent 包含） */
  anchorText?: string
  /** 方向语义：面板与锚点 rect 相对关系 */
  dir?: 'top' | 'bottom' | 'left' | 'right'
  /** 对齐轴（'x' = 水平居中 ±2 / 'y' = 垂直居中 ±2——对应方向的正交轴） */
  centerAxis?: 'x' | 'y'
  /** 断言无 CSS transform 残留（锚定浮层——定位全权归 JS） */
  transformNone?: boolean
  /** 居中类（modal/drawer/command——固定视口居中——不查锚点方向） */
  centered?: boolean
}

/** 位置断言（轮询等面板定位稳定——面板挂载/动画竞态根治）——失败抛断言 */
export async function assertPopupGeometry(page: Page, opts: PopupGeometryOptions): Promise<void> {
  const deadline = Date.now() + 5000
  let last: string | null = null
  while (Date.now() < deadline) {
    const r = await page.evaluate((o) => {
      const port = document.querySelector('#__wf_portal')
      if (!port) return null
      // portal 内找可见面板（递归——wrapper → panel；限定选择器/文字）
      const walk = (el: Element, depth: number): HTMLElement | null => {
        if (depth > 10) return null
        for (const c of Array.from(el.children)) {
          const r = c.getBoundingClientRect()
          const st = getComputedStyle(c)
          const visible = r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden'
          const isMask = /(^|[\s-])mask([\s-]|$)/.test(c.className?.toString?.() ?? '')
          if (visible && !isMask) {
            const okSel = !o.panelSel || c.matches(o.panelSel)
            const okText = !o.panelText || (c.textContent ?? '').includes(o.panelText)
            if (okSel && okText && c !== port) return c as HTMLElement
          }
          // 递归所有子（wrapper 高 0——fixed 子元素脱离文档流——宽度塌陷；
          // mask 是遮罩层非面板——跳过继续找）
          const sub = walk(c, depth + 1)
          if (sub) return sub
        }
        return null
      }
      const panel = walk(port, 0)
      if (!panel) return null
      const pr = panel.getBoundingClientRect()
      // 向上找 fixed 祖先（面板可能嵌套 inner 元素）
      let cur: HTMLElement | null = panel
      let fixed = false
      while (cur && cur !== port) {
        if (getComputedStyle(cur).position === 'fixed') { fixed = true; break }
        cur = cur.parentElement
      }
      const inPortal = !!panel.closest('#__wf_portal')
      const inViewport = pr.left >= -2 && pr.top >= -2 && pr.right <= window.innerWidth + 2 && pr.bottom <= window.innerHeight + 2
      // 锚点：限定 demo 区可交互元素（排除 props 文档表格——includes 太宽会误配）
      const anchor = o.anchorSel || o.anchorText
        ? (o.anchorSel
          ? Array.from(document.querySelectorAll(o.anchorSel)).find((e) => !o.anchorText || (e.textContent ?? '').includes(o.anchorText))
          : Array.from(document.querySelectorAll('main button, main input, main select, main textarea, main [role="button"], main [class*="trigger"], main [class*="select"], main [class*="picker"], main [class*="mention"], main a, main li, main span')).find((e) => (e.textContent ?? '').includes(o.anchorText ?? '')))
        : null
      if (!anchor && (o.dir || o.centerAxis)) return null
      const ar = anchor ? anchor.getBoundingClientRect() : null
      const sem = o.dir && ar ? (o.dir === 'top' ? pr.bottom < ar.top : o.dir === 'bottom' ? pr.top > ar.bottom : o.dir === 'left' ? pr.right < ar.left : pr.left > ar.right) : null
      const cx = pr && ar ? Math.abs((pr.left + pr.right) / 2 - (ar.left + ar.right) / 2) : null
      const cy = pr && ar ? Math.abs((pr.top + pr.bottom) / 2 - (ar.top + ar.bottom) / 2) : null
      const centerOk = o.centerAxis === 'x' ? (cx !== null && cx <= 2) : o.centerAxis === 'y' ? (cy !== null && cy <= 2) : true
      const tf = getComputedStyle(panel).transform
      const tfOk = !o.transformNone || tf === 'none'
      const centeredOk = !o.centered || (Math.abs(pr.left + pr.width / 2 - window.innerWidth / 2) <= 2)
      return {
        ok: inPortal && fixed && inViewport && (sem === null || sem) && centerOk && tfOk && centeredOk,
        detail: { inPortal, fixed, inViewport, sem, cx: cx !== null ? Math.round(cx) : null, cy: cy !== null ? Math.round(cy) : null, tf, rect: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.right), Math.round(pr.bottom)] },
      }
    }, opts)
    if (r && r.ok) return
    last = r ? JSON.stringify(r.detail) : '面板未出现'
    await page.waitForTimeout(100)
  }
  throw new Error(`弹窗位置断言失败：${last}`)
}
