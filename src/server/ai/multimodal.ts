/**
 * weifuwu AI — 多模态 provider（DashScope 百炼)——拆分为独立工厂：
 *
 *   createDashscopeImage(opts?)   → 图片生成（generateImage——独立 baseUrl/apiKey/model）
 *   createDashscopeVideo(opts?)   → 视频任务（createVideoTask + videoStatus——独立配置）
 *
 * 与 embedding 平级（AiClientOptions.image / .video 各自独立——可不同端点/不同 key/
 * 不同模型——方便后续配置不同供应商）。参数归一在 provider 层单源：
 *   图片：size 白名单（N*N 形态）；视频：RESOLUTIONS/RATIOS 白名单 + duration 夹紧
 *   3-15 + watermark 默认 true。
 *
 * 配置：显式参数 > env（DASHSCOPE_API_KEY / DASHSCOPE_MAAS_API_URL / DASHSCOPE_IMAGE_MODEL /
 * DASHSCOPE_VIDEO_MODEL——无协议前缀补 https）。
 */
import type { ImageGenRequest, ImageGenResult, VideoGenRequest, VideoGenStatus } from './contracts.ts'

/** 图片生成 provider 配置（独立于视频——可不同端点/键/模型） */
export interface ImageGenOptions {
  apiKey?: string
  /** 形如 dashscope.aliyuncs.com（无协议前缀——补 https）；显式 http(s):// 原样保留（测试环境） */
  baseUrl?: string
  /** 默认 DASHSCOPE_IMAGE_MODEL ?? 'z-image-turbo' */
  model?: string
}

/** 视频生成 provider 配置（独立于图片） */
export interface VideoGenOptions {
  apiKey?: string
  /** 形如 dashscope.aliyuncs.com（无协议前缀——补 https）；显式 http(s):// 原样保留（测试环境） */
  baseUrl?: string
  /** 默认 DASHSCOPE_VIDEO_MODEL ?? 'happyhorse-1.1-t2v' */
  model?: string
}

export const DEFAULT_IMAGE_MODEL = 'z-image-turbo'
export const DEFAULT_VIDEO_MODEL = 'happyhorse-1.1-t2v'

export interface ImageGenClient {
  generateImage(req: ImageGenRequest, options?: { signal?: AbortSignal }): Promise<ImageGenResult>
}

export interface VideoGenClient {
  createVideoTask(req: VideoGenRequest, options?: { signal?: AbortSignal }): Promise<{ taskId: string }>
  videoStatus(taskId: string, options?: { signal?: AbortSignal }): Promise<VideoGenStatus>
}

const VIDEO_RESOLUTIONS = new Set(['480P', '720P', '1080P'])
const VIDEO_RATIOS = new Set(['1:1', '16:9', '4:3', '21:9'])

function keyOf(kind: 'image' | 'video', opts: { apiKey?: string }): string {
  const key = opts.apiKey ?? process.env.DASHSCOPE_API_KEY ?? ''
  if (!key) throw new Error(`ai ${kind}: DASHSCOPE_API_KEY 未设置（${kind} 生成需要）`)
  return key
}

function baseOf(opts: { baseUrl?: string }): string {
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

/** 图片生成客户端（独立配置——不同端点/键/模型） */
export function createDashscopeImage(opts: ImageGenOptions = {}): ImageGenClient {
  const base = baseOf(opts)
  const model = () => opts.model ?? process.env.DASHSCOPE_IMAGE_MODEL ?? DEFAULT_IMAGE_MODEL

  return {
    async generateImage(req: ImageGenRequest, options?: { signal?: AbortSignal }): Promise<ImageGenResult> {
      const key = keyOf('image', opts)
      const prompt = String(req.prompt ?? '').trim()
      if (!prompt) throw new Error('ai image: prompt 为必填')
      const size = /^\d{2,4}\*\d{2,4}$/.test(req.size ?? '') ? req.size! : '1024*1024'
      const res = await fetch(`${base}/api/v1/services/aigc/multimodal-generation/generation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: req.model ?? model(),
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
  }
}

/** 视频任务客户端（独立配置） */
export function createDashscopeVideo(opts: VideoGenOptions = {}): VideoGenClient {
  const base = baseOf(opts)
  const model = () => opts.model ?? process.env.DASHSCOPE_VIDEO_MODEL ?? DEFAULT_VIDEO_MODEL

  return {
    async createVideoTask(req: VideoGenRequest, options?: { signal?: AbortSignal }): Promise<{ taskId: string }> {
      const key = keyOf('video', opts)
      const prompt = String(req.prompt ?? '').trim()
      if (!prompt) throw new Error('ai video: prompt 为必填')
      const res = await fetch(`${base}/api/v1/services/aigc/video-generation/video-synthesis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify({
          model: req.model ?? model(),
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
      const key = keyOf('video', opts)
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
