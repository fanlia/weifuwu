#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, cp, readFile, writeFile, readdir } from 'node:fs/promises'
import { rm } from 'node:fs/promises'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

const srcDir = join(root, 'src')
const distDir = join(root, 'dist')

// Clean stale dist
await rm(distDir, { recursive: true, force: true })
await mkdir(distDir, { recursive: true })
await mkdir(join(distDir, 'server'), { recursive: true })
await mkdir(join(distDir, 'client', 'vdom'), { recursive: true })
await mkdir(join(distDir, 'client', 'components'), { recursive: true })
await mkdir(join(distDir, 'client', 'layout'), { recursive: true })


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
  entryPoints: [join(srcDir, 'server', 'index.ts')],
  outfile: join(distDir, 'server', 'index.js'),
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

// ── vdom bundle（新一代前端运行时——h/jsx/uiServe/UIRouter 公共面——
//   P3 包面切换——组件库已迁移到 src/client/vdom——构建为 weifuwu/vdom）──
await mkdir(join(distDir, 'client', 'vdom'), { recursive: true })
await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'vdom', 'index.ts')],
  outfile: join(distDir, 'client', 'vdom', 'index.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/vdom',
  bundle: true,
  minify: true,
})

// vdom/jsx-runtime
await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'vdom', 'jsx-runtime.ts')],
  outfile: join(distDir, 'client', 'vdom', 'jsx-runtime.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  minify: true,
})

// vdom/testing（组件测试原语——同签名 ui-dom/testing 兼容）
await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'vdom', 'testing.ts')],
  outfile: join(distDir, 'client', 'vdom', 'testing.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  minify: true,
})





// 编译组件 JS
// 关键：把组件源码对 src/client/ui-dom/* 的相对导入外部化为 weifuwu/ui-dom——
// 运行时与 ui-dom bundle 共享同一模块实例（registry/组件 id 等状态不重复）。
// 若不外部化：components bundle 内联一份 ui-dom 源码 → 命令式中间件（toast host）挂载的
// 组件注册在 components 的 registry，而 $ 的 dirty 走 app 的 renderByIds（查 app 的 registry）
// → 命中无关组件/漏渲染（真实 app 实测：toast 永不渲染）。
const externalizeUiDomPlugin = {
  name: 'externalize-ui-dom',
  setup(build) {
    // 匹配相对导入：../../vdom/xxx.ts（components 契约归 weifuwu/vdom）
    build.onResolve({ filter: /\.\.\/(vdom)\// }, (args) => ({
      path: 'weifuwu/vdom',
      external: true,
    }))
  },
}

await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'components', 'index.ts')],
  tsconfigRaw: { compilerOptions: { jsxImportSource: 'weifuwu/vdom' } },
  outfile: join(distDir, 'client', 'components', 'index.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/vdom',
  bundle: true,
  minify: true,
  external: ['weifuwu/vdom', 'weifuwu/vdom/jsx-runtime'],
  plugins: [externalizeUiDomPlugin],
})

// 编译 layout CSS → 单文件（按文件映射 @layer，源文件零侵入）
const layoutSrc = join(srcDir, 'client', 'layout')
const layoutDist = join(distDir, 'client', 'layout')

const LAYER_OF = {
  _tokens: 'tokens', _dark: 'tokens', _presets: 'tokens', _base: 'base',
  _stack: 'layout', _row: 'layout', _split: 'layout', _center: 'layout', _justify: 'layout',
  _fill: 'layout', _grid: 'layout', _cluster: 'layout', _cover: 'layout',
  _position: 'layout', _sticky: 'layout', _overflow: 'layout', '_safe-area': 'layout',
  _layer: 'layout', '_align-self': 'layout', _nowrap: 'layout', _shrink: 'layout',
  _container: 'layout', '_app-shell': 'layout',
  _surface: 'utilities', _spacing: 'utilities', _border: 'utilities',
  _text: 'utilities', _hidden: 'utilities', _block: 'utilities',
  _flex: 'utilities', // display 工具族（wf-hidden wf-flex@lg 显隐恢复——必须同层后序获胜）
  _popup: 'layout', // 框架内部浮层基类（popup-manager 消费——非用户词汇）
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
        const name = f.replace(/^\.\//, '').replace(/\.css$/, '')
        const layer = LAYER_OF[name]
        // 未登记文件默认 layout 会静默降级层叠优先级（_flex 掉层致 wf-flex@lg 失效的教训）——报错防呆
        if (!layer) throw new Error(`layout 文件未登记 @layer 映射: ${f}（在 scripts/build.mjs LAYER_OF 中登记）`)
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
// 动态扫描目录（新增组件自动包含，硬编码列表会静默漏 CSS）
const componentDirs = (await readdir(join(srcDir, 'client', 'components'), { withFileTypes: true }))
  .filter(d => d.isDirectory())
  .map(d => d.name)
let componentCss = layoutCss + '\n@layer components {\n'
for (const dir of componentDirs) {
  const cssPath = join(srcDir, 'client', 'components', dir, `${dir}.css`)
  try {
    componentCss += await readFile(cssPath, 'utf-8') + '\n'
  } catch (e) {
    // 组件 CSS 不存在时跳过
  }
}
componentCss += '}\n'
await writeFile(join(distDir, 'client', 'components', 'style.css'), componentCss)

// 生成类型声明
console.log('\nGenerating declarations...')
try {
  execSync('npx tsc --project tsconfig.json --emitDeclarationOnly --outDir dist', { stdio: 'inherit', cwd: root })
  console.log('  ✓ declarations generated')
} catch {
  console.log('  ⚠ declaration generation failed (continuing)')
}

console.log('\nBuild complete.')

// ── 产物体积记录（P4 验收用） ──
import { statSync } from 'node:fs'
for (const f of ['index.js', 'ui-dom/index.js', 'ui-dom/jsx-runtime.js', 'components/index.js', 'components/style.css', 'layout/weifuwu-layout.css']) {
  const p = join(distDir, f)
  try {
    console.log(`  dist/${f}: ${(statSync(p).size / 1024).toFixed(1)} KB`)
  } catch {}
}
