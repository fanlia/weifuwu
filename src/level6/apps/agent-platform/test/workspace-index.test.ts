/**
 * 工作空间索引（C3 增强）——AI 上下文注入文件地图
 *
 * 问题：AI 每轮任务都要 list_files + 翻目录才知道工作空间有什么。
 * 方案：消息流构建时扫描工作空间（浅层），生成文件清单注入上下文——
 * AI 开局就知道有什么文件（名称/大小/时间），list_files 降级为详情查询。
 * 零新表、零工具挂钩——纯注入层增强。
 */
import { describe, it } from 'node:test'
import assert from 'node:assert'
import { buildWorkspaceLayer } from '../src/services/persona.ts'

describe('工作空间索引（C3 增强）', () => {
  it('buildWorkspaceLayer：文件地图注入格式', () => {
    const layer = buildWorkspaceLayer([
      { path: 'sales.csv', size: 30, mtime: '2026-08-14T12:00:00Z' },
      { path: 'uploads/c2.csv', size: 30, mtime: '2026-08-14T12:30:00Z' },
      { path: 'report.xlsx', size: 9745, mtime: '2026-08-14T13:00:00Z' },
    ])
    assert.ok(layer.includes('【工作空间文件】'), '段落标题')
    assert.ok(layer.includes('sales.csv'), '根文件在清单')
    assert.ok(layer.includes('uploads/c2.csv'), '子目录文件在清单')
    assert.ok(layer.includes('9.5KB'), '大小格式化（KB）')
    assert.ok(layer.includes('30B'), '大小格式化（B）')
    assert.ok(layer.includes('无需 list_files'), '引导语')
  })

  it('buildWorkspaceLayer：空工作空间返回空', () => {
    assert.strictEqual(buildWorkspaceLayer([]), '')
  })

  it('buildWorkspaceLayer：忽略隐藏/系统文件', () => {
    const layer = buildWorkspaceLayer([
      { path: 'sales.csv', size: 30, mtime: '' },
      { path: '.node_modules', size: 0, mtime: '' },
      { path: 'node_modules/x', size: 100, mtime: '' },
    ])
    assert.ok(layer.includes('sales.csv'))
    assert.ok(!layer.includes('node_modules'), '忽略 node_modules')
  })
})
