/**
 * showcase registry 类型——components-only 定稿（SHOWCASE-COMPONENTS-ONLY-PLAN）
 *
 * 组件表单一事实源：ComponentEntry（name/desc/family/源码导航/gotchas）。
 * 其余域类型（分类/布局原语/patterns/apps/backend/能力/指南/需求/案例/社区）
 * 已随域移除（git 历史可查）。标签体系（tags.ts 语义知识）独立于本文件。
 */

export interface ComponentEntry {
  /** 全局唯一 id（组件名 kebab-case——扁平路由 /components/:id） */
  id: string
  /** 组件显示名（如 Button） */
  name: string
  /** 一句话描述（概述节——精确、无营销文案） */
  desc: string
  /** 家族标识（同名域组件导航——file-preview / ai-chat；搜索维度） */
  family?: 'file-preview' | 'ai-chat'
  /** 源码路径（相对仓库根） */
  sourceFile?: string
  cssFile?: string
  testFile?: string
  /** 纪律/坑（人工补写——AGENTS.md 事故记录按组件归类；生成骨架时空） */
  gotchas?: string[]
}
