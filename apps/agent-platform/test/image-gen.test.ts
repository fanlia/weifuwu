/**
 * generate_image 工具契约测试
 *
 * 锁定：
 *  - 注册面：BUILTIN_TOOL_DEFS 含 generate_image + registry handler 可调
 *  - 请求契约：POST {MAAS_URL}/api/v1/services/aigc/multimodal-generation/generation
 *    + Bearer key + model z-image-turbo + input.messages 形态（用户 curl 实证）
 *  - 响应解析：output.choices[].message.content[].image（预签名 URL）→ 下载 → 落盘
 *    /ws（部门工作区——交付物可见）→ 返回含 /ws/ 路径
 *  - 自动命名：未传 filename → ai-image-{ts}-{uuid8}.png（randomUUID——并发不覆盖）
 *  - 错误路径：HTTP 非 2xx → 抛错（含状态）；响应无图 → 抛错
 *
 * 注意：workspace.ts 的 DEFAULT_ROOT 是模块级缓存（首次 import 时读 env）——
 * 本文件统一用单个 WS_ROOT（测试内不可换根）。
 */
import { test, mock, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registerBuiltinTools, BUILTIN_TOOL_DEFS } from '../src/tools/builtin.ts'
import { getToolHandler } from '../src/tools/registry.ts'
import { generateImage, imageGenEndpoint, IMAGE_MODEL } from '../src/tools/image-gen.ts'

const WS_ROOT = await mkdtemp(join(tmpdir(), 'img-ws-'))
process.env.DASHSCOPE_MAAS_API_URL = 'llm-test.maas.aliyuncs.com'
process.env.AGENT_WORKSPACE_ROOT = WS_ROOT
after(() => rm(WS_ROOT, { recursive: true, force: true }))

registerBuiltinTools(() => ({}) as any)
const handler = getToolHandler('generate_image') as unknown as (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => Promise<string>

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const IMG_URL = 'https://oss.example.com/img.png?Expires=999&Signature=x'

function mockDashscope() {
  mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    if (String(url).includes('oss.example.com')) return new Response(new Uint8Array(PNG_BYTES))
    return Response.json({ output: { choices: [{ message: { content: [{ image: IMG_URL }] } }] } })
  })
}

test('def 注册面：BUILTIN_TOOL_DEFS 含 generate_image（LLM 可见）', () => {
  const def = BUILTIN_TOOL_DEFS.find(d => d.function.name === 'generate_image')
  assert.ok(def, 'def 存在')
  assert.equal(IMAGE_MODEL, 'z-image-turbo')
  assert.ok(def.function.parameters.required.includes('prompt'))
})

test('请求契约：URL/头/体形态（multimodal-generation + input.messages）', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = []
  mock.method(globalThis, 'fetch', async (url: any, init: any) => {
    calls.push({ url: String(url), init })
    if (String(url).includes('oss.example.com')) return new Response(new Uint8Array(PNG_BYTES))
    return Response.json({ output: { choices: [{ message: { content: [{ image: IMG_URL }] } }] } })
  })
  try {
    const r = await handler({ prompt: '一只橙色小猫', size: '1120*1440', filename: 'cat.png' }, { departmentId: 'dept-1' })
    assert.equal(calls[0].url, imageGenEndpoint())
    const headers = calls[0].init.headers as Record<string, string>
    assert.match(String(headers.Authorization), /^Bearer /)
    const body = JSON.parse(String(calls[0].init.body))
    assert.equal(body.model, 'z-image-turbo')
    assert.equal(body.input.messages[0].content[0].text, '一只橙色小猫')
    assert.equal(body.parameters.size, '1120*1440')
    const saved = await readFile(join(WS_ROOT, 'dept-1', 'cat.png'))
    assert.deepEqual(saved, PNG_BYTES, '图片字节落盘')
    assert.match(r, /\/ws\/cat\.png/)
    assert.match(r, /1120×1440/)
  } finally {
    mock.restoreAll()
  }
})

test('未指定 filename → 自动命名 ai-image-{ts}-{uuid8}.png（randomUUID——并发不覆盖）', async () => {
  mockDashscope()
  try {
    const r = await handler({ prompt: '一只蓝鲸' }, { departmentId: 'dept-1' })
    const m = r.match(/(ai-image-\d+-[0-9a-f]{8}\.png)/)
    assert.ok(m, `自动命名存在: ${r}`)
    const saved = await readFile(join(WS_ROOT, 'dept-1', m![1]))
    assert.deepEqual(saved, PNG_BYTES)
  } finally {
    mock.restoreAll()
  }
})

test('错误路径：HTTP 400 → 抛错含状态 + 响应无图 → 抛错', async () => {
  mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ code: 'Bad', message: '参数错' }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
  try {
    await assert.rejects(() => generateImage({} as any, { prompt: 'x' }), /HTTP 400/)
  } finally { mock.restoreAll() }
  mock.method(globalThis, 'fetch', async () => Response.json({ output: { choices: [{ message: { content: [{ text: 'oops' }] } }] } }))
  try {
    await assert.rejects(() => generateImage({} as any, { prompt: 'x' }), /无图片/)
  } finally { mock.restoreAll() }
})
