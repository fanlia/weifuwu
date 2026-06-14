/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import type { SqlClient } from '../vendor.ts'
import type { AgentModule } from '../agent/types.ts'
import type { Hub } from '../hub.ts'

/**
 * Route a user message to all agent members in a channel.
 * - Streaming: broadcasts SSE text tokens in real-time
 * - Multi-round: passes recent channel history as conversation context
 */
export async function runAgentRouting(
  sql: SqlClient,
  messages: { insert: (data: any) => Promise<any> },
  agents: AgentModule | undefined,
  hub: Hub,
  channelId: number,
  content: string,
  stream = true,
  contextMessages = 10,
) {
  if (!agents) return

  const agentMembers = (await sql`
    SELECT member_id FROM "_channel_members"
    WHERE channel_id = ${channelId} AND member_type = 'agent'
  `) as any[]

  if (agentMembers.length === 0) return

  // ── Multi-round context: fetch recent channel messages ──────────
  let history: Array<{ role: string; content: string }> | undefined
  if (contextMessages > 0) {
    const recentRows = (await sql`
      SELECT sender_type, content FROM "_messages"
      WHERE channel_id = ${channelId}
      ORDER BY created_at DESC
      LIMIT ${contextMessages}
    `) as any[]
    if (recentRows.length > 0) {
      history = recentRows.reverse().map((row: any) => ({
        role: row.sender_type === 'agent' ? 'assistant' : 'user',
        content: row.content || '',
      }))
    }
  }

  for (const am of agentMembers) {
    const agentId = am.member_id

    if (stream) {
      // ── Streaming mode ──────────────────────────────────────────
      agents
        .run(agentId, { input: content, messages: history, stream: true })
        .then(async (result) => {
          if (!('stream' in result)) return

          const reader = result.stream.getReader()
          const decoder = new TextDecoder()
          let fullOutput = ''
          let errorMsg: string | null = null

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              // Parse SSE format: "event: type\ndata: {...}\n\n"
              const lines = chunk.split('\n')
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const event = JSON.parse(line.slice(6))
                    // Extract text from stream events
                    if (event.type === 'text-delta' && event.textDelta) {
                      fullOutput += event.textDelta
                      // Broadcast each token via hub
                      hub.broadcast(`messager:${channelId}`, {
                        type: 'agent_stream',
                        data: {
                          agent_id: agentId,
                          token: event.textDelta,
                          full: fullOutput,
                        },
                      })
                    } else if (event.type === 'error') {
                      errorMsg = event.error?.message || 'Unknown error'
                    }
                  } catch {
                    // non-JSON SSE data — skip
                  }
                }
              }
            }
          } catch (err) {
            errorMsg = (err as Error).message
          } finally {
            reader.releaseLock()
          }

          // Insert final message
          if (fullOutput) {
            try {
              const msg = await messages.insert({
                channel_id: channelId,
                sender_id: agentId,
                sender_type: 'agent',
                content: fullOutput,
              })
              hub.broadcast(`messager:${channelId}`, {
                type: 'message',
                data: msg,
              })
            } catch (e) {
              console.error('[messager] agent reply insert failed:', (e as Error).message)
            }
          }

          if (errorMsg) {
            hub.broadcast(`messager:${channelId}`, {
              type: 'agent_error',
              data: { agent_id: agentId, error: errorMsg },
            })
          }

          // Signal stream end
          hub.broadcast(`messager:${channelId}`, {
            type: 'agent_stream_end',
            data: { agent_id: agentId },
          })
        })
        .catch((e: Error) => {
          console.error('[messager] agent run failed:', e.message)
          hub.broadcast(`messager:${channelId}`, {
            type: 'agent_error',
            data: { agent_id: agentId, error: e.message },
          })
          hub.broadcast(`messager:${channelId}`, {
            type: 'agent_stream_end',
            data: { agent_id: agentId },
          })
        })
    } else {
      // ── Non-streaming mode (original behavior) ──────────────────
      agents
        .run(agentId, { input: content, messages: history, stream: false })
        .then((result) => {
          if ('output' in result && result.output) {
            messages
              .insert({
                channel_id: channelId,
                sender_id: agentId,
                sender_type: 'agent',
                content: result.output,
              })
              .then((r: any) => {
                hub.broadcast(`messager:${channelId}`, { type: 'message', data: r })
              })
              .catch((e: Error) => {
                console.error('[messager] agent reply insert failed:', e.message)
              })
          }
        })
        .catch((e: Error) => {
          console.error('[messager] agent run failed:', e.message)
        })
    }
  }
}
