/**
 * generate_image 工具编排契约测试（AI-REBUILD——provider 面迁框架后）
 *
 * 锁定（编排面——provider 契约见 src/ai/multimodal.test.ts）：
 *  - 注册面：BUILTIN_TOOL_DEFS 含 generate_image + registry handler 可调
 *  - provider 调用：ctx.ai.generateImage 收到 prompt/size（参数归一编排层）
 *  - 下载 → 落盘 /ws（部门工作区——交付物可见）→ 返回含 /ws/ 路径
 *  - 自动命名：未传 filename → ai-image-{ts}-{uuid8}.png
 *  - 错误路径：ctx.ai 未注入 → 明确报错；provider 无图 → 抛错
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
import { generateImage } from '../src/tools/image-gen.ts'

const WS_ROOT = await mkdtemp(join(tmpdir(), 'img-ws-'))
process.env.AGENT_WORKSPACE_ROOT = WS_ROOT
after(() => rm(WS_ROOT, { recursive: true, force: true }))

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const IMG_URL = 'https://oss.example.com/img.png?Expires=999&Signature=x'

/** 假 ai 面（provider 替身——编排测试不触协议） */
function fakeAi(overrides: Record<string, unknown> = {}) {
  return {
    generateImage: async (req: { prompt: string; size?: string }) => ({ url: IMG_URL, mime: 'image/png' }),
    ...overrides,
  }
}

// 工具 handler 测试内取（registerBuiltinTools 覆盖注册——handler 闭包持最新 getCtx）
function handler(): (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => Promise<string> {
  return getToolHandler('generate_image') as unknown as (args: Record<string, unknown>, toolCtx?: Record<string, unknown>) => Promise<string>
}

function mockDownload() {
  mock.method(globalThis, 'fetch', async (url: unknown) => {
    if (String(url).includes('oss.example.com')) return new Response(new Uint8Array(PNG_BYTES))
    throw new Error(`非预期请求: ${String(url)}`)
  })
}

test('def 注册面：BUILTIN_TOOL_DEFS 含 generate_image（LLM 可见）', () => {
  const def = BUILTIN_TOOL_DEFS.find(d => d.function.name === 'generate_image')
  assert.ok(def, 'def 存在')
  assert.ok(def.function.parameters.required.includes('prompt'))
})

test('编排契约：ctx.ai.generateImage 收 prompt/size + 下载落盘 /ws', async () => {
  const calls: Array<{ prompt: string; size?: string }> = []
  registerBuiltinTools(() => ({ ai: fakeAi({ generateImage: async (req: any) => { calls.push(req); return { url: IMG_URL } } }) }) as any)
  mockDownload()
  try {
    const r = await handler()({ prompt: '一只橙色小猫', size: '1120*1440', filename: 'cat.png' }, { departmentId: 'dept-1' })
    assert.deepEqual(calls[0], { prompt: '一只橙色小猫', size: '1120*1440' })
    const saved = await readFile(join(WS_ROOT, 'dept-1', 'cat.png'))
    assert.deepEqual(saved, PNG_BYTES, '图片字节落盘')
    assert.match(r, /\/ws\/cat\.png/)
    assert.match(r, /1120×1440/)
  } finally {
    mock.restoreAll()
  }
})

test('未指定 filename → 自动命名 ai-image-{ts}-{uuid8}.png', async () => {
  mockDownload()
  try {
    const r = await handler()({ prompt: '一只蓝鲸' }, { departmentId: 'dept-1' })
    const m = r.match(/(ai-image-\d+-[0-9a-f]{8}\.png)/)
    assert.ok(m, `自动命名存在: ${r}`)
    const saved = await readFile(join(WS_ROOT, 'dept-1', m![1]))
    assert.deepEqual(saved, PNG_BYTES)
  } finally {
    mock.restoreAll()
  }
})

test('错误路径：ai 未注入 → 明确报错 + provider 无图 → 抛错', async () => {
  await assert.rejects(() => generateImage({} as any, { prompt: 'x' }), /AI 中间件未注入|ctx\.ai/)
  await assert.rejects(() => generateImage({ ai: fakeAi({ generateImage: async () => ({ url: undefined }) }) } as any, { prompt: 'x' }), /无图片/)
})
