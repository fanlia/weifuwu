import { useState } from 'react'
import { Link } from 'weifuwu/react'

function Counter() {
  const [count, setCount] = useState(0)
  return (
    <div className="rounded-lg border border-gray-200 p-6 text-center">
      <h3 className="font-semibold mb-2">🧮 Client Hydration</h3>
      <p className="text-gray-500 text-sm mb-4">useState — rendered on server, interactive after hydration</p>
      <div className="text-5xl font-bold tabular-nums my-4">{count}</div>
      <div className="flex gap-2 justify-center">
        <button onClick={() => setCount(c => c - 1)} className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">−</button>
        <button onClick={() => setCount(0)} className="px-4 py-2 rounded-md border border-gray-300 bg-white hover:bg-gray-50 cursor-pointer">Reset</button>
        <button onClick={() => setCount(c => c + 1)} className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">+</button>
      </div>
    </div>
  )
}

function FeatureCard({ href, title, desc, tag }: { href: string; title: string; desc: string; tag: string }) {
  return (
    <Link href={href} className="block rounded-lg border border-gray-200 p-5 no-underline hover:border-blue-300 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">{tag}</span>
      </div>
      <p className="text-sm text-gray-600">{desc}</p>
    </Link>
  )
}

export default function Home() {
  return (
    <div>
      <title>weifuwu — React SSR Example</title>
      <meta name="description" content="Full-featured weifuwu React SSR demo with file-based routing, streaming SSR, and more" />

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">weifuwu React SSR</h1>
        <p className="text-gray-600">File-based routing · Nested layouts · Streaming SSR · Zero-config Tailwind</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <FeatureCard href="/users" title="Users + Form" desc="Loader function, useServerData, POST form" tag="data" />
        <FeatureCard href="/users/1" title="Dynamic Route" desc="URL param matching + HttpError handling" tag="routing" />
        <FeatureCard href="/admin/dashboard" title="Nested Route" desc="Multi-level directory → URL hierarchy" tag="routing" />
        <FeatureCard href="/error" title="ErrorBoundary" desc="Catch render errors, show fallback UI" tag="error" />
        <FeatureCard href="/streaming" title="Streaming SSR" desc="Suspense boundaries, progressive HTML" tag="react19" />
        <FeatureCard href="/api/hello" title="API Route" desc="JSON endpoint alongside page routes" tag="api" />
      </div>

      <Counter />
    </div>
  )
}
