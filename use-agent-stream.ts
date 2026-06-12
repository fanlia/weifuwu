import { useState, useCallback, useRef, useEffect } from 'react'
import { useWebsocket } from './use-websocket.ts'

export interface AgentStreamState {
  /** Accumulated streaming text per agent, keyed by agent_id */
  streams: Record<number, string>
  /** Whether any agent is currently streaming (typing) */
  streaming: boolean
  /** Set of agent IDs currently streaming */
  activeAgents: Set<number>
}

export interface UseAgentStreamOptions {
  /** WebSocket path, e.g. '/ws' */
  wsPath: string
  /** Channel ID to listen for agent streams */
  channelId: number
  /** Called when a stream finishes (agent done generating) */
  onStreamEnd?: (agentId: number, fullText: string) => void
  /** Called on stream error */
  onError?: (agentId: number, error: string) => void
}

export interface UseAgentStreamReturn {
  /** Accumulated streaming state */
  stream: AgentStreamState
  /** Get accumulated text for a specific agent */
  getAgentText: (agentId: number) => string
  /** Whether a specific agent is currently streaming */
  isAgentStreaming: (agentId: number) => boolean
}

export function useAgentStream(opts: UseAgentStreamOptions): UseAgentStreamReturn {
  const { wsPath, channelId, onStreamEnd, onError } = opts

  const [streams, setStreams] = useState<Record<number, string>>({})
  const activeRef = useRef<Set<number>>(new Set())

  const getAgentText = useCallback(
    (agentId: number) => streams[agentId] || '',
    [streams],
  )

  const isAgentStreaming = useCallback(
    (agentId: number) => activeRef.current.has(agentId),
    [],
  )

  const streaming = activeRef.current.size > 0

  useWebsocket(wsPath, {
    onMessage: (raw: string) => {
      try {
        const msg = JSON.parse(raw)
        if (msg.type !== 'agent_stream' && msg.type !== 'agent_stream_end' && msg.type !== 'agent_error') return

        const agentId = msg.data?.agent_id
        if (agentId === undefined || agentId === null) return

        // Check if this message is for our channel (the WS broadcasts all channels)
        // Agent stream messages are scoped to the hub channel

        switch (msg.type) {
          case 'agent_stream': {
            activeRef.current.add(agentId)
            const token = msg.data?.token || ''
            setStreams(prev => {
              const current = prev[agentId] || ''
              return { ...prev, [agentId]: current + token }
            })
            break
          }
          case 'agent_stream_end': {
            activeRef.current.delete(agentId)
            const fullText = streams[agentId] || ''
            onStreamEnd?.(agentId, fullText)
            break
          }
          case 'agent_error': {
            activeRef.current.delete(agentId)
            onError?.(agentId, msg.data?.error || 'Unknown error')
            break
          }
        }
      } catch {
        // Not JSON or not a stream message — ignore
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
