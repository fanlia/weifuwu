#!/usr/bin/env node
/**
 * API 对齐 DX 审计（CLIENT-EXCELLENCE-PLAN D——2027-10）
 *
 * 三检查（基线 = 0 违例——回潮即红）：
 * 1. 受控三件套口径：value/checked/open 类字段必须有 on 回写通道
 *    （纯展示型 value=单向数据输入——合法不在此列）
 * 2. 事件命名面：函数型 props 必须 on 前缀（getter/变换器/schema
 *    提供器合法豁免——getter 纪律 B 类 6）
 * 3. 文档漂移：注释 h(Comp, {...}) 示例 props 必须存在于 interface
 *    （单向检查——低误报；A3 教训：启发式只做单方向）
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src/client/components'

/** 事件命名豁免形态（非事件回调的函数字段——getter/同步变换器） */
// 两段式豁免：整词（target/filter/keyBy/approveSchema 类——后面无字符）+ 前缀（renderXxx/getXxx 类）
const FN_EXEMPT_WORDS = new Set(['children', 'target', 'container', 'filter', 'keyBy', 'approveSchema'])
const FN_EXEMPT_PREFIX = /^(render|format|itemRender|get|validate|parse|should|match|is|transform|fetch|load|map)/

const VALUE_LIKE = /^(value|checked|open|active|activeKey|selected|expanded)$/

/** 展示型 value 豁免（单向数据输入——非受控对——why 记录） */
const DISPLAY_VALUE = new Set([
  'ProgressBar', // value=进度读数（单向展示——无用户回写交互）
  'QRCode',      // value=二维码内容（单向渲染——内容即输出）
  'Steps',       // active=当前步（外部驱动；onSelect 在 item 级——Timeline onClick 同款层级）
])

const v1 = [] // 受控口径
const v2 = [] // 事件命名
const v3 = [] // 文档漂移

for (const dir of readdirSync(ROOT)) {
  if (!statSync(join(ROOT, dir)).isDirectory()) continue
  let src
  try { src = readFileSync(join(ROOT, dir, dir + '.ts'), 'utf8') } catch { continue }
  const im = src.match(/interface (\w*Props)\s*\{([^}]+)\}/s)
  if (!im) continue
  const fields = [...im[2].matchAll(/^\s*(\w+)(\?)?:\s*(.+?);?\s*$/gm)].map((m) => ({ name: m[1], type: m[3].trim() }))
  const names = fields.map((f) => f.name)
  const writes = fields.filter((f) => /^on[A-Z]/.test(f.name) && /\(.*\)\s*=>|Function/.test(f.type))
  // 1) 受控口径
  for (const n of names) {
    if (VALUE_LIKE.test(n) && !writes.length && !DISPLAY_VALUE.has(dir)) v1.push(`${dir}: ${n} 无 on 回写通道（受控必须有——展示型请进 DISPLAY_VALUE 登记并记 why）`)
  }
  // 2) 事件命名
  for (const f of fields) {
    if (!/\(.*\)\s*=>|Function/.test(f.type)) continue
    if (/^on[A-Z]/.test(f.name)) continue
    if (FN_EXEMPT_WORDS.has(f.name) || FN_EXEMPT_PREFIX.test(f.name)) continue
    v2.push(`${dir}: ${f.name}（函数型缺 on 前缀——回调命名 onXxx；getter/变换器请进豁免表并记 why）`)
  }
  // 3) 文档漂移
  const comments = (src.replace(/^\s*[^/].*$/gm, '').match(/\/\*[\s\S]*?\*\/|\/\/.*$/gm) ?? []).join('\n')
  const exRe = new RegExp('h\\(\\s*' + dir + '\\s*,\\s*\\{([^}]*)\\}', 'g')
  for (const m of comments.matchAll(exRe)) {
    for (const [, k] of m[1].matchAll(/(\w+)\s*:/g)) {
      if (k === 'class' || names.includes(k)) continue
      v3.push(`${dir}: 注释示例 prop「${k}」不在 interface（文档漂移）`)
    }
  }
}

console.log(`API 对齐审计：受控违例 ${v1.length} / 事件命名违例 ${v2.length} / 文档漂移 ${v3.length}`)
for (const v of [...v1, ...v2, ...v3]) console.log(`  ✖ ${v}`)
if (v1.length + v2.length + v3.length) process.exit(1)
console.log('✔ API 命名纪律贯彻（受控三件套/on 前缀/文档同步——0 违例）')
