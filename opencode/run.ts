import { streamText, stepCountIs, type LanguageModel, type Tool } from 'ai'
import { addTextMessage, addToolMessages, type SessionMessage } from './session.ts'

export interface ExecuteOptions {
  sessionId: string
  input: string
  model: LanguageModel
  tools: Record<string, Tool>
  systemPrompt: string
  messages: SessionMessage[]
  sql: any
  abortSignal?: AbortSignal
}

export async function* executeGenerator(opts: ExecuteOptions): AsyncGenerator<any, void, unknown> {
  const { sessionId, input, model, tools, systemPrompt, messages, sql, abortSignal } = opts

  const lastStepToolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> = []
  let currentAssistantText = ''
  let currentUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

  const result = streamText({
    model,
    system: systemPrompt,
    messages: [
      ...messages.map((m) => {
        if (m.role === 'user') return { role: 'user' as const, content: m.content ?? '' }
        if (m.role === 'assistant') return { role: 'assistant' as const, content: m.content ?? '' }
        return { role: 'user' as const, content: '' }
      }),
      { role: 'user' as const, content: input },
    ] as any,
    tools: tools as any,
    stopWhen: stepCountIs(25),
    abortSignal,
    onStepFinish: async (step: any) => {
      lastStepToolCalls.length = 0
      for (const tc of step.toolCalls) {
        lastStepToolCalls.push({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          args: tc.input as unknown,
        })
      }
      if (step.toolResults.length > 0) {
        try {
          await addToolMessages(sql, sessionId, lastStepToolCalls, step.toolResults)
        } catch (e) {
          console.error('[opencode] save tool messages failed:', e)
        }
      }
    },
    onFinish: async (result: any) => {
      currentAssistantText = result.text ?? ''
      currentUsage = {
        promptTokens: result.usage?.inputTokens ?? 0,
        completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
      }
      try {
        await addTextMessage(
          sql,
          sessionId,
          'assistant',
          currentAssistantText,
          currentUsage.promptTokens,
          currentUsage.completionTokens,
        )
      } catch (e) {
        console.error('[opencode] save message failed:', e)
      }
    },
  })

  for await (const event of result.fullStream) {
    yield event
  }
}
