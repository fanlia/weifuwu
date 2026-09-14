/**
 * C5 答案缓存——相似问题直接返回缓存答案（零 token）
 *
 * 设计：
 * - 相似度：字符二元组集合 Jaccard（中文友好、零依赖、无 embedding）
 * - 命中阈值 0.85：同义/近似问题直接命中
 * - 个性化问题（含"我/我的"等个人词）不缓存（隐私 + 时效性）
 * - 缓存答案带命中计数——价值报告可统计"缓存省 ¥X"
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  similarity,
  shouldCacheQuestion,
  findCachedAnswer,
  buildCachedReply,
  isFailureAnswer,
  isArtifactAnswer,
} from '../src/services/answer-cache.ts'

describe('C5 答案缓存', () => {
  it('相似度：字符二元组 Jaccard（中文同义句命中）', () => {
    const a = '什么是 REST API？'
    const b = 'REST API 是什么？'
    assert.ok(similarity(a, b) > 0.6, '同义句相似度应 >0.6')
    assert.ok(similarity('什么是 REST API？', '帮我写一份周报') < 0.3, '无关句相似度应低')
    // 精确相同 = 1
    assert.strictEqual(similarity('你好', '你好'), 1)
  })

  it('命中判定：相似度 ≥ 阈值返回缓存答案', () => {
    const cache = [
      { question: '什么是 REST API？', answer: 'REST API 是一种接口设计风格。' },
    ]
    const hit = findCachedAnswer('REST API 是什么？', cache)
    assert.ok(hit, '同义问题应命中')
    assert.strictEqual(hit?.answer, 'REST API 是一种接口设计风格。')
    const miss = findCachedAnswer('帮我写一首诗', cache)
    assert.strictEqual(miss, null, '无关问题不命中')
  })

  it('个性化问题不缓存（隐私 + 时效）', () => {
    assert.strictEqual(shouldCacheQuestion('我的订单到哪了？'), false, '含"我的"不缓存')
    assert.strictEqual(shouldCacheQuestion('帮我查一下我的余额'), false, '含"我"不缓存')
    assert.strictEqual(shouldCacheQuestion('什么是 REST API？'), true, '通用问题可缓存')
    assert.strictEqual(shouldCacheQuestion('今天几号'), false, '时效性问题不缓存')
    assert.strictEqual(shouldCacheQuestion('给我写个 Python 排序代码'), true, '代码类可缓存')
  })

  it('缓存回复带标注与命中次数', () => {
    const reply = buildCachedReply('REST API 是一种接口设计风格。', 5)
    assert.ok(reply.includes('REST API 是一种接口设计风格。'), '答案透传')
    assert.ok(reply.includes('来自相似问题的快速回复'), '标注来源（B8——用户友好文案）')
    assert.ok(reply.includes('5'), '命中次数')
    assert.ok(!reply.includes('零 token'), '不暴露内部成本信息（B8）')
  })

  it('B2：@ 定向消息不进缓存（写侧——读侧排除不对称实证）', () => {
    assert.strictEqual(shouldCacheQuestion('@小码 帮我写代码'), false, '@定向不缓存')
    assert.strictEqual(shouldCacheQuestion('什么是 REST API？'), true, '无@可缓存')
  })

  it('B3：文件/数据类问题不缓存（答案随文件状态变化——订单.csv 命中 3 次实证）', () => {
    assert.strictEqual(shouldCacheQuestion('看一下 订单.csv 有多少条数据'), false, 'csv 文件查询不缓存')
    assert.strictEqual(shouldCacheQuestion('报告.pptx 在哪里'), false, 'pptx 路径查询不缓存')
    assert.strictEqual(shouldCacheQuestion('2025年大学生就业形势分析报告.pptx 在哪里'), false, '报告文件路径不缓存')
    assert.strictEqual(shouldCacheQuestion('把 Q3 报告发我'), true, '无文件后缀的泛问题可缓存')
  })

  it('2026-09：工具产物型答案（含 /ws/ 路径）→ isArtifactAnswer 识别——不入缓存不复用（画图第二次命中旧图）', () => {
    assert.equal(isArtifactAnswer('海报已生成：/ws/cat-poster.png（已存入部门共享目录）'), true)
    assert.equal(isArtifactAnswer('报告已写好：/ws/report.pdf'), true)
    assert.equal(isArtifactAnswer('今天天气晴朗，适合出门。'), false)
    assert.equal(isArtifactAnswer('好的，我帮你分析一下。'), false)
  })
  it('B2：失败答案识别（isFailureAnswer——AI 失败回复不入缓存毒化）', () => {
    assert.strictEqual(isFailureAnswer('访问 host.docker.internal 失败（网络断连报错）'), true, '含“失败/报错”识别')
    assert.strictEqual(isFailureAnswer('抱歉，这个任务未能完成，请人工处理'), true, '含“未能”识别')
    assert.strictEqual(isFailureAnswer('✅ 已完成：订单.csv 共 2 条数据'), false, '成功答案不误判')
    assert.strictEqual(isFailureAnswer('REST API 是一种接口设计风格。'), false, '正常答案不误判')
    assert.strictEqual(isFailureAnswer('太短'), true, '短答案无缓存价值')
  })
})
