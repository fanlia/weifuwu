#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises' // readFile/readdir/cp 随装配单源化退场（bundle.ts 内部读文件）
import { rm } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { bundleLayout, bundleComponents } from '../src/client/layout/bundle.ts'

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

// weifuwu/workflow — 声明式执行引擎（子路径独立 bundle——零运行时外部依赖）
await mkdir(join(distDir, 'server', 'workflow'), { recursive: true })
await esbuild.build({
  entryPoints: [join(srcDir, 'server', 'workflow', 'index.ts')],
  outfile: join(distDir, 'server', 'workflow', 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// ── vdom bundle（新一代前端运行时——h/jsx/uiServe/UIRouter 公共面——
//   P3 包面切换——组件库已迁移到 src/client/vdom——构建为 weifuwu/client/vdom）──
await mkdir(join(distDir, 'client', 'vdom'), { recursive: true })
await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'vdom', 'index.ts')],
  outfile: join(distDir, 'client', 'vdom', 'index.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client/vdom',
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
    // 匹配相对导入：../../vdom/xxx.ts（components 契约归 weifuwu/client/vdom）
    build.onResolve({ filter: /\.\.\/(vdom)\// }, (args) => ({
      path: 'weifuwu/client/vdom',
      external: true,
    }))
  },
}

await esbuild.build({
  entryPoints: [join(srcDir, 'client', 'components', 'index.ts')],
  tsconfigRaw: { compilerOptions: { jsxImportSource: 'weifuwu/client/vdom' } },
  outfile: join(distDir, 'client', 'components', 'index.js'),
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  jsxImportSource: 'weifuwu/client/vdom',
  bundle: true,
  minify: true,
  external: ['weifuwu/client/vdom', 'weifuwu/client/vdom/jsx-runtime'],
  plugins: [externalizeUiDomPlugin],
})

// 编译 layout CSS → 单文件（**装配单源**：src/client/layout/bundle.ts——LAYOUT-PLAN W1）
// 历史：本处曾有 LAYER_OF + mergeLayoutCss 内联实现，与 apps/showcase/server.ts、
// src/test/scenario/server.ts 的两份内联实现并存（四管线三种层序语义——测试环境
// 验证的层序 ≠ 发布产物）；且 head 只取 entry 首行 → 产物开头是**未闭合注释**，
// 把 `@layer tokens, base, layout, utilities, components;` 整条吞掉（postcss 实证：
// 层序语句 0 个——优先级退化为块首现顺序）。两处根因均在 bundle.ts 内单源修复。
const layoutSrc = join(srcDir, 'client', 'layout')
const layoutDist = join(distDir, 'client', 'layout')

const { css: layoutCssRaw } = await bundleLayout(layoutSrc)
// LAYOUT-PLAN W6：CSS minify（esbuild——探针实证保留 @layer/@property/@supports/转义 \@；注释剥离）
const { code: layoutCss } = await esbuild.transform(layoutCssRaw, { loader: 'css', minify: true })
await writeFile(join(layoutDist, 'weifuwu-layout.css'), layoutCss)

// 编译组件 CSS = layout 全量 + 全部组件 CSS（@layer components——目录动态扫描）
const { css: componentCssRaw } = await bundleComponents(layoutSrc, join(srcDir, 'client', 'components'))
const { code: componentCss } = await esbuild.transform(componentCssRaw, { loader: 'css', minify: true })
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
