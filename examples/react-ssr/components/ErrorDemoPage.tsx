export function ErrorDemoPage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-4">Error Demo</h1>
      <p className="text-gray-600 mb-4">
        This page demonstrates error handling.
      </p>
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-red-700">
          Error handling via <code className="bg-red-100 px-1 rounded">app.onError()</code>
        </p>
      </div>
    </div>
  )
}
