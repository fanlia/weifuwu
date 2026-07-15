import { useState } from 'react'
import { ErrorBoundary, Link } from 'weifuwu/react'

function BuggyCounter() {
  const [count, setCount] = useState(0)
  if (count > 3) throw new Error('Counter crashed!')
  return (
    <div className="rounded-lg border border-gray-200 p-6 text-center">
      <p className="text-gray-600 mb-2">Click + four times to trigger an error:</p>
      <div className="text-3xl font-bold mb-3">{count}</div>
      <button onClick={() => setCount(c => c + 1)} className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer">+</button>
    </div>
  )
}

export default function ErrorDemo() {
  return (
    <div>
      <title>Error Boundary Demo — weifuwu</title>
      <h1 className="text-3xl font-bold mb-4">ErrorBoundary Demo</h1>
      <p className="text-gray-600 mb-6">The counter throws on the 4th click. ErrorBoundary catches it without crashing the page.</p>

      <ErrorBoundary fallback={
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-xl font-semibold text-red-700 mb-2">⚠ Recovered!</h2>
          <p className="text-red-600">The counter crashed, but ErrorBoundary isolated the error.</p>
        </div>
      }>
        <BuggyCounter />
      </ErrorBoundary>

      <div className="rounded-lg border border-green-200 bg-green-50 p-6 mt-4">
        <p className="text-green-700">✅ This section is unaffected — ErrorBoundary isolates component errors.</p>
      </div>

      <div className="mt-8 text-sm text-gray-500">
        <p>Try it: <Link href="/error" className="text-blue-600 no-underline hover:underline">reset the demo</Link></p>
      </div>
    </div>
  )
}
