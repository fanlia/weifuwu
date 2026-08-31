#!/usr/bin/env node
/**
 * 主题渗透审计（CLIENT-EXCELLENCE-PLAN C1——2027-10）
 *
 * 源码硬编码色扫描 + allowlist 登记制：
 * - 数据可视化色板 / 工具域色（裁剪蒙层/视频黑底/色板预设）= 合法登记
 * - UI 语义色（背景/边框/文本/填充）硬编码 = 违例 exit 1（走 CSS 变量）
 *
 * allowlist 按文件 + 行内容模式登记——新增硬编码色 = 审计失败（扩大需登记）。
 * dark 渗漏实证面：160 页 playwright 扫描 0 渗漏（2027-10——本审计防回潮）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/client/components'

/** allowlist：文件名 → 行内容必须匹配的模式（数据色板/工具域语义） */
const ALLOW = [
  { file: 'RelationGraph.ts', pat: /NODE_PALETTE|EDGE_PALETTE|marker.*fill/, why: '关系图数据色板（节点分类/连线着色——跨主题稳定区分度）' },
  { file: 'chart-utils.ts', pat: /const COLORS = \[/, why: '图表系列色板（数据可视化域）' },
  { file: 'Avatar.ts', pat: /const COLORS = \[/, why: '头像名字哈希色板（数据域）' },
  { file: 'ColorPicker.ts', pat: /预设|placeholder|COLORS|^\s*'#[0-9a-fA-F]+',|\/\*\*/, why: '色板工具域（选色功能本身——预设数组/JSDoc 示例）' },
  { file: 'ImageCropper.ts', pat: /fillStyle|strokeStyle/, why: 'canvas 裁剪蒙层/裁剪框（工具视觉——图片上层遮罩）' },
  { file: 'VideoPlayer.ts', pat: /background: '#000'/, why: '视频 letterbox 黑底（媒体语义惯例）' },
]

/** 硬编码色形态（排除 var() 引用行） */
const COLOR_RE = /#[0-9a-fA-F]{3,8}\b|rgba?\(/

const violations = []
const allowed = []
for (const dir of readdirSync(ROOT)) {
  if (!statSync(join(ROOT, dir)).isDirectory()) continue
  const files = readdirSync(join(ROOT, dir)).filter((f) => f.endsWith('.ts') && !f.includes('.test.'))
  for (const f of files) {
    const lines = readFileSync(join(ROOT, dir, f), 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      if (/var\(--wf/.test(l)) continue // 主题变量行（含 fallback 色合法）
      if (!COLOR_RE.test(l)) continue
      // 注释里的 hex（如「hex，如 #4f6ef7」）跳过
      const code = l.replace(/\/\/.*$/, '')
      if (!COLOR_RE.test(code)) continue
      const hit = ALLOW.find((a) => a.file === f && a.pat.test(code))
      if (hit) { allowed.push(`${dir}/${f}:${i + 1}`); continue }
      violations.push(`${dir}/${f}:${i + 1}  ${code.trim().slice(0, 70)}`)
    }
  }
}

console.log(`主题渗透审计：合法登记 ${allowed.length} 行 / 违例 ${violations.length} 行`)
if (violations.length) {
  console.log('✖ UI 语义色硬编码（必须走 CSS 变量——dark 模式渗漏风险）:')
  for (const v of violations) console.log(`  ${v}`)
  process.exit(1)
}
console.log('✔ 硬编码色面 = allowlist 登记制内（0 违例）')
