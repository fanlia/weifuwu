import { Suspense, use } from 'react'

let startTime = 0
function createDelayedPromise(ms: number, text: string): Promise<string> {
  return new Promise(r => setTimeout(() => r(text), ms))
}
function formatElapsed() { return startTime ? `${Date.now() - startTime}ms` : '...' }

function FastSection() {
  startTime = Date.now()
  return (
    <div className="rounded-lg border border-gray-200 p-6 mb-4">
      <h3 className="font-semibold mb-2">Shell Content</h3>
      <p className="text-gray-600">⚡ Rendered immediately. <span className="text-xs text-gray-400">({formatElapsed()})</span></p>
    </div>
  )
}

function SlowSection({ promise, label }: { promise: Promise<string>; label: string }) {
  const data = use(promise)
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-6 mb-4">
      <h3 className="font-semibold mb-2">{label}</h3>
      <p className="text-gray-600">{data} <span className="text-xs text-gray-400">({formatElapsed()})</span></p>
    </div>
  )
}

export default function Streaming() {
  const p1 = createDelayedPromise(1500, '🐌 Streamed after a delay!')
  const p2 = createDelayedPromise(2500, '🦥 This took even longer!')
  return (
    <div>
      <title>Streaming SSR — weifuwu</title>
      <h1 className="text-3xl font-bold mb-4">Streaming SSR Demo</h1>
      <p className="text-gray-600 mb-6">Shell renders instantly, then suspended content streams in as data resolves.</p>
      <FastSection />
      <Suspense fallback={<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6 mb-4"><h3 className="font-semibold">Loading (1.5s)...</h3></div>}>
        <SlowSection promise={p1} label="Streamed Content (1.5s)" />
      </Suspense>
      <Suspense fallback={<div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6"><h3 className="font-semibold">Loading (2.5s)...</h3></div>}>
        <SlowSection promise={p2} label="Another Block (2.5s)" />
      </Suspense>
    </div>
  )
}
