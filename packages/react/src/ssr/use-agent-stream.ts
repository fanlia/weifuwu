import { useState, useCallback, useRef } from 'react'
import { useWebsocket } from './use-websocket.ts'

export interface AgentStreamState {
  streams: Record<number, string>
  streaming: boolean
  activeAgents: Set<number>
}

export interface UseAgentStreamOptions {
  wsPath: string
  channelId: number
  onStreamEnd?: (agentId: number, fullText: string) => void
  onError?: (agentId: number, error: string) => void
}

export interface UseAgentStreamReturn {
  stream: AgentStreamState
  getAgentText: (agentId: number) => string
  isAgentStreaming: (agentId: number) => boolean
}

export function useAgentStream(opts: UseAgentStreamOptions): UseAgentStreamReturn {
  const { wsPath, onStreamEnd, onError } = opts

  const [streams, setStreams] = useState<Record<number, string>>({})
  const activeRef = useRef<Set<number>>(new Set())
  const streamsRef = useRef<Record<number, string>>({})

  const getAgentText = useCallback((agentId: number) => streams[agentId] || '', [streams])
  const isAgentStreaming = useCallback((agentId: number) => activeRef.current.has(agentId), [])
  const streaming = activeRef.current.size > 0

  useWebsocket(wsPath, {
    onMessage: (raw: string) => {
      try {
        const msg = JSON.parse(raw)
        if (
          msg.type !== 'agent_stream' &&
          msg.type !== 'agent_stream_end' &&
          msg.type !== 'agent_error'
        )
          return

        const agentId = msg.data?.agent_id
        if (agentId === undefined || agentId === null) return

        switch (msg.type) {
          case 'agent_stream': {
            activeRef.current.add(agentId)
            const token = msg.data?.token || ''
            streamsRef.current[agentId] = (streamsRef.current[agentId] || '') + token
            setStreams({ ...streamsRef.current })
            break
          }
          case 'agent_stream_end': {
            activeRef.current.delete(agentId)
            const fullText = streamsRef.current[agentId] || ''
            onStreamEnd?.(agentId, fullText)
            break
          }
          case 'agent_error': {
            activeRef.current.delete(agentId)
            delete streamsRef.current[agentId]
            onError?.(agentId, msg.data?.error || 'Unknown error')
            break
          }
        }
      } catch {
        // ignore non-stream messages
      }
    },
    reconnect: { maxRetries: 10, delay: 3000 },
  })

  return {
    stream: { streams, streaming, activeAgents: activeRef.current },
    getAgentText,
    isAgentStreaming,
  }
}
