/**
 * core 语义判定点审计（红线——2026-08）
 *
 * 规则：**渲染级空洞/文本判定必须经 isHoleKind/isTextKind（kindOf 单一
 * 实现源）**——模块内手写 `=== null || === undefined || typeof === 'boolean'`
 * （不含 ''——''→hole 双 bug 实证）或 `typeof === 'string' === 'number'`
 * （含 ''）都是分裂点（diffSlot setText 到锚 / 组件输出形状错位）。
 *
 * 豁免（非渲染语义——字段/属性/传输层/显示层）：
 * - node/hole.ts、node/index.ts（判定自身）
 * - field/*（attribute/style/key 值处理）
 * - ssr/html.ts attrsToHtml（属性序列化）
 * - ssr/index.ts $fn 传输
 * - transform/states.ts（stateOf 早退——kindOf 兜底）
 * - node/keyed.ts（keyOf/显示分类——字面量语义）
 * - diff/same.ts（vnode.type 元素判定）
 *
 * 用法：node scripts/audit-core-semantics.mjs（退出码 1 = 违规）
 */
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CORE = resolve(process.cwd(), 'src/client/vdom/core')

// 手写空洞判定（分裂点模式）
const HOLE_PATTERNS = [
  /\=\=\= null \|\| \w+ \=\=\= undefined/,
  /\=\=\= undefined \|\| \w+ \=\=\= null/,
  /typeof \w+ \=\=\= 'boolean'/,
]
// 手写文本判定（含 '' 的 typeof——分裂点）
const TEXT_PATTERNS = [
  /typeof \w+ \=\=\= 'string' \|\| typeof \w+ \=\=\= 'number'/,
  /typeof \w+ \=\=\= 'number' \|\| typeof \w+ \=\=\= 'string'/,
]

const EXEMPT = [
  /node\/hole\.ts/,
  /node\/index\.ts/,
  /field\//,
  /ssr\/html\.ts/,
  /ssr\/index\.ts/,
  /transform\/states\.ts/,
  /node\/keyed\.ts/,
  /diff\/same\.ts/,
  /diff\/children\.ts/, // 已收敛（isHoleSlot 等——isHoleKind 之上）
]

async function* walk(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, ent.name)
    if (ent.isDirectory()) yield* walk(p)
    else if (p.endsWith('.ts')) yield p
  }
}

const violations = []
for await (const file of walk(CORE)) {
  if (EXEMPT.some((re) => re.test(file))) continue
  const src = await readFile(file, 'utf-8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
    for (const [kind, patterns] of [['hole', HOLE_PATTERNS], ['text', TEXT_PATTERNS]]) {
      if (patterns.some((re) => re.test(line))) {
        violations.push(`${file.replace(CORE + '/', '')}:${i + 1} [${kind}] ${line.trim().slice(0, 100)}`)
      }
    }
  })
}

if (violations.length > 0) {
  console.error(`✖ 语义判定点违规 ${violations.length} 处（需收敛 isHoleKind/isTextKind）:`)
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
} else {
  console.log('✔ core 语义判定点审计通过（渲染级判定全部经 isHoleKind/isTextKind）')
}
