import type { Sql } from '../vendor.ts'
import type { AgentModule } from '../agent/types.ts'
import type { Hub } from '../hub.ts'

export async function runAgentRouting(
  sql: Sql<{}>,
  messages: { insert: (data: any) => Promise<any> },
  agents: AgentModule | undefined,
  hub: Hub,
  channelId: number,
  content: string,
) {
  if (!agents) return

  const agentMembers = await sql`
    SELECT member_id FROM "_channel_members"
    WHERE channel_id = ${channelId} AND member_type = 'agent'
  ` as any[]

  for (const am of agentMembers) {
    agents.run(am.member_id, { input: content, stream: false }).then(result => {
      if ('output' in result && result.output) {
        messages.insert({
          channel_id: channelId,
          sender_id: am.member_id,
          sender_type: 'agent',
          content: result.output,
        }).then((r: any) => {
          hub.broadcast(`messager:${channelId}`, { type: 'message', data: r })
        }).catch((e: Error) => {
          console.error('[messager] agent reply insert failed:', e)
        })
      }
    }).catch((e: Error) => {
      console.error('[messager] agent run failed:', e)
    })
  }
}
