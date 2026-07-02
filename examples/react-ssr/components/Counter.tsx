import { useState } from 'react'

export function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div className="rounded-lg border border-gray-200 p-6 text-center">
      <h2 className="text-xl font-semibold mb-4">🧮 Counter Demo</h2>
      <p className="text-gray-600 mb-4">
        Live useState counter — server renders initial count (0), client handles clicks.
      </p>
      <div className="text-6xl font-bold tabular-nums my-6">{count}</div>
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setCount(c => c - 1)}
          className="px-6 py-2 text-lg rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
        >
          −
        </button>
        <button
          onClick={() => setCount(0)}
          className="px-6 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer transition-colors"
        >
          Reset
        </button>
        <button
          onClick={() => setCount(c => c + 1)}
          className="px-6 py-2 text-lg rounded-md bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors"
        >
          +
        </button>
      </div>
      <p className="text-gray-500 text-sm mt-4">
        SSR renders the initial count. After hydration, clicks update state on the client.
      </p>
    </div>
  )
}
