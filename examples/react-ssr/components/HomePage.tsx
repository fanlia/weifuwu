import { Counter } from './Counter.tsx'

export function HomePage() {
  return (
    <div>
      <title>weifuwu — React SSR</title>
      <meta name="description" content="Web-standard HTTP framework with React server-side rendering" />
      <h1 className="text-3xl font-bold mb-2">weifuwu React SSR</h1>
      <p className="text-gray-600 mb-8">Web-standard HTTP framework with React server-side rendering.</p>
      <div className="rounded-lg border border-gray-200 p-6 mb-4">
        <h2 className="text-xl font-semibold mb-3">Core</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li><code className="bg-gray-100 px-1 rounded">ctx.render()</code> — render .tsx to HTML</li>
          <li><code className="bg-gray-100 px-1 rounded">useServerData()</code> — typed data, shared server &amp; client</li>
        </ul>
      </div>
      <div className="rounded-lg border border-gray-200 p-6 mb-4 bg-blue-50">
        <h2 className="text-xl font-semibold mb-3">Try it out</h2>
        <ol className="list-decimal pl-5 space-y-1 text-gray-700">
          <li><a href="/users">Users</a> — data + Form submit</li>
          <li><a href="/admin/dashboard">Dashboard</a> — nested routes</li>
          <li><a href="/error">ErrorBoundary</a> — error handling</li>
          <li><a href="/api/hello">API</a> — plain JSON route</li>
        </ol>
      </div>
      <Counter />
    </div>
  )
}
