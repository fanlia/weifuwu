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
  createDashscopeImage, createDashscopeVideo, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL,
} from './multimodal.ts'

after(() => mock.restoreAll())

// image/video 独立实例（各自 baseUrl/apiKey/model——与 embedding 平级）
const img = createDashscopeImage({ baseUrl: 'https://llm-test.maas.aliyuncs.com', apiKey: 'sk-test' })
const vid = createDashscopeVideo({ baseUrl: 'https://llm-test.maas.aliyuncs.com', apiKey: 'sk-test' })
const IMG_URL = 'https://oss.example.com/img.png?Expires=999&Signature=x'

test('图片：URL/头/体形态（multimodal-generation + input.messages）', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return Response.json({ output: { choices: [{ message: { content: [{ image: IMG_URL }] } }] } })
  })
  const r = await img.generateImage({ prompt: '一只橙色小猫', size: '1120*1440' })
  assert.equal(calls[0].url, 'https://llm-test.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
  const headers = calls[0].init.headers as Record<string, string>
  assert.match(String(headers.Authorization), /^Bearer /)
  const body = JSON.parse(String(calls[0].init.body))
  assert.equal(body.model, DEFAULT_IMAGE_MODEL)
  assert.equal(body.input.messages[0].content[0].text, '一只橙色小猫')
  assert.equal(body.parameters.size, '1120*1440')
  assert.equal(r.url, IMG_URL)
})

test('图片：响应无图 → 抛错（不静默）', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ output: { choices: [{ message: { content: [{ text: 'oops' }] } }] } }))
  await assert.rejects(() => img.generateImage({ prompt: 'x' }), /无图片/)
})

test('图片：HTTP 400 → 抛错含状态', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: 'Bad', message: '参数错' }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
  await assert.rejects(() => img.generateImage({ prompt: 'x' }), /HTTP 400/)
})

test('视频创建：X-DashScope-Async + 模型/参数归一 → task_id', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), init })
    return Response.json({ output: { task_id: 't-1' }, request_id: 'r1' })
  })
  const { taskId } = await vid.createVideoTask({ prompt: '一只纸箱做的小狗在奔跑', duration: 99, ratio: '4:3', resolution: '4K' })
  assert.equal(calls[0].url, 'https://llm-test.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
  const headers = calls[0].init.headers as Record<string, string>
  assert.equal(headers['X-DashScope-Async'], 'enable', '异步头必填（缺失报错：不支持同步调用）')
  const body = JSON.parse(String(calls[0].init.body))
  assert.equal(body.model, DEFAULT_VIDEO_MODEL)
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
  assert.equal((await vid.videoStatus('t')).status, 'pending')
  assert.equal((await vid.videoStatus('t')).status, 'running')
  const done = await vid.videoStatus('t')
  assert.equal(done.status, 'done')
  assert.equal(done.url, 'https://oss.example.com/v.mp4')
  const failed = await vid.videoStatus('t')
  assert.equal(failed.status, 'failed')
  assert.match(failed.error ?? '', /参数错/)
})

test('image/video 独立配置：不同 baseUrl/apiKey 各走各的端点（多 url 多 key）', async () => {
  const imgA = createDashscopeImage({ baseUrl: 'https://img.example.com', apiKey: 'key-img' })
  const vidB = createDashscopeVideo({ baseUrl: 'https://vid.example.com', apiKey: 'key-vid' })
  const calls: Array<{ url: string; init: RequestInit }> = []
  mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    calls.push({ url: String(url), init })
    // 图片端点 → 图响应；视频端点 → task_id 响应（按 URL 判分）
    const isVideo = String(url).includes('video-synthesis')
    return Response.json(isVideo
      ? { output: { task_id: 't-2' } }
      : { output: { choices: [{ message: { content: [{ image: 'https://o/x.png' }] } }] } })
  })
  await imgA.generateImage({ prompt: 'x' })
  await vidB.createVideoTask({ prompt: 'y' })
  assert.match(calls[0].url, /^https:\/\/img\.example\.com\//, '图片走 image baseUrl')
  assert.match(calls[1].url, /^https:\/\/vid\.example\.com\//, '视频走 video baseUrl')
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer key-img')
  assert.equal((calls[1].init.headers as Record<string, string>).Authorization, 'Bearer key-vid')
})

test('env 默认：无显式参数读 DASHSCOPE_MAAS_API_URL + DASHSCOPE_API_KEY', async () => {
  const prevUrl = process.env.DASHSCOPE_MAAS_API_URL
  const prevKey = process.env.DASHSCOPE_API_KEY
  process.env.DASHSCOPE_MAAS_API_URL = 'https://env.maas.example.com'
  process.env.DASHSCOPE_API_KEY = 'env-key'
  try {
    const calls: Array<{ url: string; init: RequestInit }> = []
    mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
      calls.push({ url: String(url), init })
      return Response.json({ output: { choices: [{ message: { content: [{ image: 'https://o/x.png' }] } }] } })
    })
    const img3 = createDashscopeImage() // 零显式配置——全走 env
    await img3.generateImage({ prompt: 'x' })
    assert.match(calls[0].url, /^https:\/\/env\.maas\.example\.com\//, '默认 baseUrl = DASHSCOPE_MAAS_API_URL')
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer env-key', '默认 apiKey = DASHSCOPE_API_KEY')
    assert.equal(JSON.parse(String(calls[0].init.body)).model, 'z-image-turbo', '默认模型 = 现有常量')
  } finally {
    if (prevUrl === undefined) delete process.env.DASHSCOPE_MAAS_API_URL
    else process.env.DASHSCOPE_MAAS_API_URL = prevUrl
    if (prevKey === undefined) delete process.env.DASHSCOPE_API_KEY
    else process.env.DASHSCOPE_API_KEY = prevKey
  }
})

test('模型可配：显式 model 覆盖默认（DASHSCOPE_IMAGE_MODEL/VIDEO_MODEL 之外）', async () => {
  const calls: Array<{ init: RequestInit }> = []
  mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    calls.push({ init })
    return Response.json({ output: { choices: [{ message: { content: [{ image: 'https://o/x.png' }] } }] } })
  })
  const img2 = createDashscopeImage({ apiKey: 'k', model: 'custom-img-v2' })
  await img2.generateImage({ prompt: 'x' })
  assert.equal(JSON.parse(String(calls[0].init.body)).model, 'custom-img-v2')
})

test('视频创建：响应无 task_id → 抛错', async () => {
  mock.method(globalThis, 'fetch', async () => Response.json({ output: { task_status: 'PENDING' }, message: 'no task' }))
  await assert.rejects(() => vid.createVideoTask({ prompt: 'x' }), /无 task_id/)
})
