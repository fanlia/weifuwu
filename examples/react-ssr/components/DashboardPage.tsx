export function DashboardPage() {
  return (
    <div className="border-2 border-red-500 rounded-lg p-4">
      <div className="text-red-500 font-bold mb-4">🔒 Admin Area</div>
      <div>
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600 mb-2">
          Rendered with <code className="bg-gray-100 px-1 rounded">renderStream()</code> — chunks
          arrive progressively to the browser.
        </p>
        <p className="text-gray-600 mb-4">
          This area uses a nested AdminLayout via{' '}
          <code className="bg-gray-100 px-1 rounded">Router.mount()</code>.
        </p>
        <div className="rounded-lg border border-gray-200 p-6 mb-4">
          <h2 className="text-xl font-semibold mb-3">Streaming SSR Stats</h2>
          <ul className="list-disc pl-5 space-y-1 text-gray-700">
            <li>Users: 42</li>
            <li>Posts: 128</li>
            <li>Comments: 512</li>
          </ul>
        </div>
        <div className="rounded-lg border border-gray-200 p-6 bg-blue-50">
          <h2 className="text-xl font-semibold mb-3">How it works</h2>
          <ol className="list-decimal pl-5 space-y-1 text-gray-700">
            <li>Server starts rendering the React tree</li>
            <li>Sends HTML chunks as they become available</li>
            <li>Browser renders progressively — no waiting for the full page</li>
            <li>
              <strong>Check: </strong>
              <code className="bg-gray-100 px-1 rounded">
                curl -sI http://localhost:3456/admin/dashboard | grep transfer-encoding
              </code>
            </li>
          </ol>
        </div>
      </div>
    </div>
  )
}
