
import { Counter } from './Counter.tsx'

export function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">weifuwu React SSR</h1>
      <p className="text-gray-600 mb-8">
        Web-standard HTTP framework with React server-side rendering.
      </p>

      <div className="rounded-lg border border-gray-200 p-6 mb-4">
        <h2 className="text-xl font-semibold mb-3">Core</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>
            <code className="bg-gray-100 px-1 rounded">ctx.render()</code>
            {' / '}
            <code className="bg-gray-100 px-1 rounded">ctx.renderStream()</code>
            {' — render React to HTML'}
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">useServerData()</code>
            {' — typed data, identical on server & client'}
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">{'head: { title, meta }'}</code>
            {' — dynamic head tags'}
          </li>
          <li>
            {'Layout nesting via '}
            <code className="bg-gray-100 px-1 rounded">Router.mount()</code>
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">ErrorBoundary</code>
            {' — catches render errors'}
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 p-6 mb-4">
        <h2 className="text-xl font-semibold mb-3">SPA Navigation</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>
            <code className="bg-gray-100 px-1 rounded">Link</code>
            {' — SPA links, no page reload'}
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">Form</code>
            {' — SPA form submit + revalidate'}
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">useNavigation()</code>
            {' — loading state ({ state: "loading" })'}
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">useParams()</code>
            {' / '}
            <code className="bg-gray-100 px-1 rounded">useNavigate()</code>
            {' / '}
            <code className="bg-gray-100 px-1 rounded">useRevalidate()</code>
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 p-6 mb-4">
        <h2 className="text-xl font-semibold mb-3">DX</h2>
        <ul className="list-disc pl-5 space-y-1 text-gray-700">
          <li>
            {'Auto '}
            <code className="bg-gray-100 px-1 rounded">?_data</code>
            {' — '}
            <code className="bg-gray-100 px-1 rounded">ctx.render()</code>
            {' auto-returns JSON'}
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">defineRoute()</code>
            {' — type-safe route config (captures loader return type)'}
          </li>
          <li>
            <code className="bg-gray-100 px-1 rounded">weifuwu/react/navigation</code>
            {' — shared primitives, safe for server & client'}
          </li>
          <li>
            {'Coexists with plain '}
            <code className="bg-gray-100 px-1 rounded">Response.json()</code>
            {' routes'}
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 p-6 mb-4 bg-blue-50">
        <h2 className="text-xl font-semibold mb-3">Try it out</h2>
        <ol className="list-decimal pl-5 space-y-1 text-gray-700">
          <li>
            <a href="/users">Users</a>
            {' — SPA nav + Form submit + loading state'}
          </li>
          <li>
            <a href="/admin/dashboard">Dashboard</a>
            {' — streaming SSR + nested layout'}
          </li>
          <li>
            <a href="/error">ErrorBoundary</a>
            {' — error handling demo'}
          </li>
          <li>
            <a href="/api/hello">API</a>
            {' — non-React JSON route'}
          </li>
        </ol>
      </div>

      <Counter />
    </div>
  )
}
