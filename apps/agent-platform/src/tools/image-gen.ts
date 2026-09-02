/**
 * 图片生成工具（z-image-turbo——dashscope 多模态生成接口）
 *
 * 端点：{DASHSCOPE_MAAS_API_URL}/api/v1/services/aigc/multimodal-generation/generation
 * 响应（实测 2026-09）：output.choices[].message.content[] → [{ image: 预签名 URL }, { text: 回显 }]
 * 落盘：部门工作区（/ws——交付物中心可见——三层模型）
 */
import type { AppCtx } from '../middleware/ctx.ts'

export const IMAGE_MODEL = 'z-image-turbo'

interface DashscopeImageResp {
  output?: {
    choices?: Array<{
      message?: {
        content?: Array<{ image?: string; text?: string }>
      }
    }>
  }
  code?: string
  message?: string
}

/** 生成端点（DASHSCOPE_MAAS_API_URL 无协议前缀——补 https） */
export function imageGenEndpoint(): string {
  const base = process.env.DASHSCOPE_MAAS_API_URL
  if (!base) throw new Error('缺少环境变量 DASHSCOPE_MAAS_API_URL（百炼多模态图像生成端点）')
  return `https://${base.replace(/^https?:\/\//, '')}/api/v1/services/aigc/multimodal-generation/generation`
}

/** 从响应提取图片来源（URL 或 base64——兼容双形态） */
function extractImage(data: DashscopeImageResp): string | null {
  for (const choice of data.output?.choices ?? []) {
    for (const c of choice.message?.content ?? []) {
      if (c.image) return c.image
    }
  }
  // 兼容旧式 results 形态
  const results = (data as any).output?.results ?? []
  for (const r of results) {
    if (r?.url) return r.url
    if (r?.b64_image) return `data:image/png;base64,${r.b64_image}`
  }
  return null
}

async function downloadImage(src: string): Promise<Buffer> {
  if (src.startsWith('data:image')) {
    return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
  }
  const res = await fetch(src)
  if (!res.ok) throw new Error(`图片下载失败 HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function generateImage(
  _ctx: AppCtx,
  opts: { prompt: string; size?: string; filename?: string; departmentId?: string },
): Promise<string> {
  const key = process.env.DASHSCOPE_API_KEY
  if (!key) throw new Error('缺少环境变量 DASHSCOPE_API_KEY')
  const prompt = String(opts.prompt ?? '').trim()
  if (!prompt) throw new Error('prompt 为必填——描述你想生成的画面')
  const size = /^\d{2,4}\*\d{2,4}$/.test(opts.size ?? '') ? opts.size! : '1024*1024'

  const res = await fetch(imageGenEndpoint(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
      parameters: { prompt_extend: false, size },
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`图像生成失败 HTTP ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as DashscopeImageResp
  const src = extractImage(data)
  if (!src) throw new Error(`图像生成失败：响应无图片（${data.message ?? data.code ?? '未知错误'}）`)

  const bytes = await downloadImage(src)
  const [w, h] = size.split('*').map(Number)

  // 落盘：部门工作区（三层模型——交付物中心/部门文件区可见）
  const fname = (opts.filename ?? '').replace(/[^\w.\-\u4e00-\u9fa5]/g, '').slice(0, 80) || `ai-image-${Date.now()}.png`
  if (!opts.departmentId) {
    return `已生成图片（${w}×${h}）——但当前无部门工作区上下文（未保存）——图片 URL：${src}`
  }
  const { resolveDepartmentWorkspace } = await import('../middleware/workspace.ts')
  const { writeFile } = await import('node:fs/promises')
  const { join } = await import('node:path')
  const ws = await resolveDepartmentWorkspace(opts.departmentId, null, true)
  if (!ws) throw new Error('部门工作区不可用——无法保存图片')
  await writeFile(join(ws, fname), bytes)
  return `已生成图片并保存到部门共享目录：/ws/${fname}（${w}×${h}——交付物中心可见）`
}
