import { Router } from '../router.ts'
import { ssr } from '../ssr.ts'
import type { LanguageModel } from 'ai'
import type { SkillDef, SkillRegistry, OpencodePermissions, PendingQuestion } from './types.ts'
import { createSession, getSession, listSessions, deleteSession, getHistory, addTextMessage } from './session.ts'
import { executeGenerator } from './run.ts'
import { buildSystemPrompt } from './prompt.ts'
import { createTools, type ToolContext } from './tools/index.ts'
import { createSSEStream } from '../sse.ts'

interface RestDeps {
  sql: any
  model: LanguageModel
  workspace: string
  systemPrompt?: string
  skills: SkillDef[]
  skillsRegistry: SkillRegistry
  permissions?: OpencodePermissions
  pendingQuestions: Map<string, PendingQuestion>
}

export async function buildRouter(deps: RestDeps): Promise<Router> {
  const { sql, model, workspace, systemPrompt, skills, skillsRegistry, permissions, pendingQuestions } = deps
  const router = new Router()

  router.post('/sessions', async (req: Request, ctx: any) => {
    const body = await req.json().catch(() => ({}))
    const session = await createSession(sql, {
      title: body.title,
      model: body.model,
      systemPrompt: body.systemPrompt || systemPrompt,
    }, workspace, ctx.mountPath || '')
    return Response.json(session, { status: 201 })
  })

  router.get('/sessions', async () => {
    const sessions = await listSessions(sql)
    return Response.json(sessions)
  })

  router.get('/sessions/:id', async (_req: Request, ctx: any) => {
    const id = ctx.params.id
    const session = await getSession(sql, id)
    if (!session) return new Response('Not Found', { status: 404 })

    const messages = await getHistory(sql, id)
    return Response.json({ session, messages })
  })

  router.delete('/sessions/:id', async (_req: Request, ctx: any) => {
    const id = ctx.params.id
    await deleteSession(sql, id)
    return new Response(null, { status: 204 })
  })

  router.post('/sessions/:id/message', async (req: Request, ctx: any) => {
    const sessionId = ctx.params.id
    const session = await getSession(sql, sessionId)
    if (!session) return new Response('Session Not Found', { status: 404 })

    const { content } = await req.json()
    if (!content) return new Response('Missing content', { status: 400 })

    const toolCtx: ToolContext = {
      workspace: session.workspace || workspace,
      permissions,
      pendingQuestions,
      skillsRegistry: deps.skillsRegistry,
    }
    const tools = createTools(toolCtx)
    const allSkills = [...skills]
    const sysPrompt = buildSystemPrompt({
      workspace: session.workspace || workspace,
      model: session.model,
      skills: allSkills,
      systemPrompt: session.system_prompt || systemPrompt,
    })

    const history = await getHistory(sql, sessionId)
    await addTextMessage(sql, sessionId, 'user', content)

    const stream = executeGenerator({
      sessionId,
      input: content,
      model,
      tools,
      systemPrompt: sysPrompt,
      messages: history,
      sql,
    })

    return createSSEStream(stream)
  })

  try {
    const uiDir = new URL('../opencode/ui/', import.meta.url).pathname
    router.use('/', ssr({ dir: uiDir }))
  } catch (e) {
    console.warn('[opencode] UI not available:', e)
  }

  return router
}
