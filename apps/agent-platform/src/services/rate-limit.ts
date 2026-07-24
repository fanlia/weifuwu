/**
 * 内存限流器 — 滑动窗口计数器
 *
 * 用于保护认证端点（登录/注册）防暴力破解
 * 单进程有效，多实例需 Redis 共享状态
 */

interface WindowEntry {
  count: number
  resetAt: number
}

const windows = new Map<string, WindowEntry>()

// 每分钟清理过期条目（unref 确保不阻止进程退出）
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of windows) {
    if (now >= entry.resetAt) windows.delete(key)
  }
}, 60_000)
cleanupTimer.unref()

export interface RateLimitOptions {
  /** 时间窗口（毫秒），默认 60s */
  windowMs?: number
  /** 窗口内最大请求数，默认 10 */
  max?: number
}

/**
 * 检查是否超过限流阈值
 *
 * @returns true = 放行, false = 被限流
 */
export function checkRateLimit(
  key: string,
  opts?: RateLimitOptions,
): boolean {
  const windowMs = opts?.windowMs ?? 60_000
  const max = opts?.max ?? 10
  const now = Date.now()

  let entry = windows.get(key)

  // 窗口过期或不存在 → 新建
  if (!entry || now >= entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  // 窗口内
  entry.count++
  if (entry.count > max) {
    return false
  }
  return true
}

/**
 * 获取限流剩余信息（用于 RateLimit-* 响应头）
 */
export function getRateLimitInfo(key: string): { remaining: number; resetAt: number } | null {
  const entry = windows.get(key)
  if (!entry) return null
  return {
    remaining: Math.max(0, 10 - entry.count),
    resetAt: entry.resetAt,
  }
}

/**
 * 从 Request 构建限流 key（IP + 端点路径）
 */
export function rateLimitKey(req: Request): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'unknown'
  const url = new URL(req.url)
  return `${ip}:${url.pathname}`
}
