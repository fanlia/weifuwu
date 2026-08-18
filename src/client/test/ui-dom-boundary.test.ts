/**
 * ui-dom 边界审计（vdom4 UI-5）——v5 隔离性的可测试保证
 *
 * 规则（AGENTS.md 端口化纪律）：
 *  1. components/、ui-dom/hooks/、ui-dom/middleware/、ui-dom/services/ 零 import engines/——
 *     （引擎只经 index.ts 门面注册 + RendererService 抽象消费）
 *  2. 引擎选择单一入口（services/render-service 的 setRenderer——index.ts 一行）
 *  3. 双实例探针（__wf_ui_dom_instance——模块状态分裂早期检测）
 */
import { test } from 'node:test'
import assert from 'node:assert'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/** 目录下全部 .ts 文件（递归） */
function filesOf(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string): void => {
    for (const e of readdirSync(d)) {
      const p = join(d, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (e.endsWith('.ts') && !e.endsWith('.test.ts')) out.push(p)
    }
  }
  if (existsSync(dir)) walk(dir)
  return out
}

test('UI-5：import 边界——components/hooks/middleware/services 零 import engines/', () => {
  const areas = ['src/client/components', 'src/client/ui-dom/hooks', 'src/client/ui-dom/middleware', 'src/client/ui-dom/services', 'src/client/ui-dom/contracts']
  const violations: string[] = []
  for (const area of areas) {
    for (const f of filesOf(join(root, area))) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const target = m[1]
        // engines/ 或 vdom3/（当前引擎实现目录）——引擎 import 泄漏
        // （ui-dom 门面 index.ts 允许——v5 换引擎只改门面一行——组件/hooks 经门面接触引擎）
        const isFacade = target.includes('ui-dom/index') || target === 'weifuwu/ui-dom'
        if (!isFacade && (target.includes('engines/') || target.includes('/vdom3/') || target === '../vdom3' || target.endsWith('vdom3'))) {
          violations.push(`${f.replace(root + '/', '')} → ${target}`)
        }
      }
    }
  }
  assert.deepEqual(violations, [], `引擎 import 泄漏（v5 隔离性破坏——只允许 index.ts 门面接触引擎）：\n${violations.join('\n')}`)
})

test('UI-5：引擎注册单一入口——services/render-service 的 setRenderer', () => {
  const src = readFileSync(join(root, 'src/client/ui-dom/services/render-service.ts'), 'utf8')
  assert.ok(src.includes('export function setRenderer'), 'setRenderer 导出（引擎注册单一入口）')
  const index = readFileSync(join(root, 'src/client/ui-dom/index.ts'), 'utf8')
  assert.ok(index.includes('setRenderer(vdom3Renderer)'), 'index.ts 门面注册当前引擎（v5 = 改这一行）')
  const adapter = readFileSync(join(root, 'src/client/ui-dom/engines/vdom3/adapter.ts'), 'utf8')
  assert.ok(adapter.includes('if (!hasRenderer()) setRenderer(vdom3Renderer)'), 'adapter 自注册兜底（子路径/测试加载）')
})

test('UI-5：双实例探针就绪', () => {
  const src = readFileSync(join(root, 'src/client/ui-dom/services/render-service.ts'), 'utf8')
  assert.ok(src.includes('__wf_ui_dom_instance'), '双实例探针（模块状态分裂早期检测）')
})
