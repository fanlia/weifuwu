#!/usr/bin/env node
import esbuild from 'esbuild'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, writeFile, cp, chmod } from 'node:fs/promises' // readFile/readdir/cp 随装配单源化退场（bundle.ts 内部读文件）
import { rm } from 'node:fs/promises'
import { execSync } from 'node:child_process'
import { bundleLayout, bundleComponents } from '../src/level5/client/layout/bundle.ts'

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
  'graphql',
  'esbuild',
]

// 后端 bundle
await esbuild.build({
  entryPoints: [join(srcDir, 'level6', 'index.ts')],
  outfile: join(distDir, 'server', 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// weifuwu/server/<sub> + weifuwu/shared/router — src 二级目录直映
// **有 index.ts 的二级目录自动编译**（新子模块零配置——无需逐一登记）
// 与 server/index 主 bundle 的关系：独立可导入（内联其依赖——体积重复可接受——
// 路径直映优先）；外部依赖零（node 内置 external）
for (const sub of ['ai', 'email', 'messager', 'postgres', 'queue', 'redis', 'scheduler', 'ui', 'user', 'workflows']) {
  const entry = join(srcDir, 'level6', 'server', sub, 'index.ts')
  if (!existsSync(entry)) continue
  await esbuild.build({
    entryPoints: [entry],
    outfile: join(distDir, 'server', sub, 'index.js'),
    format: 'esm',
    platform: 'node',
    bundle: true,
    minify: true,
    external,
  })
}
await mkdir(join(distDir, 'shared', 'router'), { recursive: true })
await esbuild.build({
  entryPoints: [join(srcDir, 'level0', 'router', 'index.ts')],
  outfile: join(distDir, 'shared', 'router', 'index.js'),
  format: 'esm',
  platform: 'neutral',
  bundle: true,
  minify: true,
})

// weifuwu/dev — Node loader（--import weifuwu/dev 启动时运行）
await esbuild.build({
  entryPoints: [join(srcDir, 'level6', 'dev', 'index.ts')],
  outfile: join(distDir, 'dev', 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  external,
})

// weifuwu/workflow — 声明式执行引擎（子路径独立 bundle——零运行时外部依赖）
await mkdir(join(distDir, 'server', 'workflow'), { recursive: true })
await esbuild.build({
  entryPoints: [join(srcDir, 'level6', 'server', 'workflow', 'index.ts')],
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
  entryPoints: [join(srcDir, 'level6', 'client', 'vdom', 'index.ts')],
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
  entryPoints: [join(srcDir, 'level6', 'client', 'vdom', 'jsx-runtime.ts')],
  outfile: join(distDir, 'client', 'vdom', 'jsx-runtime.js'),
  format: 'esm',
  platform: 'browser',
  bundle: true,
  minify: true,
})

// vdom/testing（组件测试原语——同签名 ui-dom/testing 兼容）
await esbuild.build({
  entryPoints: [join(srcDir, 'level6', 'client', 'vdom', 'testing.ts')],
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
    // 匹配 vdom 家族相对导入（level0/1/3 的 vdom + level4/6 的 client/vdom——
    // 迁移后组件源码路径）——外部化为 weifuwu/client/vdom（共享运行时单实例）
    build.onResolve({ filter: /\/level(?:0|1|3)\/vdom\/|\/level(?:4|6)\/client\/vdom\// }, () => ({
      path: 'weifuwu/client/vdom',
      external: true,
    }))
  },
}

await esbuild.build({
  entryPoints: [join(srcDir, 'level6', 'client', 'components', 'index.ts')],
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

// weifuwu/client/layout — JS 入口（defineLayout 原语声明 + 装配——node 构建工具面）
await mkdir(join(distDir, 'client', 'layout'), { recursive: true })
await esbuild.build({
  entryPoints: [join(srcDir, 'level6', 'client', 'layout', 'index.ts')],
  outfile: join(distDir, 'client', 'layout', 'index.js'),
  format: 'esm',
  platform: 'node',
  bundle: true,
  minify: true,
  external,
})

// 编译 layout CSS → 单文件（**装配单源**：src/level5/client/layout/bundle.ts——LAYOUT-PLAN W1）
// 历史：本处曾有 LAYER_OF + mergeLayoutCss 内联实现，与 src/level6/apps/showcase/server.ts、
// src/test/scenario/server.ts 的两份内联实现并存（四管线三种层序语义——测试环境
// 验证的层序 ≠ 发布产物）；且 head 只取 entry 首行 → 产物开头是**未闭合注释**，
// 把 `@layer tokens, base, layout, utilities, components;` 整条吞掉（postcss 实证：
// 层序语句 0 个——优先级退化为块首现顺序）。两处根因均在 bundle.ts 内单源修复。
const layoutSrc = join(srcDir, 'level5', 'client', 'layout')
const layoutDist = join(distDir, 'client', 'layout')

const { css: layoutCssRaw } = await bundleLayout(layoutSrc)
// LAYOUT-PLAN W6：CSS minify（esbuild——探针实证保留 @layer/@property/@supports/转义 \@；注释剥离）
const { code: layoutCss } = await esbuild.transform(layoutCssRaw, { loader: 'css', minify: true })
await writeFile(join(layoutDist, 'weifuwu-layout.css'), layoutCss)

// 编译组件 CSS = layout 全量 + 全部组件 CSS（@layer components——目录动态扫描）
const { css: componentCssRaw } = await bundleComponents(layoutSrc, join(srcDir, 'level5', 'client', 'components'))
const { code: componentCss } = await esbuild.transform(componentCssRaw, { loader: 'css', minify: true })
await writeFile(join(distDir, 'client', 'components', 'style.css'), componentCss)

// ── levelN 路径入口副本（dist 树 = 导出面：weifuwu/dist/level6/index.js 等）──
// 旧 bundle 路径（dist/server 等）保留一版兼容；dist/levelN 为新架构正典地址
const ENTRY_COPIES = [
  ['server/index.js', 'level6/index.js'],
  ['server/ai/index.js', 'level6/server/ai/index.js'],
  ['server/email/index.js', 'level6/server/email/index.js'],
  ['server/messager/index.js', 'level6/server/messager/index.js'],
  ['server/postgres/index.js', 'level6/server/postgres/index.js'],
  ['server/queue/index.js', 'level6/server/queue/index.js'],
  ['server/redis/index.js', 'level6/server/redis/index.js'],
  ['server/scheduler/index.js', 'level6/server/scheduler/index.js'],
  ['server/ui/index.js', 'level6/server/ui/index.js'],
  ['server/user/index.js', 'level6/server/user/index.js'],
  ['server/workflow/index.js', 'level6/server/workflow/index.js'],
  ['server/workflows/index.js', 'level6/server/workflows/index.js'],
  ['client/vdom/index.js', 'level6/client/vdom/index.js'],
  ['client/vdom/jsx-runtime.js', 'level6/client/vdom/jsx-runtime.js'],
  ['client/vdom/testing.js', 'level6/client/vdom/testing.js'],
  ['client/components/index.js', 'level6/client/components/index.js'],
  ['client/layout/index.js', 'level6/client/layout/index.js'],
  ['dev/index.js', 'level6/dev/index.js'],
  ['shared/router/index.js', 'level0/router/index.js'],
]
for (const [from, to] of ENTRY_COPIES) {
  const dst = join(distDir, to)
  await mkdir(dirname(dst), { recursive: true })
  await cp(join(distDir, from), dst)
}
console.log(`  levelN 入口副本：${ENTRY_COPIES.length}（dist/level6 · dist/level0）`)

// ── 应用服务端 bundle（bin 面：Node 直跑 JS——node_modules 下不支持 TS 类型剥离）──
for (const app of ['showcase', 'agent-platform']) {
  await esbuild.build({
    entryPoints: [join(srcDir, 'level6', 'apps', app, 'server.ts')],
    outfile: join(distDir, 'level6', 'apps', app, 'server.js'),
    format: 'esm',
    platform: 'node',
    target: 'node22',
    bundle: true,
    minify: true,
    external,
    jsx: 'automatic',
    jsxImportSource: join(srcDir, 'level6', 'client', 'vdom'),
    logLevel: 'silent',
  })
  console.log(`  dist/level6/apps/${app}/server.js（应用服务端 bundle）`)
}

// ── dist 源码树（运行时面 + `weifuwu/dist/levelN/**` 导入面）──
// dist 树 = 导出面（exports 已删）：src/level*/** 逐文件复制（保 TS/TSX——
// ctx.ui 浏览器编译输入端 + Node 原生类型剥离运行端）；排除测试/运行时数据/探针
const SKIP_SEG = new Set(['node_modules', 'data', 'backups', 'test-results', 'dist', 'test', '.git'])
const SKIP_FILE = /\.test\.tsx?$|^\.env$|^\.env\.local$|^probe-/
for (const lv of ['level0', 'level1', 'level2', 'level3', 'level4', 'level5', 'level6']) {
  await cp(join(srcDir, lv), join(distDir, lv), {
    recursive: true,
    filter: (srcPath) => {
      const parts = srcPath.slice(srcDir.length + 1).split('/')
      if (parts.some((p) => SKIP_SEG.has(p))) return false
      const base = parts[parts.length - 1]
      if (SKIP_FILE.test(base)) return false
      return true
    },
  })
  console.log(`  dist/${lv}/: 源码树就位`)
}

// ── 应用启动器（bin 面：dist/level6/apps/*/cli.js——server.ts 自启动）──
for (const [bin, appDir] of [['weifuwu-showcase', 'showcase'], ['weifuwu-platform', 'agent-platform']]) {
  const cliPath = join(distDir, 'level6', 'apps', appDir, 'cli.js')
  await writeFile(cliPath, `#!/usr/bin/env node\n// ${bin} —— 应用启动器（dist 面：服务端 bundle 自启动，PORT 由 env 控制）\nimport './server.js'\n`)
  await chmod(cliPath, 0o755)
  console.log(`  dist/level6/apps/${appDir}/cli.js ← ${bin}`)
}

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
import { statSync , existsSync } from 'node:fs'
for (const f of ['server/index.js', 'client/vdom/index.js', 'client/vdom/jsx-runtime.js', 'client/components/index.js', 'client/components/style.css', 'client/layout/weifuwu-layout.css', 'level6/apps/showcase/cli.js', 'level6/apps/agent-platform/cli.js']) {
  const p = join(distDir, f)
  try {
    console.log(`  dist/${f}: ${(statSync(p).size / 1024).toFixed(1)} KB`)
  } catch {}
}
