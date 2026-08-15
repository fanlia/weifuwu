/**
 * 项目空间共享状态（P1-3——createStore 化第一步）
 *
 * filesVersion：AI 写入/编辑文件后 bump——FilesSection 订阅自动刷新（交付物实时可见）
 */
import { createStore } from 'weifuwu/ui-dom'

export const filesVersion = createStore({ v: 0 })

export function bumpFilesVersion(): void {
  filesVersion.update((s) => { s.v++ })
}
