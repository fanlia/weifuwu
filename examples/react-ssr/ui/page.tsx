import { useState } from 'react'

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div className="rounded-lg border border-gray-200 p-6 text-center">
      <h2 className="text-xl font-semibold mb-4">🧮 Counter Demo</h2>
      <p className="text-gray-600 mb-4">Live useState counter — clicks update state on the client.</p>
      <div className="text-6xl font-bold tabular-nums my-6">{count}</div>
      <div className="flex gap-2 justify-center">
        <button onClick={() => setCount(c => c - 1)} className="px-6 py-2 text-lg rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">−</button>
        <button onClick={() => setCount(0)} className="px-6 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">Reset</button>
        <button onClick={() => setCount(c => c + 1)} className="px-6 py-2 text-lg rounded-md bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">+</button>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <div>
      <title>weifuwu — React SSR</title>
      <meta name="description" content="Web-standard HTTP framework with React server-side rendering" />
      <h1 className="text-3xl font-bold mb-2">weifuwu React SSR</h1>
      <p className="text-gray-600 mb-8">Web-standard HTTP framework with React server-side rendering.</p>
      <div className="rounded-lg border border-gray-200 p-6 mb-4">
        <h2 className="text-xl font-semibold mb-3">Core</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li><code className="bg-gray-100 px-1 rounded">ctx.render('./ui')</code> — render directory to HTML</li>
          <li><code className="bg-gray-100 px-1 rounded">useServerData()</code> — typed loader data</li>
        </ul>
      </div>
      <div className="rounded-lg border border-gray-200 p-6 mb-4 bg-blue-50">
        <h2 className="text-xl font-semibold mb-3">Try it out</h2>
        <ol className="list-decimal pl-5 space-y-1 text-gray-700">
          <li><a href="/users">Users</a> — data + Form submit</li>
          <li><a href="/admin/dashboard">Dashboard</a> — nested routes</li>
          <li><a href="/error">ErrorBoundary</a> — error handling</li>
          <li><a href="/streaming">Streaming</a> — Suspense SSR</li>
          <li><a href="/api/hello">API</a> — plain JSON route</li>
        </ol>
      </div>
      <Counter />
    </div>
  )
}
