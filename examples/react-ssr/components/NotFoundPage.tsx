

export function NotFoundPage({ path }: { path: string }) {
  return (
    <div className="rounded-lg border-2 border-red-500 p-6">
      <h1 className="text-2xl font-bold mb-2">404 — Page Not Found</h1>
      <p className="text-gray-600 mb-4">
        No route matches &quot;{path}&quot;.
      </p>
      <a href="/" className="text-blue-600 no-underline hover:underline">
        ← Go home
      </a>
    </div>
  )
}
