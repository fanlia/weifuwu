/**
 * 激活漏斗埋点 — fire-and-forget
 *
 * 事件：register_complete（注册成功）→ agent_created（创建 Agent）→ first_message（首次对话）
 * 后端 first_message 每租户去重（部分唯一索引）——重复 track 幂等。
 *
 * 注意：/api/track 在 protectedRoutes——必须带 Bearer token（tokenKey 与 auth 中间件一致）。
 */
import type { TrackEvent } from './types'

const TOKEN_KEY = 'agent_platform_token'

export function track(event: TrackEvent): void {
  try {
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
    void fetch('/api/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ event }),
    }).catch(() => { /* fire-and-forget——埋点失败不影响主流程 */ })
  } catch { /* ignore */ }
}
