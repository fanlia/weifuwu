import { useState } from 'react'
import { useWebsocket } from 'weifuwu/react'

export default function Home() {
  const [input, setInput] = useState("")
  const { send, lastMessage, readyState } = useWebsocket("/ws/echo")

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-2">Hello, Weifuwu!</h1>
      <p className="text-gray-600 mb-6">
        Welcome to your weifuwu application.
      </p>
      <div className="border rounded-lg p-4 space-y-3">
        <p className="text-sm text-gray-500">
          WebSocket: {readyState === 1 ? "Connected" : readyState === 0 ? "Connecting..." : "Disconnected"}
        </p>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { send(input); setInput("") } }}
            placeholder="Type a message..."
            className="flex-1 border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() => { send(input); setInput("") }}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
          >
            Send
          </button>
        </div>
        {lastMessage && (
          <div className="text-sm bg-gray-50 rounded p-2">
            <span className="font-medium">Echo:</span> {lastMessage}
          </div>
        )}
      </div>
    </div>
  )
}
