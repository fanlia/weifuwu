/**
 * 项目空间共享状态（P1-3——createStore 化第一步）
 *
 * filesVersion：AI 写入/编辑文件后 bump——FilesSection 订阅自动刷新（交付物实时可见）
 * aiStatus：agentId → 'working' | 'idle'（wf:step/wf:done 驱动——左栏 AI 状态呼吸灯）
 */
import { createStore } from 'weifuwu/vdom'

export const filesVersion = createStore({ v: 0 })

export function bumpFilesVersion(): void {
  filesVersion.update((s) => { s.v++ })
}

export const aiStatus = createStore<Record<string, 'working' | 'idle'>>({})

export function setAiWorking(agentId: string | undefined, working: boolean): void {
  if (!agentId) return
  aiStatus.set({ [agentId]: working ? 'working' : 'idle' })
}

/**
 * 文件列表刷新注册表（P2 修复：useExternal 的 render([id]) 对动态子组件不可靠——
 * render-only 模型下父 render 不重跑子 renderFn。改为 Chat 事件直接驱动：
 * FilesSection 挂载时注册刷新回调，Chat 收到 file_updated 后调用）
 */
type FilesReloadFn = () => void
const filesReloaders = new Set<FilesReloadFn>()

export function onFilesReload(cb: FilesReloadFn): void {
  filesReloaders.add(cb)
}

export function offFilesReload(cb: FilesReloadFn): void {
  filesReloaders.delete(cb)
}

export function notifyFilesReload(): void {
  for (const cb of [...filesReloaders]) {
    try { cb() } catch { /* 单个刷新失败不影响 */ }
  }
}
