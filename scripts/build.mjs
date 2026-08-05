#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, cp, readFile, writeFile } from 'node:fs/promises'
import { rm } from 'node:fs/promises'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const srcDir = join(root, 'src')
const distDir = join(root, 'dist')

// Clean stale dist
await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await mkdir(join(distDir, 'client'), { recursive: true })
await mkdir(join(distDir, 'layout'), { recursive: true })
await mkdir(join(distDir, 'components'), { recursive: true })


const external = [
  '@graphql-tools/schema',
  'graphql',
  'ioredis',
  'postgres',
  'ws',
  'esbuild',
  'postcss',
  'tailwindcss',
  '@tailwindcss/postcss',
]

// 后端 bundle
await esbuild.build({
  entryPoints: [join(srcDir, 'index.ts')],
  outfile: join(distDir, 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// weifuwu/dev — Node loader（--import weifuwu/dev 启动时运行）
await esbuild.build({
  entryPoints: [join(srcDir, 'dev', 'index.ts')],
  outfile: join(distDir, 'dev', 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// 前端 bundle
await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'index.ts')],
  outfile: join(distDir, 'client', 'index.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
})

// 编译组件 JS
await esbuild.build({
  entryPoints: [join(srcDir, 'components', 'index.ts')],
  tsconfigRaw: { compilerOptions: { jsxImportSource: 'weifuwu/client' } },
  outfile: join(distDir, 'components', 'index.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client',
  bundle: true,
  external: ['weifuwu/client'],
})

// 编译 layout CSS → 单文件（按文件映射 @layer，源文件零侵入）
const layoutSrc = join(srcDir, 'layout')
const layoutDist = join(distDir, 'layout')

const LAYER_OF = {
  _tokens: 'tokens', _dark: 'tokens', _base: 'base',
  _stack: 'layout', _row: 'layout', _split: 'layout', _center: 'layout',
  _right: 'layout', _top: 'layout', _bottom: 'layout', _stretch: 'layout',
  _around: 'layout', _evenly: 'layout', _fill: 'layout', _fixed: 'layout',
  _auto: 'layout', _cover: 'layout', _pop: 'layout', _anchor: 'layout',
  _sticky: 'layout', _grid: 'layout', _cluster: 'layout', _scroll: 'layout',
  _clip: 'layout', _block: 'layout', '_inline': 'layout', '_inline-block': 'layout',
  _container: 'layout', _contents: 'layout', _layer: 'layout', _nowrap: 'layout',
  _shrink: 'layout', '_app-shell': 'layout',
  _surface: 'utilities', _spacing: 'utilities', _border: 'utilities',
  _text: 'utilities', _hidden: 'utilities', _prose: 'utilities',
}

function mergeLayoutCss() {
  const entryFile = join(layoutSrc, 'weifuwu-layout.css')
  return readFile(entryFile, 'utf-8').then(entry => {
    const files = []
    for (const line of entry.split('\n')) {
      const m = line.match(/@import\s+['"]([^'"]+)['"]/)
      if (m) files.push(m[1])
    }
    const head = entry.split('\n').slice(0, 1)[0]
    return Promise.all(files.map(f =>
      readFile(join(layoutSrc, f), 'utf-8').then(c => {
        const content = c.replace(/@import\s+['"][^'"]+['"]\s*;?\s*\n?/g, '').trim()
        const layer = LAYER_OF[f.replace(/^\.\//, '').replace(/\.css$/, '')] ?? 'layout'
        return `@layer ${layer} {\n${content}\n}`
      })
    )).then(chunks =>
      `${head}\n\n@layer tokens, base, layout, utilities, components;\n\n${chunks.join('\n\n')}`
    )
  })
}

const layoutCss = await mergeLayoutCss()
await writeFile(join(layoutDist, 'weifuwu-layout.css'), layoutCss)

// 编译组件 CSS = layout 全部 CSS（Token + 暗色 + 基础 + 布局原语 + 工具类）+ 组件 CSS（@layer components）
const componentDirs = ['Button', 'Input', 'Textarea', 'Select', 'Checkbox', 'Switch', 'RadioGroup', 'Table', 'Modal', 'Toast', 'Alert', 'Loading', 'EmptyState', 'Tabs', 'Dropdown', 'Pagination', 'Card', 'Badge', 'Avatar', 'Tag', 'StatCard', 'Steps', 'Form', 'Field', 'Slider', 'SearchInput', 'SegmentedControl', 'ProgressBar', 'Accordion', 'PageHeader', 'Breadcrumb', 'Divider', 'FileUpload', 'Tooltip', 'Drawer', 'Popover', 'Skeleton', 'Img', 'InView', 'DatePicker', 'Chart', 'Editor', 'ThemeSwitch', 'ToolCallCard', 'ApprovalCard']
let componentCss = layoutCss + '\n@layer components {\n'
for (const dir of componentDirs) {
  const cssPath = join(srcDir, 'components', dir, `${dir}.css`)
  try {
    componentCss += await readFile(cssPath, 'utf-8') + '\n'
  } catch (e) {
    // 组件 CSS 不存在时跳过
  }
}
componentCss += '}\n'
await writeFile(join(distDir, 'components', 'style.css'), componentCss)

// jsx-runtime re-exports from client/index.js via package.json exports

// 生成类型声明
console.log('\nGenerating declarations...')
try {
  execSync('npx tsc --project tsconfig.json --emitDeclarationOnly --outDir dist', { stdio: 'inherit', cwd: root })
  console.log('  ✓ declarations generated')
} catch {
  console.log('  ⚠ declaration generation failed (continuing)')
}

console.log('\nBuild complete.')
