/**
 * weifuwu AI — DashScope 多模态客户端（自研，零依赖——图片/视频生成 provider 面）
 *
 * 参考 image-gen.ts / video-gen.ts（agent-platform 工具层）的直调面：
 *   - 图片：{DASHSCOPE_MAAS_API_URL}/api/v1/services/aigc/multimodal-generation/generation
 *   - 视频：X-DashScope-Async 提交 video-synthesis → task_id（24h 有效）→ GET /api/v1/tasks/{id}
 *
 * 分工：**只做 provider 语义**（生成/提交/查询）——不落盘、不建任务行、
 * 不轮询（编排属应用层——agent-platform 的 image-gen/video-gen 保留编排）。
 * 配置：显式参数 > env（DASHSCOPE_API_KEY / DASHSCOPE_MAAS_API_URL——无协议前缀补 https）。
 */
import type { ImageGenRequest, ImageGenResult, VideoGenRequest, VideoGenStatus } from './contracts.ts'

export const IMAGE_MODEL = 'z-image-turbo'
export const VIDEO_MODEL = 'happyhorse-1.1-t2v'

/** happyhorse 参数约束（provider 层归一——单一来源——消费方不重复） */
const VIDEO_RESOLUTIONS = new Set(['480P', '720P', '1080P'])
const VIDEO_RATIOS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '4:5', '5:4', '9:21', '21:9'])

export interface MultimodalOptions {
  apiKey?: string
  /** 形如 dashscope.aliyuncs.com（无协议前缀——补 https——对齐 image-gen/video-gen）；
  显式 http(s):// 原样保留（测试环境指向内存服务器） */
  baseUrl?: string
}

export interface MultimodalClient {
  generateImage(req: ImageGenRequest, options?: { signal?: AbortSignal }): Promise<ImageGenResult>
  createVideoTask(req: VideoGenRequest, options?: { signal?: AbortSignal }): Promise<{ taskId: string }>
  videoStatus(taskId: string, options?: { signal?: AbortSignal }): Promise<VideoGenStatus>
}

function keyOf(opts: MultimodalOptions): string {
  const key = opts.apiKey ?? process.env.DASHSCOPE_API_KEY ?? ''
  if (!key) throw new Error('ai multimodal: DASHSCOPE_API_KEY 未设置（图片/视频生成需要）')
  return key
}

function baseOf(opts: MultimodalOptions): string {
  const base = opts.baseUrl ?? process.env.DASHSCOPE_MAAS_API_URL ?? 'dashscope.aliyuncs.com'
  // 显式协议原样保留（http 测试环境）；无协议前缀补 https（对齐 image-gen 原始行为）
  return /^https?:\/\//.test(base) ? base : `https://${base.replace(/^https?:\/\//, '')}`
}

interface DashscopeImageResp {
  output?: {
    choices?: Array<{ message?: { content?: Array<{ image?: string; text?: string }> } }>
    results?: Array<{ url?: string; b64_image?: string }>
  }
  code?: string
  message?: string
}

/** 从响应提取图片来源（URL 或 base64——兼容双形态——同 image-gen.extractImage） */
function extractImage(data: DashscopeImageResp): string | null {
  for (const choice of data.output?.choices ?? []) {
    for (const c of choice.message?.content ?? []) {
      if (c.image) return c.image
    }
  }
  const results = data.output?.results ?? []
  for (const r of results) {
    if (r?.url) return r.url
    if (r?.b64_image) return `data:image/png;base64,${r.b64_image}`
  }
  return null
}

/** 百炼异步任务状态 → VideoGenStatus（终态映射：SUCCEEDED→done / FAILED→failed） */
function toStatus(raw: { task_status?: string; video_url?: string; message?: string; code?: string }): VideoGenStatus {
  const s = String(raw.task_status ?? 'unknown')
  const url = raw.video_url ? String(raw.video_url) : undefined
  if (s === 'SUCCEEDED' && url) return { status: 'done', url }
  if (s === 'FAILED' || s === 'CANCELED') {
    return { status: 'failed', error: raw.message ? `${raw.message}${raw.code ? `（${raw.code}）` : ''}` : `视频任务失败（${s}）` }
  }
  if (s === 'PENDING') return { status: 'pending' }
  return { status: 'running' } // RUNNING / unknown 等——编排层继续轮询
}

export function createDashscopeMultimodal(opts: MultimodalOptions = {}): MultimodalClient {
  const base = baseOf(opts)

  return {
    async generateImage(req: ImageGenRequest, options?: { signal?: AbortSignal }): Promise<ImageGenResult> {
      const key = keyOf(opts)
      const prompt = String(req.prompt ?? '').trim()
      if (!prompt) throw new Error('ai multimodal: prompt 为必填')
      const size = /^\d{2,4}\*\d{2,4}$/.test(req.size ?? '') ? req.size! : '1024*1024'
      const res = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: req.model ?? IMAGE_MODEL,
          input: { messages: [{ role: 'user', content: [{ text: prompt }] }] },
          parameters: { prompt_extend: false, size },
        }),
        signal: options?.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`图像生成失败 HTTP ${res.status}: ${body.slice(0, 300)}`)
      }
      const data = (await res.json()) as DashscopeImageResp
      const src = extractImage(data)
      if (!src) throw new Error(`图像生成失败：响应无图片（${data.message ?? data.code ?? '未知错误'}）`)
      return src.startsWith('data:image')
        ? { dataUrl: src, mime: 'image/png' }
        : { url: src }
    },

    async createVideoTask(req: VideoGenRequest, options?: { signal?: AbortSignal }): Promise<{ taskId: string }> {
      const key = keyOf(opts)
      const prompt = String(req.prompt ?? '').trim()
      if (!prompt) throw new Error('ai multimodal: prompt 为必填')
      const res = await fetch(`${base}/api/v1/services/aigc/video-generation/video-synthesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: req.model ?? VIDEO_MODEL,
          input: { prompt },
          parameters: {
            resolution: VIDEO_RESOLUTIONS.has(req.resolution ?? '') ? req.resolution! : '1080P',
            ratio: VIDEO_RATIOS.has(req.ratio ?? '') ? req.ratio! : '16:9',
            duration: Math.min(15, Math.max(3, Math.round(Number(req.duration ?? 5) || 5))),
            watermark: req.watermark !== false,
          },
        }),
        signal: options?.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`视频任务创建失败 HTTP ${res.status}: ${body.slice(0, 300)}`)
      }
      const data = (await res.json()) as { output?: { task_id?: string }; code?: string; message?: string }
      const taskId = data.output?.task_id
      if (!taskId) throw new Error(`视频任务创建失败：响应无 task_id（${data.message ?? data.code ?? '未知错误'}）`)
      return { taskId }
    },

    async videoStatus(taskId: string, options?: { signal?: AbortSignal }): Promise<VideoGenStatus> {
      const key = keyOf(opts)
      const res = await fetch(`${base}/api/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: options?.signal,
      })
      if (!res.ok) {
        throw new Error(`视频任务查询失败 HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`)
      }
      const data = (await res.json()) as { output?: { task_status?: string; video_url?: string; message?: string; code?: string } }
      return toStatus(data.output ?? {})
    },
  }
}
