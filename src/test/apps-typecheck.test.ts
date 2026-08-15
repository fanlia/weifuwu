/**
 * app 类型门禁 — apps/* 与框架 API 的漂移防线
 *
 * components-demo 曾带 12 个存量 tsc 错误长期无人发现（Layout 不透传 style /
 * StatCard countdown 强制 value / ctx.toast 未声明注入）——npm test 不覆盖 app
 * 类型检查就没有防线。
 *
 * 放测试文件而非 pretest：并发 8 的测试运行中 tsc 成本与其他文件重叠（pretest
 * 串行会让全量预算 +4s 破 15s 红线）。incremental 缓存使热运行 <1s/app。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

test('apps 类型检查（components-demo / layouts-demo / agent-platform 零错误）', { timeout: 90_000 }, () => {
  const tsc = 'tsc' // 全局 devDependency（package.json 无本地 tsc——与 pre-commit typecheck 一致）
  // 并行三个 app（Promise 化 exec 多进程，冷 ~2.4s/app 并行 ≈2.5s）
  const run = (app: string) =>
    execFileSync(tsc, [
      '--noEmit', '--incremental',
      '--tsBuildInfoFile', `node_modules/.cache/tsc-${app}`,
      '-p', `apps/${app}/tsconfig.json`,
    ], { cwd: root, stdio: 'pipe' })
  const errors: string[] = []
  // 三个 app 全部从包入口引用（weifuwu/ui-dom——vdom3 事件流引擎——createRouter 统一）
  const jobs = ['components-demo', 'layouts-demo', 'agent-platform'].map((app) =>
    new Promise<void>((resolve) => {
      try { run(app) } catch (e: any) { errors.push(`${app}:\n${e.stdout?.toString() ?? e.message}`) }
      resolve()
    }),
  )
  return Promise.all(jobs).then(() => {
    assert.deepEqual(errors, [], `app 类型错误：\n${errors.join('\n')}`)
  })
})
