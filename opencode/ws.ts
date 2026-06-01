import type { WebSocket } from 'ws'
import type { LanguageModel } from 'ai'
import type { Context } from '../types.ts'
import type { PendingQuestion, SkillDef } from './types.ts'
import { createSession, getSession, getHistory, addTextMessage } from './session.ts'
import { executeGenerator } from './run.ts'
import { buildSystemPrompt } from './prompt.ts'
import { createTools, type ToolContext } from './tools/index.ts'
import type { OpencodePermissions } from './types.ts'

interface WsDeps {
  sql: any
  model: LanguageModel
  workspace: string
  systemPrompt?: string
  skills: SkillDef[]
  permissions?: OpencodePermissions
  pendingQuestions: Map<string, PendingQuestion>
}

// Per-connection state
const clients = new WeakMap<WebSocket, {
  abortController?: AbortController
  currentSessionId?: number
  userId: number
}>()

export function createWSHandler(deps: WsDeps) {
  const { sql, model, workspace, systemPrompt, skills, permissions, pendingQuestions } = deps

  return {
    open(ws: WebSocket, ctx: Context) {
      const userId = (ctx as any).user?.id ?? 0
      clients.set(ws, { userId })
    },

    async message(ws: WebSocket, ctx: Context, data: string | Buffer) {
      const client = clients.get(ws)
      if (!client) return

      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON' }))
        return
      }

      switch (msg.type) {
        case 'create': {
          try {
            const session = await createSession(sql, {
              userId: client.userId,
              title: msg.title,
              model: msg.model,
              workspace: msg.workspace || workspace,
              systemPrompt: msg.systemPrompt || systemPrompt,
            })
            ws.send(JSON.stringify({ type: 'session_created', session }))
          } catch (e: any) {
            ws.send(JSON.stringify({ type: 'error', error: e.message }))
          }
          break
        }

        case 'message': {
          const { session_id, content } = msg
          if (!session_id || !content) {
            ws.send(JSON.stringify({ type: 'error', error: 'Missing session_id or content' }))
            return
          }

          // Cancel previous request
          client.abortController?.abort()
          const controller = new AbortController()
          client.abortController = controller
          client.currentSessionId = session_id

          try {
            const session = await getSession(sql, session_id)
            if (!session) {
              ws.send(JSON.stringify({ type: 'error', error: 'Session not found' }))
              return
            }

            const toolCtx: ToolContext = {
              workspace: session.workspace || workspace,
              permissions,
              pendingQuestions,
            }
            const tools = createTools(toolCtx)
            const allSkills = [...skills]
            const sysPrompt = buildSystemPrompt({
              workspace: session.workspace || workspace,
              model: session.model,
              skills: allSkills,
              systemPrompt: session.system_prompt || systemPrompt,
            })

            const history = await getHistory(sql, session_id)

            // Save user message
            await addTextMessage(sql, session_id, 'user', content)

            // Execute
            const stream = executeGenerator({
              sessionId: session_id,
              input: content,
              model,
              tools,
              systemPrompt: sysPrompt,
              messages: history,
              sql,
              abortSignal: controller.signal,
            })

            for await (const event of stream) {
              try {
                ws.send(JSON.stringify(event))
              } catch {
                controller.abort()
                break
              }
            }
          } catch (e: any) {
            if (e.name !== 'AbortError') {
              ws.send(JSON.stringify({ type: 'error', error: e.message }))
            }
          }
          break
        }

        case 'answer': {
          const { question_id, answer } = msg
          if (question_id && pendingQuestions.has(question_id)) {
            const pq = pendingQuestions.get(question_id)!
            pendingQuestions.delete(question_id)
            pq.resolve(answer)
          }
          break
        }

        case 'cancel': {
          client.abortController?.abort()
          break
        }
      }
    },

    close(ws: WebSocket) {
      const client = clients.get(ws)
      if (client) {
        client.abortController?.abort()
        clients.delete(ws)
      }
    },

    error(ws: WebSocket, _ctx: Context, _err: Error) {
      const client = clients.get(ws)
      if (client) {
        client.abortController?.abort()
        clients.delete(ws)
      }
    },
  }
}
