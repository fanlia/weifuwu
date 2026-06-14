import { useState, useRef, useEffect } from 'react'

interface ToolCallEvent {
  toolName: string
  input: unknown
}
interface ToolResultEvent {
  toolName: string
  output: unknown
}
interface SessionItem {
  id: number
  title: string
  created_at?: string
}
interface MessageItem {
  role: string
  content: string
  toolCalls?: ToolCallEvent[]
  toolResults?: ToolResultEvent[]
}

function formatDate(s: string) {
  const d = new Date(s)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function firstLine(text: string) {
  return text.split('\n')[0].slice(0, 48) || 'Empty'
}

export default function Page() {
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [currentId, setCurrentId] = useState<number | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const textRef = useRef('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/opencode/sessions')
      .then((r) => r.json())
      .then(setSessions)
      .catch(() => {})
  }, [])
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  async function createSession() {
    setError('')
    const res = await fetch('/opencode/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!res.ok) {
      setError('Failed')
      return
    }
    const s = await res.json()
    setSessions((p) => [s, ...p])
    setCurrentId(s.id)
    setMessages([])
    setStreaming('')
    textRef.current = ''
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  async function selectSession(id: number) {
    abortRef.current?.abort()
    setCurrentId(id)
    setStreaming('')
    textRef.current = ''
    const res = await fetch(`/opencode/sessions/${id}`)
    if (!res.ok) {
      setError('Failed to load')
      return
    }
    const { messages: msgs } = (await res.json()) as any
    setMessages(
      msgs.map((m: any) => ({
        role: m.role,
        content: m.content || '',
        toolCalls: Array.isArray(m.tool_calls) ? m.tool_calls : undefined,
        toolResults: Array.isArray(m.tool_results) ? m.tool_results : undefined,
      })),
    )
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  function deleteSession(e: React.MouseEvent, id: number) {
    e.stopPropagation()
    fetch('/opencode/sessions/' + id, { method: 'DELETE' })
    setSessions((p) => p.filter((s) => s.id !== id))
    if (currentId === id) {
      setCurrentId(null)
      setMessages([])
    }
  }

  async function sendMessage() {
    const content = input.trim()
    if (!content || !currentId || loading) return
    setError('')
    setMessages((p) => [...p, { role: 'user', content }])
    setInput('')
    setLoading(true)
    setStreaming('')
    textRef.current = ''
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`/opencode/sessions/${currentId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      })
      if (!res.ok) {
        setError('Request failed')
        setLoading(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) continue
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            switch (d.type) {
              case 'text-delta':
                textRef.current += d.text || ''
                setStreaming(textRef.current)
                break
              case 'tool-call':
                setMessages((p) => {
                  const last = p[p.length - 1]
                  if (last?.role === 'assistant') {
                    const tcs = last.toolCalls || []
                    return [
                      ...p.slice(0, -1),
                      { ...last, toolCalls: [...tcs, { toolName: d.toolName, input: d.input }] },
                    ]
                  }
                  return [
                    ...p,
                    {
                      role: 'assistant',
                      content: '',
                      toolCalls: [{ toolName: d.toolName, input: d.input }],
                    },
                  ]
                })
                break
              case 'tool-result':
                setMessages((p) => {
                  const last = p[p.length - 1]
                  if (last?.role === 'assistant') {
                    const trs = last.toolResults || []
                    return [
                      ...p.slice(0, -1),
                      {
                        ...last,
                        toolResults: [...trs, { toolName: d.toolName, output: d.output }],
                      },
                    ]
                  }
                  return [
                    ...p,
                    {
                      role: 'assistant',
                      content: '',
                      toolResults: [{ toolName: d.toolName, output: d.output }],
                    },
                  ]
                })
                break
              case 'finish': {
                const finalContent = textRef.current
                setMessages((p) => {
                  const last = p[p.length - 1]
                  if (last?.role === 'assistant' && !last.content && finalContent) {
                    return [...p.slice(0, -1), { ...last, content: finalContent }]
                  }
                  if (last?.role === 'assistant' && last.content) return p
                  return [...p, { role: 'assistant', content: finalContent }]
                })
                setStreaming('')
                textRef.current = ''
                setLoading(false)
                setTimeout(() => inputRef.current?.focus(), 50)
                return
              }
            }
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') setError(e.message || 'Error')
    }
    setLoading(false)
  }

  return (
    <div className="flex h-screen font-sans antialiased bg-zinc-950 text-zinc-100">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-zinc-800 bg-zinc-900/50 shrink-0">
        <div className="p-3 border-b border-zinc-800">
          <button
            onClick={createSession}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Chat
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {sessions.length === 0 && (
            <div className="text-xs text-zinc-600 text-center py-8">No sessions yet</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => selectSession(s.id)}
              className={`group flex items-center gap-2 p-2 rounded-lg cursor-pointer text-sm transition-colors ${
                currentId === s.id
                  ? 'bg-zinc-700/60 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200'
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0 opacity-60"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                />
              </svg>
              <span className="truncate flex-1">{s.title || `Session ${s.id}`}</span>
              <button
                onClick={(e) => deleteSession(e, s.id)}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-zinc-600 transition-all cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        {currentId && (
          <header className="flex items-center gap-2 px-5 py-2.5 border-b border-zinc-800 bg-zinc-900/30">
            <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-xs text-zinc-500 font-mono">opencode</span>
            <span className="text-xs text-zinc-600 mx-1">/</span>
            <span className="text-sm text-zinc-300 truncate">
              {sessions.find((s) => s.id === currentId)?.title || `Session ${currentId}`}
            </span>
          </header>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
            {!currentId && (
              <div className="flex flex-col items-center justify-center h-[70vh] text-zinc-600">
                <svg
                  className="w-12 h-12 mb-4 opacity-40"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                <p className="text-sm mb-2">Select a session or create a new one</p>
                <button
                  onClick={createSession}
                  className="mt-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm transition-colors cursor-pointer"
                >
                  + New Chat
                </button>
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 leading-relaxed whitespace-pre-wrap text-sm ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-br-md'
                      : 'bg-zinc-800/80 text-zinc-200 rounded-bl-md border border-zinc-700/50'
                  }`}
                >
                  {m.content || <span className="text-zinc-500 italic">No response</span>}
                  {m.toolCalls?.map((tc, j) => (
                    <details
                      key={j}
                      className="mt-2 rounded-lg overflow-hidden bg-black/20 border border-zinc-700/50"
                    >
                      <summary className="px-3 py-1.5 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 select-none flex items-center gap-1.5">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        {tc.toolName}
                      </summary>
                      <pre className="px-3 py-2 text-xs text-zinc-400 overflow-x-auto">
                        {JSON.stringify(tc.input, null, 2)}
                      </pre>
                    </details>
                  ))}
                  {m.toolResults?.map((tr, j) => (
                    <details
                      key={j}
                      className="mt-1.5 rounded-lg overflow-hidden bg-black/20 border border-zinc-700/50"
                    >
                      <summary className="px-3 py-1.5 text-xs text-zinc-400 cursor-pointer hover:text-zinc-200 select-none flex items-center gap-1.5">
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        {tr.toolName} result
                      </summary>
                      <pre className="px-3 py-2 text-xs text-zinc-400 overflow-x-auto max-h-48">
                        {JSON.stringify(tr.output, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            ))}

            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[75%] rounded-2xl px-4 py-2.5 bg-zinc-800/80 text-zinc-200 rounded-bl-md border border-zinc-700/50 leading-relaxed whitespace-pre-wrap text-sm">
                  {streaming}
                  <span className="inline-block w-1.5 h-4 bg-indigo-400 ml-0.5 animate-pulse rounded-sm" />
                </div>
              </div>
            )}

            {loading && !streaming && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 px-4 py-3 bg-zinc-800/60 rounded-2xl rounded-bl-md border border-zinc-700/40">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: '0ms' }}
                    />
                    <span
                      className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce"
                      style={{ animationDelay: '300ms' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-center">
                <div className="flex items-center gap-2 px-4 py-2 bg-red-900/30 text-red-400 rounded-lg text-xs border border-red-800/40">
                  <svg
                    className="w-4 h-4 shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  {error}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800 bg-zinc-900/50">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <div className="flex items-end gap-2 bg-zinc-800/80 rounded-xl border border-zinc-700/50 px-3 py-2 focus-within:border-zinc-500 transition-colors">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder={currentId ? 'Type a message...' : 'Create a session first'}
                disabled={!currentId || loading}
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 outline-none resize-none disabled:opacity-40"
              />
              <button
                onClick={sendMessage}
                disabled={!currentId || loading || !input.trim()}
                className="flex items-center justify-center p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white transition-colors cursor-pointer disabled:cursor-default shrink-0"
              >
                {loading ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 19V5m0 0l-7 7m7-7l7 7"
                    />
                  </svg>
                )}
              </button>
            </div>
            {currentId && (
              <p className="text-[10px] text-zinc-600 text-center mt-1.5">Enter to send</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
