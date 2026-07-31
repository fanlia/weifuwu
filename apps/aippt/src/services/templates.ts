/**
 * templates.ts — 预设大纲模板（结构骨架 + 预设参数）
 *
 * 模板的价值：生成结果可预期——选模板后 LLM 遵循既定章节结构。
 * skeleton 注入 outline prompt，约束大纲的组织方式。
 */

export interface DeckTemplate {
  id: string
  name: string
  description: string
  icon: string
  defaultStyle?: string
  defaultPages?: number
  /** 注入 prompt 的章节结构提示 */
  skeleton: string
}

export const TEMPLATES: DeckTemplate[] = [
  {
    id: 'market-analysis',
    name: '市场分析',
    description: '行业规模 / 驱动力 / 竞争格局 / 趋势预测',
    icon: '📊',
    defaultStyle: 'corporate',
    defaultPages: 10,
    skeleton: `遵循市场分析结构：
1. cover 封面（报告主题）
2. section 行业背景与概述
3. bullets 市场规模与增长（含 data 页：核心数据）
4. bullets 增长驱动力
5. twoColumn 竞争格局（国内 vs 国际玩家）
6. bullets 主要挑战
7. bullets 趋势与预测
8. thanks 结尾`,
  },
  {
    id: 'product-launch',
    name: '产品发布',
    description: '痛点 / 产品亮点 / 对比 / 数据 / 路线图',
    icon: '🚀',
    defaultStyle: 'tech',
    defaultPages: 10,
    skeleton: `遵循产品发布结构：
1. cover 封面（产品名 + 标语）
2. section 行业痛点
3. bullets 产品介绍（核心功能）
4. twoColumn 产品优势对比（我们 vs 传统方案）
5. data 关键数据与指标
6. bullets 未来路线图
7. thanks 结尾（呼吁行动）`,
  },
  {
    id: 'teaching',
    name: '教学课件',
    description: '导入 / 概念讲解 / 案例 / 练习 / 总结',
    icon: '🎓',
    defaultStyle: 'academic',
    defaultPages: 12,
    skeleton: `遵循教学课件结构：
1. cover 封面（课程名称）
2. section 课程导入（学习目标）
3. bullets 核心概念讲解
4. twoColumn 概念对比
5. bullets 案例分析
6. bullets 课堂练习
7. bullets 知识总结
8. thanks 结尾`,
  },
  {
    id: 'weekly-report',
    name: '周报',
    description: '本周进展 / 指标 / 问题 / 下周计划',
    icon: '📋',
    defaultStyle: 'minimal',
    defaultPages: 6,
    skeleton: `遵循周报结构：
1. cover 封面（周报标题 + 周期）
2. bullets 本周关键进展
3. data 核心指标（完成项/数据）
4. bullets 问题与风险
5. bullets 下周计划
6. thanks 结尾`,
  },
  {
    id: 'roadmap',
    name: '路线图',
    description: '愿景 / 目标 / 阶段规划 / 资源 / 风险',
    icon: '🗺️',
    defaultStyle: 'vibrant',
    defaultPages: 10,
    skeleton: `遵循路线图结构：
1. cover 封面（主题 + 愿景）
2. section 背景与愿景
3. bullets 核心目标
4. section 阶段规划
5. bullets 阶段一（近期目标与里程碑）
6. bullets 阶段二（中期目标）
7. bullets 阶段三（长期愿景）
8. data 关键指标与里程碑
9. bullets 资源需求与风险
10. thanks 结尾`,
  },
]

export function getTemplates(): DeckTemplate[] {
  return TEMPLATES
}

export function getTemplate(id?: string): DeckTemplate | undefined {
  if (!id) return undefined
  return TEMPLATES.find((t) => t.id === id)
}

export function templateSkeleton(id?: string): string {
  return getTemplate(id)?.skeleton ?? ''
}
