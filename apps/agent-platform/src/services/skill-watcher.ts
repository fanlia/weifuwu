/**
 * 技能热加载 — 监听技能目录变更，自动重新加载
 *
 * 用法:
 *   const watcher = new SkillWatcher('/path/to/skills')
 *   watcher.on('change', (name) => { ... })
 *   watcher.watch()
 */

import { watch } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import type { SkillRegistry } from './skills.ts'
import { detectSkill, loadSkill } from './skills.ts'
import type { Context } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

type SkillChangeHandler = (event: 'added' | 'removed' | 'changed', skillName: string) => void

export class SkillWatcher {
  private rootDir: string
  private registry: SkillRegistry
  private ctxProvider: () => AppCtx
  private handlers: SkillChangeHandler[] = []
  private watcher: ReturnType<typeof watch> | null = null
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    rootDir: string,
    registry: SkillRegistry,
    ctxProvider: () => AppCtx,
  ) {
    this.rootDir = rootDir
    this.registry = registry
    this.ctxProvider = ctxProvider
  }

  /** 注册变更回调 */
  on(handler: SkillChangeHandler): void {
    this.handlers.push(handler)
  }

  /** 开始监听 */
  watch(): void {
    try {
      this.watcher = watch(this.rootDir, { recursive: true }, (event, filename) => {
        if (!filename) return
        const name = basename(filename.toString())

        // 只关注 SKILL.md 或 tools.ts 的变更
        if (name !== 'SKILL.md' && name !== 'tools.ts') return

        // 获取技能名（父目录名）
        const skillDir = dirname(filename.toString())
        const skillName = basename(skillDir)

        // 防抖：500ms 内同一个技能只触发一次
        const existing = this.debounceTimers.get(skillName)
        if (existing) clearTimeout(existing)

        this.debounceTimers.set(skillName, setTimeout(async () => {
          this.debounceTimers.delete(skillName)

          // 检查技能目录是否还存在
          const exists = await detectSkill(join(this.rootDir, skillDir))

          if (exists) {
            // 技能存在 → 重新加载
            try {
              const skill = await loadSkill(join(this.rootDir, skillDir), this.ctxProvider)
              this.registry.registerSkill(skill)
              this.emit('changed', skillName)
              console.log(`[skill-watcher] 技能 "${skillName}" 已重新加载`)
            } catch (err) {
              console.warn(`[skill-watcher] 重新加载技能 "${skillName}" 失败:`, err)
            }
          } else {
            // 技能被删除
            this.registry.unloadSkill(skillName)
            this.emit('removed', skillName)
            console.log(`[skill-watcher] 技能 "${skillName}" 已卸载`)
          }
        }, 500))
      })

      console.log(`[skill-watcher] 开始监听: ${this.rootDir}`)
    } catch (err) {
      console.warn(`[skill-watcher] 无法监听 ${this.rootDir}:`, err)
    }
  }

  /** 停止监听 */
  close(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
  }

  private emit(event: 'added' | 'removed' | 'changed', skillName: string): void {
    for (const h of this.handlers) {
      try { h(event, skillName) } catch { /* ignore handler errors */ }
    }
  }
}
