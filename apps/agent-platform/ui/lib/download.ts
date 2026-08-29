/**
 * 带鉴权的文件下载/打开（2026-08——v2：直链方案——替换 blob a.click）
 *
 * 背景（用户实证 + 实验证据）：
 * - <a href> 直接导航无 Bearer → 401（初版教训）
 * - blob URL + a[download] 编程式点击——**真实浏览器/Playwright 均不触发
 *   下载**（headed/headless 全 ❌——Chromium 对 blob URL 下载的限制）——
 *   fetch blob 成功（200 + 46 字节）但 download 事件永不触发
 * - 可靠方案：**服务端直链 ?token=**（框架 user mw 支持 query token——与
 *   Bearer 同等鉴权）——window.open(下载URL&token) / a[href=直链]——
 *   **浏览器原生导航**——Content-Disposition attachment → 原生下载——
 *   零 blob 零编程点击——100% 可靠
 */

const TOKEN_KEY = 'agent_platform_token'
const REFRESH_KEY = 'agent_platform_refresh'

/** 拼接下载直链（URL path + query 已含、token 追加）——返回完整 URL */
export function downloadUrl(input: string): string {
  const token = localStorage.getItem(TOKEN_KEY) ?? ''
  const sep = input.includes('?') ? '&' : '?'
  return `${input}${sep}token=${encodeURIComponent(token)}`
}

/** 下载（window.open 直链——浏览器原生导航下载）——返回是否已发起 */
export async function downloadFileAuthorized(input: RequestInfo | URL, _fallbackName?: string): Promise<boolean> {
  try {
    // 先验 token 有效性（避免空 token 直链 401 白导航）——带 token 预检
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      console.warn('[download] 无 token——下载被拒')
      return false
    }
    const url = downloadUrl(String(input))
    // window.open（用户手势上下文内调用——Chrome 允许弹出）——原生下载
    const win = window.open(url, '_blank')
    if (!win) {
      // 弹窗被拦（popup blocker）——fallback：临时 a[href=直链]（同 `target=_blank`）
      const a = document.createElement('a')
      a.href = url
      a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    }
    return true
  } catch (e) {
    console.warn('[download] 下载异常:', e)
    return false
  }
}

/** 打开（预览——直链新 tab）——返回是否已发起 */
export async function openFileUrl(input: string): Promise<boolean> {
  const token = localStorage.getItem(TOKEN_KEY)
  if (!token) return false
  const win = window.open(downloadUrl(input), '_blank')
  return !!win
}

/** 带 token 的 GET（API 层——老接口兼容——保留） */
export async function authorizedGet(input: RequestInfo | URL): Promise<Response> {
  const headers = new Headers()
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { headers })
}
