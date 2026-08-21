#!/usr/bin/env node
/**
 * weifuwu scaffold——新组件三件套生成器（组件/页面/应用三档）
 *
 * 用法：
 *   node .pi/skills/weifuwu-dev/scripts/scaffold.mjs component <Name> [category]
 *   node .pi/skills/weifuwu-dev/scripts/scaffold.mjs pattern <name> <Name> <group>
 *   node .pi/skills/weifuwu-dev/scripts/scaffold.mjs app <name> <Name>
 *
 * 组件档自动完成：
 *   1. src/components/<Name>/：<Name>.ts + <Name>.css + <Name>.test.ts（三件套骨架）
 *   2. registry 自动登记（apps/showcase/src/registry/components.ts 追加条目）
 *   3. 提示：补 demo → gen-content 重新生成 → 测试
 *
 * 纪律：生成的是骨架不是成品——类型/纪律/测试必须补齐（随开发完成补充）。
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync, appendFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
const CATEGORIES = ['form-core', 'form-select', 'form-advanced', 'data-display', 'data-feedback', 'navigation', 'ai-chat', 'others', 'new-batch']

const [, , kind, name, extra, group] = process.argv

if (!kind || !name) {
  console.log('用法:\n  scaffold component <Name> [category]\n  scaffold pattern <id> <Name> <group>\n  scaffold app <id> <Name>')
  process.exit(1)
}

if (kind === 'component') {
  const dir = join(root, 'src/components', name)
  if (existsSync(dir)) { console.error(`已存在: ${dir}`); process.exit(1) }
  mkdirSync(dir, { recursive: true })
  const cat = CATEGORIES.includes(extra) ? extra : 'others'
  const id = kebab(name)

  writeFileSync(join(dir, `${name}.ts`), `import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface ${name}Props {
  /** 示例 prop——按实际 API 设计（受控 props 必须配回调） */
  label?: string
  value?: string
  onChange?: (value: string) => void
  disabled?: boolean
  children?: any
}

export const ${name}: Component<${name}Props> = async (_init, ctx) =>
  async (props) => {
    const { label, children } = props
    return h('div', { class: 'wf-${id}' }, [
      label ? h('span', { class: 'wf-${id}-label' }, label) : null,
      children ?? null,
    ])
  }
`)
  writeFileSync(join(dir, `${name}.css`), `.wf-${id} {
  /* 样式纪律：
     - 颜色走 --wf-color-* token（禁裸色值；语义文字用 -text 变体）
     - 动效走 --wf-dur-* / --wf-ease-*
     - 小尺寸按钮固定 min/max-height
     - 类名不与 layout 原语冲突（禁 .wf-grid 等） */
}
`)
  writeFileSync(join(dir, `${name}.test.ts`), `import { test } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
import { renderVNode, findByClass, createTestCtx } from '../../ui-dom/testing.ts'
import { ${name} } from './${name}.ts'

test('${name}：渲染与交互', () => {
  setupJsdom()
  const vnode = renderVNode(${name}, { label: '示例' }, createTestCtx())
  assert.ok(vnode, '渲染')
  assert.ok(findByClass(vnode, 'wf-${id}'), '根类存在')
})
`)

  // registry 自动登记（追加条目——组件表由迁移脚本生成，此处 append 保持结构）
  const regFile = join(root, 'apps/showcase/src/registry/components.ts')
  const reg = readFileSync(regFile, 'utf-8')
  const entry = `  {
    "id": "${id}",
    "name": "${name}",
    "category": "${cat}",
    "desc": "（scaffold 生成——补写一句话描述）",
    "sourceFile": "src/components/${name}/${name}.ts",
    "cssFile": "src/components/${name}/${name}.css",
    "testFile": "src/components/${name}/${name}.test.ts"
  }`
  // 数组结尾（去掉收尾的 `]` 再追加）
  const trimmed = reg.trimEnd()
  const body = trimmed.endsWith(']') ? trimmed.slice(0, -1) : trimmed
  writeFileSync(regFile, body + `,\n${entry}\n]\n`)
  console.log(`✓ 组件 ${name} 生成：
  src/components/${name}/${name}.ts（.css/.test.ts）
  registry 已登记（category: ${cat}——变体卡片需在 components-demo 有 DemoCard 或手动调整）
下一步：
  1. 实现 API + 纪律（受控回调/键盘/样式 token）
  2. 设计语言检查（微流明五品格 + 三面孔——design/design-language.md）：
     □ 中性主导/品牌点睛（--wf-color-* token）
     □ 状态链完整（hover/focus/pressed/disabled——design/micro-interactions.md）
     □ 动效走 --wf-dur-* 且 reduced-motion 降级
     □ 键盘可达（方向键/Enter/Escape 按组件语义）
     □ 层级用边界表达（细边框美学——非阴影堆叠）
  3. 补 demo：apps/showcase/src/demos/${cat}.tsx 导出 Demo${name} + DEMOS['${name}']
  4. node scripts/gen-content.mjs && node scripts/gen-content.mjs --check
  5. timeout 15 node --env-file=.env --test --test-timeout=8000 src/components/${name}/${name}.test.ts`)
} else if (kind === 'pattern') {
  const file = join(root, 'examples/patterns', `${name}.tsx`)
  if (existsSync(file)) { console.error(`已存在: ${file}`); process.exit(1) }
  writeFileSync(file, `/**
 * ${name}——页面模式蓝本（复制即用）
 * 纪律：只用 weifuwu/layout 原语 + weifuwu/components——零手写样式
 */
import type { Component } from 'weifuwu/ui-dom'
import { h } from 'weifuwu/ui-dom'

export const ${name}: Component = async (_init: any, _ctx: any) =>
  async (_p: any) => (
    h('div', { class: 'wf-container wf-stack', style: '--wf-max:980px;--wf-gap:24px' },
      h('div', { class: 'wf-text-2xl wf-text-bold' }, '${name} 模式'),
      h('p', { class: 'wf-text-secondary' }, '（scaffold 生成——用原语+组件填充结构）'),
    )
  )
`)
  console.log(`✓ 模式 ${name} 生成：examples/patterns/${name}.tsx
下一步：注册 registry（apps/showcase/src/registry/patterns.ts）+ 展示页（/patterns/${extra ?? name}）`)
} else if (kind === 'app') {
  const dir = join(root, 'examples/apps', extra ?? name)
  mkdirSync(dir, { recursive: true })
  console.log(`✓ 应用模板骨架目录：examples/apps/${extra ?? name}/
下一步：参照 examples/apps/todo/ 结构（app.tsx + api.ts + server.ts + main.tsx）——复制后改
嵌入：apps/showcase/src/pages/<id>-embed.tsx（history:false 子 router）`)
} else {
  console.error(`未知类型: ${kind}（component/pattern/app）`)
  process.exit(1)
}
