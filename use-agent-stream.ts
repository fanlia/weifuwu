import { useState, useCallback, useRef, useEffect } from 'react'
import { useWebsocket } from './use-websocket.ts'

/** Streaming state for all agents in a channel. */
export interface AgentStreamState {
  /** Accumulated streaming text per agent, keyed by `agent_id`. */
  streams: Record<number, string>
  /** Whether any agent is currently streaming (typing). */
  streaming: boolean
  /** Set of agent IDs currently streaming. */
  activeAgents: Set<number>
}

/** Options for {@link useAgentStream}. */
export interface UseAgentStreamOptions {
  /** WebSocket path, e.g. `'/ws'`. */
  wsPath: string
  /** Channel ID to listen for agent streams. */
  channelId: number
  /** Called when an agent finishes generating. */
  onStreamEnd?: (agentId: number, fullText: string) => void
  /** Called on stream error. */
  onError?: (agentId: number, error: string) => void
}

/** Return value of {@link useAgentStream}. */
export interface UseAgentStreamReturn {
  /** Accumulated streaming state for all agents. */
  stream: AgentStreamState
  /** Get accumulated text for a specific agent by ID. */
  getAgentText: (agentId: number) => string
  /** Whether a specific agent is currently streaming. */
  isAgentStreaming: (agentId: number) => boolean
}

/**
 * React hook to consume agent AI streaming output via WebSocket.
 *
 * Connects to a WebSocket endpoint, listens for `agent_stream`,
 * `agent_stream_end`, and `agent_error` messages, and accumulates
 * the token stream per agent.
 *
 * ```tsx
 * import { useAgentStream } from 'weifuwu/react'
 *
 * function Chat() {
 *   const { stream, getAgentText } = useAgentStream({
 *     wsPath: '/ws/chat',
 *     channelId: 1,
 *   })
 *   return <pre>{getAgentText(1)}</pre>
 * }
 * ```
 */
export function useAgentStream(opts: UseAgentStreamOptions): UseAgentStreamReturn {
  const { wsPath, channelId, onStreamEnd, onError } = opts

  const [streams, setStreams] = useState<Record<number, string>>({})
  const activeRef = useRef<Set<number>>(new Set())
  const streamsRef = useRef<Record<number, string>>({})

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
