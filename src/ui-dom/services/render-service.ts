/**
 * services/render-service — 渲染服务注册点（引擎选择单一入口）
 *
 * vdom4 端口化 UI-2：ui-dom 服务层不 import 任何引擎——引擎经
 * setRenderer 注册（index.ts 门面一行）；消费方（命令式中间件/hooks/
 * testing）只经 getRenderer 获取当前引擎——v5 换引擎只改注册行。
 */

import type { RendererService } from '../contracts/renderer.ts'

// ── 双实例校验（§6.1 第三道防线——构建外部化/paths 映射问题导致 ui-dom 模块
//  状态分裂（idRegistry/_idCounter 双份）——组件库与客户端各持一份的早期检测） ──
const g = globalThis as { __wf_ui_dom_instance?: boolean }
if (g.__wf_ui_dom_instance) {
  console.warn('[ui-dom/audit] 双实例检测：ui-dom 已被加载两次——模块状态将分裂' +
    '（idRegistry/共享表各持一份——命令式中间件/跨组件渲染可能错位）——' +
    '请检查构建外部化（scripts/build.mjs）与 tsconfig paths 映射')
}
g.__wf_ui_dom_instance = true

let renderer: RendererService | null = null

/** 引擎注册（门面调用——v5 换引擎 = 改这里） */
export function setRenderer(r: RendererService): void {
  renderer = r
}

/** 获取当前引擎（消费方唯一入口——未注册即明确失败——不静默降级） */
export function getRenderer(): RendererService {
  if (!renderer) {
    throw new Error('[ui-dom] 渲染引擎未注册——请先 import weifuwu/ui-dom 门面（自动注册当前引擎）')
  }
  return renderer
}

/** 引擎是否已注册（测试/诊断） */
export function hasRenderer(): boolean {
  return renderer != null
}
