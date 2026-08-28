/**
 * 带鉴权的文件下载/打开（2026-08——工作区文件不能下载根因修复）
 *
 * 背景：`<a href="/api/.../file?download=1">` 是浏览器导航——无
 * Authorization header——框架 user() 中间件纯 Bearer 鉴权（无 cookie）——
 * 下载必然 401（用户实证：工作区文件点下载/打开无反应——network 401）。
 *
 * 注意：不能用 ui/lib/api.ts 的 api()（那是纯 fetch 封装——不带 token）——
 * 框架的 token 注入在 ui/v3-main.tsx 的 api({ token }) 实例。本模块
 * **直接 fetch + 手动注入 localStorage token**（与框架同源——自动刷新
 * 逻辑由 api() 实例负责——此处简化：401 时尝试用本地 refresh token 刷一次）。
 *
 * 方案：fetch + Bearer → Blob → URL.createObjectURL + <a download>
 * 编程式点击（浏览器原生下载——支持任意二进制——pptx/xlsx/pdf）。
 */

const TOKEN_KEY = 'agent_platform_token'
const REFRESH_KEY = 'agent_platform_refresh'

/** 重新登录过期场景的最小刷新（与框架 refresh 同语义——失败返回 false） */
async function tryRefresh(): Promise<boolean> {
  try {
    const refresh = localStorage.getItem(REFRESH_KEY)
    if (!refresh) return false
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: refresh }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (data.token) {
      localStorage.setItem(TOKEN_KEY, data.token)
      return true
    }
    return false
  } catch {
    return false
  }
}

/** 带 token 的 GET（401 自动刷新重试一次） */
export async function authorizedGet(input: RequestInfo | URL): Promise<Response> {
  const headers = new Headers()
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  let res = await fetch(input, { headers })
  if (res.status === 401 && (await tryRefresh())) {
    const t2 = localStorage.getItem(TOKEN_KEY)
    const h2 = new Headers()
    if (t2) h2.set('Authorization', `Bearer ${t2}`)
    res = await fetch(input, { headers: h2 })
  }
  return res
}

/** 下载文件为 Blob（HTTP 层） */
export async function fetchFileBlob(input: RequestInfo | URL): Promise<{ ok: boolean; blob?: Blob; filename?: string }> {
  const res = await authorizedGet(input)
  if (!res.ok) return { ok: false }
  const cd = res.headers.get('content-disposition')
  let filename: string | undefined
  if (cd) {
    const m = /filename="?([^";]+)"?/.exec(cd)
    if (m?.[1]) filename = decodeURIComponent(m[1])
  }
  return { ok: true, blob: await res.blob(), filename }
}

/** 下载（触发浏览器下载——<a download> 编程式点击）——返回是否成功 */
export async function downloadFileAuthorized(input: RequestInfo | URL, fallbackName: string): Promise<boolean> {
  try {
    const { ok, blob, filename } = await fetchFileBlob(input)
    if (!ok || !blob) {
      console.warn('[download] 下载失败（HTTP 非 200）:', String(input).slice(-60))
      return false
    }
    const name = filename ?? fallbackName
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    return true
  } catch (e) {
    console.warn('[download] 下载异常:', e)
    return false
  }
}
