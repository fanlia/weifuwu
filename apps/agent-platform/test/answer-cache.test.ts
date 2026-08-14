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
    assert.ok(reply.includes('来自缓存'), '标注来源')
    assert.ok(reply.includes('5'), '命中次数')
  })
})
