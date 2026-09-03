/**
 * 图片生成工具（z-image-turbo——dashscope 多模态生成接口）
 *
 * provider 面（2027-10 AI-REBUILD）：fetch 直调已迁框架
 * （ctx.ai.generateImage——multimodal.ts——单源 provider 插槽）；
 * 本文件保留**编排面**：下载 → 部门工作区落盘（/ws——交付物中心可见）→ 消息。
 *
 * 响应（实测 2026-09）：output.choices[].message.content[] → [{ image: 预签名 URL }]
 */
import { randomUUID } from 'node:crypto'
import type { AppCtx } from '../middleware/ctx.ts'

async function downloadImage(src: string): Promise<Buffer> {
  if (src.startsWith('data:image')) {
    return Buffer.from(src.slice(src.indexOf(',') + 1), 'base64')
  }
  const res = await fetch(src)
  if (!res.ok) throw new Error(`图片下载失败 HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function generateImage(
  ctx: AppCtx,
  opts: { prompt: string; size?: string; filename?: string; departmentId?: string },
): Promise<string> {
  const ai = ctx.ai
  if (!ai) throw new Error('AI 中间件未注入（ctx.ai）——无法生成图片')
  const prompt = String(opts.prompt ?? '').trim()
  if (!prompt) throw new Error('prompt 为必填——描述你想生成的画面')
  const size = /^\d{2,4}\*\d{2,4}$/.test(opts.size ?? '') ? opts.size! : '1024*1024'

  const r = await ai.generateImage({ prompt, size })
  const src = r.url ?? r.dataUrl
  if (!src) throw new Error('图像生成失败：provider 无图片返回')

  const bytes = await downloadImage(src)
  const [w, h] = size.split('*').map(Number)

  // 落盘：部门工作区（三层模型——交付物中心/部门文件区可见）
  const fname = (opts.filename ?? '').replace(/[^\w.\-\u4e00-\u9fa5]/g, '').slice(0, 80) || `ai-image-${Date.now()}-${randomUUID().slice(0, 8)}.png`
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
