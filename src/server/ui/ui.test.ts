/**
 * ui 中间件契约测试（SERVER-PERF-PLAN S4——波次 2）
 *
 * 编译缓存重设计（修订 a29efec3「无缓存」决策——两条否决理由逐条消除）：
 *   ① mtime 同 ms 写文件不失效 → 失效键含 size + esbuild metafile 依赖闭包全量校验
 *   ② 无锁并发双编译竞态 → in-flight promise map（dedup 而非锁）
 *
 * 观测面：`__stats`（每 ui() 实例独立——{ builds, hits, dedups }）——测试/dev 观测钩子。
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { serve, ui } from '../index.ts'
import { Router } from '../core/router.ts'
import { layerMapOf, LAYER_OF } from '../../client/layout/bundle.ts'

interface UiStats {
  builds: number
  hits: number
  dedups: number
}

function statsOf(mw: ReturnType<typeof ui>): UiStats {
  return (mw as unknown as { __stats: UiStats }).__stats
}

describe('ui compile cache (S4)', () => {
  const dirs: string[] = []
  const servers: Awaited<ReturnType<typeof serve>>[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers.length = 0
    for (const d of dirs) await rm(d, { recursive: true, force: true })
    dirs.length = 0
  })

  async function tempDir(): Promise<string> {
    const d = await mkdtemp(join(tmpdir(), 'wf-ui-test-'))
    dirs.push(d)
    return d
  }

  function startWith(mw: ReturnType<typeof ui>, route: (ctx: { ui: any }) => Promise<Response>) {
    const app = new Router()
    app.use(mw)
    app.get('/asset', async (req, ctx) => route(ctx as never))
    const s = serve(app, { port: 0, shutdown: false })
    servers.push(s)
    return s
  }

  it('default: 同入口二次请求命中缓存（builds=1 hits=1）', async () => {
    const dir = await tempDir()
    const entry = join(dir, 'main.tsx')
    await writeFile(entry, "console.log('v1')\n")

    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.js(entry))
    await s.ready

    const r1 = await fetch(`http://localhost:${s.port}/asset`)
    assert.equal(r1.status, 200)
    assert.ok((await r1.text()).includes('v1'))

    const r2 = await fetch(`http://localhost:${s.port}/asset`)
    assert.ok((await r2.text()).includes('v1'), '二次请求返回同内容（bundle）')

    const stats = statsOf(mw)
    assert.equal(stats.builds, 1, `应只编译一次（实际 builds=${stats.builds}）`)
    assert.equal(stats.hits, 1, '第二次应命中缓存')
  })

  it('入口文件内容变更 → 立即失效（改代码即生效——a29efec3 关切保持）', async () => {
    const dir = await tempDir()
    const entry = join(dir, 'main.tsx')
    await writeFile(entry, "console.log('v1')\n")

    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.js(entry))
    await s.ready

    await (await fetch(`http://localhost:${s.port}/asset`)).text()

    // 内容变更（长度不同 → size 维度同步变化）
    await writeFile(entry, "console.log('v2-changed')\n")
    const body = await (await fetch(`http://localhost:${s.port}/asset`)).text()
    assert.ok(body.includes('v2-changed'), '变更后必须拿到新内容')
    assert.equal(statsOf(mw).builds, 2, '变更触发重编译')
  })

  it('依赖文件变更 → 失效（esbuild metafile 依赖闭包校验——入口未变也要重建）', async () => {
    const dir = await tempDir()
    const entry = join(dir, 'main.tsx')
    const dep = join(dir, 'dep.ts')
    await writeFile(entry, "import { v } from './dep'; console.log(v)\n")
    await writeFile(dep, "export const v = 'dep-v1'\n")

    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.js(entry))
    await s.ready

    await (await fetch(`http://localhost:${s.port}/asset`)).text()
    assert.equal(statsOf(mw).builds, 1)

    // 只改依赖文件——入口 mtime/size 不变
    await writeFile(dep, "export const v = 'dep-v2'\n")
    const body = await (await fetch(`http://localhost:${s.port}/asset`)).text()
    assert.ok(body.includes('dep-v2'), '依赖变更必须反映到产物（否则 dev 模式静默旧包）')
    assert.equal(statsOf(mw).builds, 2)
  })

  it('并发首请求 → in-flight dedup（builds=1，其余共享同一次编译）', async () => {
    const dir = await tempDir()
    const entry = join(dir, 'main.tsx')
    await writeFile(entry, "console.log('concurrent')\n")

    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.js(entry))
    await s.ready

    const results = await Promise.all(
      Array.from({ length: 10 }, () => fetch(`http://localhost:${s.port}/asset`).then((r) => r.text())),
    )
    for (const body of results) assert.ok(body.includes('concurrent'))

    const stats = statsOf(mw)
    assert.equal(stats.builds, 1, `并发只应编译一次（实际 builds=${stats.builds}）`)
    assert.equal(
      stats.dedups + stats.hits,
      9,
      '其余 9 个请求要么共享 in-flight（dedup）要么命中缓存（hit）——无一重编译',
    )
  })

  it('ETag/304：If-None-Match 命中 → 304 空体（省 900KB 级重传）', async () => {
    const dir = await tempDir()
    const entry = join(dir, 'main.tsx')
    await writeFile(entry, "console.log('etag-test')\n")

    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.js(entry))
    await s.ready

    const r1 = await fetch(`http://localhost:${s.port}/asset`)
    const etag = r1.headers.get('etag')
    assert.ok(etag, '响应应带 ETag')
    assert.equal(r1.headers.get('cache-control'), 'no-cache', 'no-cache = 可存但每次复验（区别于 no-store）')
    await r1.text()

    const r2 = await fetch(`http://localhost:${s.port}/asset`, {
      headers: { 'If-None-Match': etag! },
    })
    assert.equal(r2.status, 304)
    assert.equal((await r2.arrayBuffer()).byteLength, 0)
  })

  it('cache:false 逃生舱 = 每请求重编译（旧行为等价——a29efec3 语义保留）', async () => {
    const dir = await tempDir()
    const entry = join(dir, 'main.tsx')
    await writeFile(entry, "console.log('nocache')\n")

    const mw = ui({ cache: false })
    const s = startWith(mw, (ctx) => ctx.ui.js(entry))
    await s.ready

    await (await fetch(`http://localhost:${s.port}/asset`)).text()
    await (await fetch(`http://localhost:${s.port}/asset`)).text()
    await (await fetch(`http://localhost:${s.port}/asset`)).text()

    const stats = statsOf(mw)
    assert.equal(stats.builds, 3, '逃生舱：每请求编译（永远新鲜）')
    assert.equal(stats.hits, 0)
  })

  it('css 同机制：二次命中缓存 + 变更失效', async () => {
    const dir = await tempDir()
    const cssPath = join(dir, 'style.css')
    await writeFile(cssPath, '.a { color: red }\n')

    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.css(cssPath))
    await s.ready

    const r1 = await fetch(`http://localhost:${s.port}/asset`)
    assert.ok((await r1.text()).includes('.a'))
    const r2 = await fetch(`http://localhost:${s.port}/asset`)
    await r2.text()

    let stats = statsOf(mw)
    assert.equal(stats.builds, 1, 'css 只读/编译一次')
    assert.equal(stats.hits, 1)

    await writeFile(cssPath, '.a { color: blue }\n.b { margin: 0 }\n')
    const body = await (await fetch(`http://localhost:${s.port}/asset`)).text()
    assert.ok(body.includes('blue'), 'css 变更立即生效')
    stats = statsOf(mw)
    assert.equal(stats.builds, 2)
  })

  it('css @import 闭包进新鲜度键（改依赖即失效——旧只 stat 入口 = 陈旧缓存）', async () => {
    const dir = await tempDir()
    const entry = join(dir, 'entry.css')
    const dep = join(dir, 'dep.css')
    await writeFile(dep, '.dep { color: red }\n')
    await writeFile(entry, "@import './dep.css';\n.entry { color: black }\n")

    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.css(entry))
    await s.ready

    const body1 = await (await fetch(`http://localhost:${s.port}/asset`)).text()
    const inlined = body1.includes('red') // postcss/tailwind 可用时 @import 被内联（可选 peerDep）
    const buildsBefore = statsOf(mw).builds

    // 只改依赖（入口 mtime/size 不变）——size 也变（防同 ms 同长 flaky）
    await writeFile(dep, '.dep { color: blue }\n.dep2 { margin: 0 }\n')
    const body2 = await (await fetch(`http://localhost:${s.port}/asset`)).text()
    assert.equal(statsOf(mw).builds, buildsBefore + 1, '依赖变更 → 重编译（旧实现只 stat 入口 → 陈旧缓存）')
    if (inlined) assert.ok(body2.includes('blue'), '内联管线下依赖内容随之更新')
  })

  it('layout 源面走装配单源（层序声明是活 atrule + 层归属 == LAYER_OF）', async () => {
    const layoutDir = join(import.meta.dirname, '..', '..', 'client', 'layout')
    const mw = ui()
    const s = startWith(mw, (ctx) => ctx.ui.css(join(layoutDir, 'weifuwu-layout.css')))
    await s.ready
    const body = await (await fetch(`http://localhost:${s.port}/asset`)).text()

    // ① 层序声明必须是**活的** atrule（旧 build head bug：取 entry 首行 → 未闭合注释
    //    把 `@layer …;` 整条吞掉 → postcss 解析出 0 个层序语句 → 优先级退化为块首现顺序）
    const postcss = (await import('postcss')).default
    const parsed = postcss.parse(body)
    const stmt = parsed.nodes.find(
      (n: any) => n.type === 'atrule' && n.name === 'layer' && !n.nodes && String(n.params).includes('utilities'),
    )
    assert.ok(stmt, `层序声明必须是活 atrule（非注释内文本）——产物开头: ${body.slice(0, 100)}`)

    // ② 层归属 == LAYER_OF 登记（dev 管线不再把 utilities 掉进 layout 层/零层）
    const map = layerMapOf(body)
    for (const [cls, layer] of [['wf-stack', 'layout'], ['wf-padding-xs', 'utilities'], ['wf-hidden', 'utilities'], ['wf-stream-in', 'base']] as const) {
      if (map.has(cls)) assert.equal(map.get(cls), layer, `${cls} 层归属`)
    }
    assert.equal(map.get('wf-padding-xs'), 'utilities', '工具类必须在 utilities 层（旧 dev 管线：全塞 layout）')
    assert.ok(Object.values(LAYER_OF).includes(String(map.get('wf-stack'))), '原语层归属已登记')
  })
})
