import { describe, it } from 'node:test'
import assert from 'node:assert'
import { detectTaskMarker } from '../src/services/task-markers.ts'

describe('任务话语识别（P2）', () => {
  it('认领：好的，我来', () => {
    assert.strictEqual(detectTaskMarker('好的，我来处理这个报表').marker, 'claim')
    assert.strictEqual(detectTaskMarker('收到，交给我吧').marker, 'claim')
  })
  it('完成：✅ 开头 / 结果如下', () => {
    assert.strictEqual(detectTaskMarker('✅ 已完成，数据如下').marker, 'complete')
    assert.strictEqual(detectTaskMarker('结果如下：A=100').marker, 'complete')
  })
  it('移交：委托/交给', () => {
    assert.strictEqual(detectTaskMarker('这块交给知识库查一下').marker, 'handoff')
  })
  it('进行中：正在/先看', () => {
    assert.strictEqual(detectTaskMarker('正在读取数据，稍等').marker, 'progress')
  })
  it('受阻：失败/报错', () => {
    assert.strictEqual(detectTaskMarker('文件读取失败，数据不全').marker, 'error')
  })
  it('普通回复无标记', () => {
    assert.strictEqual(detectTaskMarker('这个问题是这样的……').marker, null)
  })
})
