

export function ErrorDemoPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">ErrorBoundary</h1>
      <p className="text-gray-600 mb-4">
        ErrorBoundary catches render errors on the client after hydration.
      </p>

      <div className="rounded-lg border border-gray-200 p-6 mb-4 bg-yellow-50">
        <h2 className="text-xl font-semibold mb-3">Usage</h2>
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
          {`import { ErrorBoundary } from "weifuwu/react"

<ErrorBoundary fallback={<ErrorFallback />}>
  <UserProfile />
</ErrorBoundary>`}
        </pre>
        <p className="mt-3 text-gray-700">
          When UserProfile throws (client-side), ErrorFallback renders instead.
        </p>
        <p className="mt-2 text-gray-700">
          <strong>SSR:</strong>
          {' React server renderers propagate errors upward. Use '}
          <code className="bg-gray-100 px-1 rounded">app.onError()</code>
          {' for server-side error pages, ErrorBoundary for client-side isolation.'}
        </p>
      </div>

      <p className="text-gray-700 mb-4">
        The <a href="/users/1">User Detail page</a> is wrapped in ErrorBoundary — if user
        data causes a render error, the fallback shows.
      </p>
      <a href="/" className="text-blue-600 no-underline hover:underline">
        ← Go home
      </a>
    </div>
  )
}
