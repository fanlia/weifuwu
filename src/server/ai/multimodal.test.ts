/**
 * DashScope 多模态 provider 契约测试（AI-REBUILD——tools 层迁移后契约归位）
 *
 * 锁定（原 image-gen.test / video-gen.test 的 provider 面断言）：
 *  - 图片：POST multimodal-generation + Bearer + model z-image-turbo +
 *    input.messages 形态 → 提取 output.choices[].message.content[].image
 *  - 视频：POST video-synthesis + X-DashScope-Async: enable + happyhorse-1.1-t2v
 *    + parameters（默认/夹紧）→ task_id；GET /api/v1/tasks/{id} → 状态映射
 *  - 错误路径：HTTP 非 2xx → 抛错含状态；响应无图 → 抛错
 */
import { test, mock, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  createDashscopeMultimodal, IMAGE_MODEL, VIDEO_MODEL,
} from './multimodal.ts'

after(() => mock.restoreAll())

const mm = createDashscopeMultimodal({ baseUrl: 'llm-test.maas.aliyuncs.com', apiKey: 'sk-test' })
const IMG_URL = 'https://oss.example.com/img.png?Expires=999&Signature=x'

test('图片：URL/头/体形态（multimodal-generation + input.messages）', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return Response.json({ output: { choices: [{ message: { content: [{ image: IMG_URL }] } }] } })
  })
  const r = await mm.generateImage({ prompt: '一只橙色小猫', size: '1120*1440' })
  assert.equal(calls[0].url, 'https://llm-test.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
  const headers = calls[0].init.headers as Record<string, string>
  assert.match(String(headers.Authorization), /^Bearer /)
  const body = JSON.parse(String(calls[0].init.body))
  assert.equal(body.model, IMAGE_MODEL)
  assert.equal(body.input.messages[0].content[0].text, '一只橙色小猫')
  assert.equal(body.parameters.size, '1120*1440')
  assert.equal(r.url, IMG_URL)
})

test('图片：响应无图 → 抛错（不静默）', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ output: { choices: [{ message: { content: [{ text: 'oops' }] } }] } }))
  await assert.rejects(() => mm.generateImage({ prompt: 'x' }), /无图片/)
})

test('图片：HTTP 400 → 抛错含状态', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: 'Bad', message: '参数错' }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
  await assert.rejects(() => mm.generateImage({ prompt: 'x' }), /HTTP 400/)
})

test('视频创建：X-DashScope-Async + 模型/参数归一 → task_id', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return Response.json({ output: { task_id: 't-1' }, request_id: 'r1' })
  })
  const { taskId } = await mm.createVideoTask({ prompt: '一只纸箱做的小狗在奔跑', duration: 99, ratio: '4:3', resolution: '4K' })
  assert.equal(calls[0].url, 'https://llm-test.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers['X-DashScope-Async'], 'enable', '异步头必填（缺失报错：不支持同步调用）')
  const body = JSON.parse(String(calls[0].init.body))
  assert.equal(body.model, VIDEO_MODEL)
  assert.equal(body.input.prompt, '一只纸箱做的小狗在奔跑')
  assert.equal(body.parameters.resolution, '1080P', '非法分辨率归默认')
  assert.equal(body.parameters.ratio, '4:3', '合法 ratio 保留')
  assert.equal(body.parameters.duration, 15, '时长夹紧上限 15')
  assert.equal(taskId, 't-1')
})

test('视频状态：PENDING/RUNNING/SUCCEEDED/FAILED → 契约状态映射', async () => {
  const seq = ['PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED']
  let i = 0
  mock.method(globalThis, 'fetch', async () => {
    const cur = seq[Math.min(i++, seq.length - 1)]
    return Response.json({ output: { task_status: cur, video_url: cur === 'SUCCEEDED' ? 'https://oss.example.com/v.mp4' : undefined, code: cur === 'FAILED' ? 'InvalidParameter' : undefined, message: cur === 'FAILED' ? '参数错' : undefined } })
  })
  assert.equal((await mm.videoStatus('t')).status, 'pending')
  assert.equal((await mm.videoStatus('t')).status, 'running')
  const done = await mm.videoStatus('t')
  assert.equal(done.status, 'done')
  assert.equal(done.url, 'https://oss.example.com/v.mp4')
  const failed = await mm.videoStatus('t')
  assert.equal(failed.status, 'failed')
  assert.match(failed.error ?? '', /参数错/)
})

test('视频创建：响应无 task_id → 抛错', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ output: { task_status: 'PENDING' }, message: 'no task' }))
  await assert.rejects(() => mm.createVideoTask({ prompt: 'x' }), /无 task_id/)
})
