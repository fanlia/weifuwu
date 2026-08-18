/**
 * showcase registry — 全站单一数据源（六表 + 关系字段）
 *
 * 纪律（design/showcase-plan.md §6）：
 * - 单向声明、反向推导：pattern 声明 uses[]；app 声明 usesPatterns[]；
 *   组件页"↑用于"反链由 gen-content.mjs 自动推导——禁止手维护反向关系
 * - 组件表由 scripts/migrate-demo-registry.mjs 从 components-demo 迁移生成，
 *   新增组件走 scaffold（registry 自动登记）——禁止手写 components 条目
 * - 计数防线：style-audit 断言 registry 条目与 src/client/components 目录同步
 */

/** 组件分类（与 components-demo 9 分组对应，显示名走 i18n） */
export type CategoryId =
  | 'core' | 'input' | 'form'
  | 'display' | 'viz' | 'feedback'
  | 'navigation' | 'overlay' | 'advanced'
  | 'virtual' | 'editor' | 'ai'

export interface ComponentEntry {
  /** 全局唯一 id（组件名 kebab-case——.md 扁平路由 /components/:id.md） */
  id: string
  /** 组件显示名（如 Button） */
  name: string
  category: CategoryId
  /** 一句话描述（概述节——精确、无营销文案） */
  desc: string
  /** 家族标识（同名域组件导航——file-preview / ai-chat；搜索反链数据源） */
  family?: 'file-preview' | 'ai-chat'
  /** 迁移期：CODE 引用键（main.tsx CODE.xxx） */
  codeKey?: string
  /** 迁移期：demo 组件名（main.tsx DemoXxx） */
  demo?: string
  /** 源码路径（相对仓库根）——由迁移脚本探测 */
  sourceFile?: string
  cssFile?: string
  testFile?: string
  /** 纪律/坑（人工补写——AGENTS.md 事故记录按组件归类；生成骨架时空） */
  gotchas?: string[]
}

export interface PrimitiveFamily {
  id: string
  name: string
  /** 族来源 CSS 文件（相对 src/layout） */
  cssFile: string
  desc: string
  /** 代表类名（演示用） */
  classes: string[]
  /** 工具类还是原语（工具类族如 spacing/surface/border/text） */
  kind: 'primitive' | 'utility'
}

export type PatternGroup = '工作台' | '内容展示' | '营销推广'

export interface PatternEntry {
  id: string
  name: string
  group: PatternGroup
  desc: string
  /** 源码文件（相对 examples/patterns） */
  file: string
  /** 用到的组件（正向声明——反链自动推导）；由迁移脚本从源码 import 提取 */
  uses: string[]
}

export interface AppEntry {
  id: string
  name: string
  desc: string
  /** 模板源码目录（相对 examples/apps） */
  dir: string
  /** 用到的页面模式（正向声明） */
  usesPatterns: string[]
  /** 用到的组件（迁移脚本从源码 import 提取） */
  uses: string[]
  /** 生产级案例（agent-platform：无源码目录——展示层纳入） */
  production?: boolean
  /** 质量标准自检结果（实现后填写） */
  quality?: string[]
  /** 目录结构（文件 → 职责） */
  files?: { name: string; role: string }[]
  /** 改造指南（新手从跑起来到改成自己的——markdown 行） */
  guide?: string[]
}

export type BackendGroup = 'core' | 'data' | 'realtime' | 'ai' | 'saas'

export interface BackendEntry {
  id: string
  name: string
  group: BackendGroup
  desc: string
  /** 中间件注入键（ctx.xxx） */
  middleware: string
  /** 活体演示端点（showcase server） */
  endpoint?: string
  /** 关联组件（正向声明——反链推导） */
  relatedComponents?: string[]
  /** 文档来源（docs/*.md 对应章节——迁移素材） */
  docsSource?: string
}

export interface CapabilityEntry {
  id: string
  name: string
  desc: string
  /** 框架源码位置（自证） */
  srcFile: string
  /** 平台自身使用点（自举证明） */
  selfUsedIn: string[]
  /** 相关纪律（AGENTS.md 条目） */
  discipline?: string
}

export interface GuideEntry {
  id: string
  name: string
  desc: string
  /** 指南正文（Markdown——content/guides/:id.md） */
  body: string
}

export interface NeedEntry {
  id: string
  name: string
  desc: string
  /** 对应应用模板（examples/apps/——可为空） */
  template?: string
  /** 页面模式（patterns/） */
  patterns: string[]
  /** 关键组件 */
  components: string[]
  /** 后端能力 */
  backend: string[]
  /** 组装指引 */
  guide: string
}

export interface CaseEntry {
  id: string
  name: string
  type: 'production' | 'showcase' | 'template'
  desc: string
  highlights: string[]
  url?: string
}

export interface Registry {
  components: ComponentEntry[]
  primitives: PrimitiveFamily[]
  patterns: PatternEntry[]
  apps: AppEntry[]
  backend: BackendEntry[]
  capabilities: CapabilityEntry[]
  guides: GuideEntry[]
}

/** 社区组件收录（/community 域——外部贡献展示） */
export interface CommunityEntry {
  id: string
  name: string
  desc: string
  author: string
  /** 仓库/包地址 */
  url: string
  /** 质量 checklist（与内置组件同标） */
  quality: string[]
}
