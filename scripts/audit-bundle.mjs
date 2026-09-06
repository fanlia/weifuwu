#!/usr/bin/env node
/**
 * 体积基线审计（CLIENT-EXCELLENCE-PLAN F1——2027-10 · LAYOUT-PLAN W0 增 CSS 面）
 *
 * 两面基线（bundle-baseline.json——超容差 exit 1；基线只能缩小或持平，
 * 扩大需显式更新 json 并在 commit 说明理由）：
 *   ① app.js   —— showcase 主 bundle（实测口径：跑着的 showcase server `/app.js`）
 *   ② CSS      —— **dist 发布产物**（weifuwu/layout 单文件 + components/style.css）
 *                  不用 dev 管线口径：dev 聚合语义与 dist 不同（plan/layout-优化.md
 *                  「装配管线」读数——四管线三种层序），混口径 = 基线不可比。
 *                  dist 未构建 → 打印可见跳过（不静默；`npm run build` 后复跑）。
 */
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'

const BASE = process.env.SHOWCASE_URL ?? 'http://localhost:3200'
const baseline = JSON.parse(readFileSync('scripts/bundle-baseline.json', 'utf8'))
const tolerance = baseline.tolerance
const failed = []
const K = (n) => `${(n / 1024).toFixed(1)}K`

// ── ② CSS（dist 发布产物——先跑：无需 server） ──────────────────────────
const CSS_TARGETS = [
  { path: 'dist/client/layout/weifuwu-layout.css', raw: 'css_layout_bytes', gz: 'css_layout_gzip_bytes', name: 'weifuwu/layout' },
  { path: 'dist/client/components/style.css', raw: 'css_style_bytes', gz: 'css_style_gzip_bytes', name: 'components/style.css' },
]
let cssChecked = 0
for (const t of CSS_TARGETS) {
  if (!existsSync(t.path)) {
    console.log(`⚠ CSS 基线跳过（可见不静默）：${t.path} 不存在——npm run build 后复跑`)
    continue
  }
  const buf = readFileSync(t.path)
  const raw = buf.length
  const rawGz = gzipSync(buf).length
  const okRaw = raw <= baseline[t.raw] * tolerance
  const okGz = rawGz <= baseline[t.gz] * tolerance
  cssChecked++
  console.log(`CSS 体积基线 ${t.name}：raw ${K(raw)} / gzip ${K(rawGz)}（基线 ${K(baseline[t.raw])} / ${K(baseline[t.gz])}·容差 +${Math.round((tolerance - 1) * 100)}%）`)
  if (!okRaw || !okGz) {
    console.error(`✖ ${t.name} CSS 超基线（Δ raw ${raw - baseline[t.raw] >= 0 ? '+' : ''}${raw - baseline[t.raw]}B）——瘦身或显式更新基线（commit 说明）`)
    failed.push(t.name)
  } else {
    console.log(`✔ ${t.name} 基线内（Δ raw ${raw - baseline[t.raw] >= 0 ? '+' : ''}${raw - baseline[t.raw]}B）`)
  }
}

// ── ① app.js（showcase server 实测） ────────────────────────────────────
const buf = Buffer.from(await (await fetch(`${BASE}/app.js`)).arrayBuffer())
const gz = gzipSync(buf)
const raw = buf.length, rawGz = gz.length
const okRaw = raw <= baseline.app_js_bytes * tolerance
const okGz = rawGz <= baseline.app_js_gzip_bytes * tolerance
console.log(`体积基线：raw ${raw} / gzip ${rawGz}（基线 ${baseline.app_js_bytes} / ${baseline.app_js_gzip_bytes}·容差 +5%）`)
if (!okRaw || !okGz) {
  console.error('✖ 体积超基线——按需加载决策或显式更新基线（commit 说明）')
  process.exit(1)
}
console.log(`✔ 体积基线内（Δ raw ${(raw - baseline.app_js_bytes >= 0 ? '+' : '')}${raw - baseline.app_js_bytes}B）`)

if (failed.length) {
  console.error(`✖ CSS 基线超标：${failed.join(' ')}`)
  process.exit(1)
}
console.log(`✔ 体积审计通过（app.js + CSS ${cssChecked}/${CSS_TARGETS.length} 面）`)
