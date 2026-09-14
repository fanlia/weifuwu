/**
 * 带鉴权的文件下载/打开（2026-08——v3：下载 ticket——短时绑定票）
 *
 * 安全演进（用户安全意识驱动）：
 * - v1 blob a.click——Chromium 不可靠（fetch 200 但 download 事件不触发）
 * - v2 ?token= 直链——**access token（3600s）拼 URL——泄漏窗口大**（URL 进
 *   浏览器历史/服务器日志/Referer）
 * - v3（当前）：**下载 ticket**——点击先 POST 换 30s 票（type=download +
 *   appId + path 绑定——换 URL 下载其他文件无效）——window.open(ticket 直链)
 *   ——泄漏窗口 30s + 文件绑定（最小暴露面）
 */

const TOKEN_KEY = 'agent_platform_token'

/** 换取下载 ticket（30s 绑定票——Bearer 鉴权）——返回 ticket 或 null */
export async function fetchDownloadTicket(input: string): Promise<string | null> {
  try {
    // 从 path 提取 departmentId（/api/departments/:id/workspace/file?path=...）
    const m = /\/api\/departments\/([^/]+)\/workspace\/file/.exec(input)
    if (!m) return null
    const deptId = m[1]
    const path = new URL(input, 'http://localhost').searchParams.get('path') ?? ''
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) return null
    const res = await fetch(`/api/departments/${deptId}/workspace/download-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ path }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.ticket ?? null
  } catch {
    return null
  }
}

/** 拼接下载直链（download URL + ticket） */
export function downloadUrl(input: string, ticket: string): string {
  const sep = input.includes('?') ? '&' : '?'
  return `${input}${sep}ticket=${encodeURIComponent(ticket)}`
}

/** 下载（换 ticket → window.open 直链——原生导航下载）——返回是否已发起 */
export async function downloadFileAuthorized(input: RequestInfo | URL, _fallbackName?: string): Promise<boolean> {
  try {
    const ticket = await fetchDownloadTicket(String(input))
    if (!ticket) {
      console.warn('[download] ticket 换取失败（登录态/权限）')
      return false
    }
    const url = downloadUrl(String(input), ticket)
    const win = window.open(url, '_blank')
    if (!win) {
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

/** 打开（预览——ticket 直链新 tab） */
export async function openFileUrl(input: string): Promise<boolean> {
  const ticket = await fetchDownloadTicket(input)
  if (!ticket) return false
  const win = window.open(downloadUrl(input, ticket), '_blank')
  return !!win
}

/** 带 token 的 GET（API 层——老接口兼容——保留） */
export async function authorizedGet(input: RequestInfo | URL): Promise<Response> {
  const headers = new Headers()
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { headers })
}
