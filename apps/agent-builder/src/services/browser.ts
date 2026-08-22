/**
 * agent-builder 浏览器执行器（browse 能力——真实填写——宿主直接跑
 * agent-browser CLI——蓝图"URL 即边界"——问卷场景无需容器沙盒）
 *
 * 回合流程：open → snapshot（读题读控件）→ LLM 生成操作序列 →
 * 逐条执行（fill/select/check/click）→ snapshot 验证（成功页）→ close
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)

const STEP_TIMEOUT = 30_000

async function run(args: string[]): Promise<string> {
  const { stdout } = await exec('agent-browser', args, { timeout: STEP_TIMEOUT })
  return stdout
}

/** 执行一次问卷填写（单个 agent——串行隔离）——返回结果 JSON 字符串 */
export async function fillSurvey(opts: {
  url: string
  personaName: string
  persona: string
  chat: (messages: Array<{ role: string; content: string }>) => Promise<string>
}): Promise<{ submitted: boolean; answers: string; verified: boolean; error?: string }> {
  const { url, personaName, persona, chat } = opts
  try {
    // 1. 打开问卷（带 agent 标识——可区分）——页面加载等待（串行第二个
    //    agent 的竞态：close 后浏览器会话未就绪——open 导航失败空页——
    //    真实事故——空页重试 open 一次）
    const openUrl = `${url}${url.includes('?') ? '&' : '?'}s=${encodeURIComponent(personaName)}`
    await run(['open', openUrl])
    await run(['wait', '800'])
    // 2. 快照（读题 + 控件 ref——空页重试 open + 快照）
    let snap = await run(['snapshot'])
    if (snap.trim().length < 60) {
      await run(['wait', '1200'])
      await run(['open', openUrl])
      await run(['wait', '1200'])
      snap = await run(['snapshot'])
    }
    // 3. LLM 生成操作序列（按人设作答——空/非法重试一次——偶发返回 [] 防护）
    const sysMsg = `你是问卷填写助手，代表「${personaName}」填写问卷。\n人设：${persona || '（无——保持中立）'}\n根据页面快照的题目与控件 ref，以该身份的视角作答。\n输出 JSON 操作序列（不要输出其他内容）：\n[{"action":"fill","ref":"@eN","value":"答案"},{"action":"select","ref":"@eN","value":"选项"},{"action":"check","ref":"@eN"},{"action":"click","ref":"@eN"}]\naction 可选：fill（文本输入）/select（下拉选择）/check（勾选）/click（点击提交按钮）。注意：所有可填控件都要作答；最后一条是点击提交按钮。`
    const genOps = async (): Promise<Array<{ action: string; ref?: string; value?: string }>> => {
      const raw = await chat([
        { role: 'system', content: sysMsg },
        { role: 'user', content: `页面快照：\n${snap.slice(0, 6000)}` },
      ])
      if (!raw.trim()) console.error('[browse] chat 返回空')
      const cleaned = raw.replace(/```json|```/g, '').trim()
      if (!cleaned) return []
      try {
        const parsed = JSON.parse(cleaned)
        return Array.isArray(parsed) ? parsed : []
      } catch { return [] }
    }
    let ops = await genOps()
    if (ops.length === 0) {
      console.error('[browse] 首次生成空——快照长度:', snap.length, '快照头:', snap.slice(0, 80).replace(/\n/g, ' '))
      ops = await genOps()
    }
    if (ops.length === 0) {
      console.error('[browse] 重试仍空——快照长度:', snap.length)
      return { submitted: false, answers: '', verified: false, error: '问卷助手未能生成填写操作（快照解析失败）' }
    }
    // 4. 逐条执行
    for (const op of ops) {
      const ref = op.ref ?? ''
      switch (op.action) {
        case 'fill': await run(['fill', ref, String(op.value ?? '')]); break
        case 'select': await run(['select', ref, String(op.value ?? '')]); break
        case 'check': await run(['check', ref]); break
        case 'uncheck': await run(['uncheck', ref]); break
        case 'click': await run(['click', ref]); break
      }
    }
    // 5. 验证（成功页——等待提交后跳转）
    await run(['wait', '1500'])
    const after = await run(['snapshot'])
    const verified = after.includes('已提交') || after.includes('感谢')
    // 6. 关闭会话（--all——串行隔离——防残留会话影响下一个 agent）
    await run(['close', '--all']).catch(() => {})
    return { submitted: true, answers: JSON.stringify(ops), verified, error: verified ? undefined : '提交后未检测到成功页' }
  } catch (e) {
    await run(['close', '--all']).catch(() => {})
    return { submitted: false, answers: '', verified: false, error: String((e as Error).message).slice(0, 300) }
  }
}
