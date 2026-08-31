#!/usr/bin/env node
/**
 * 体积基线审计（CLIENT-EXCELLENCE-PLAN F1——2027-10）
 * app.js 实测尺寸 vs 基线（bundle-baseline.json）——超容差 exit 1。
 * 基线只能缩小或持平——扩大需显式更新 json 并在 commit 说明理由。
 */
const BASE = process.env.SHOWCASE_URL ?? 'http://localhost:3200'
const baseline = JSON.parse((await import('node:fs')).readFileSync('scripts/bundle-baseline.json', 'utf8'))
const buf = Buffer.from(await (await fetch(`${BASE}/app.js`)).arrayBuffer())
const { gzipSync } = await import('node:zlib')
const gz = gzipSync(buf)
const raw = buf.length, rawGz = gz.length
const okRaw = raw <= baseline.app_js_bytes * baseline.tolerance
const okGz = rawGz <= baseline.app_js_gzip_bytes * baseline.tolerance
console.log(`体积基线：raw ${raw} / gzip ${rawGz}（基线 ${baseline.app_js_bytes} / ${baseline.app_js_gzip_bytes}·容差 +5%）`)
if (!okRaw || !okGz) {
  console.error('✖ 体积超基线——按需加载决策或显式更新基线（commit 说明）')
  process.exit(1)
}
console.log(`✔ 体积基线内（Δ raw ${(raw - baseline.app_js_bytes >= 0 ? '+' : '')}${raw - baseline.app_js_bytes}B）`)
