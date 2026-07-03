/**
 * Page layout — shared chrome for all pages.
 * Injected by react({ layout: './components/PageShell.tsx' }).
 * Receives page content as `children`. Data script is handled by the framework.
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="flex gap-4 mb-8 border-b border-gray-200 pb-4">
        <a href="/" className="text-gray-700 no-underline hover:underline">Home</a>
        <a href="/users" className="text-gray-700 no-underline hover:underline">Users</a>
        <a href="/admin/dashboard" className="text-gray-700 no-underline hover:underline">Dashboard</a>
        <a href="/api/hello" className="text-gray-700 no-underline hover:underline">API</a>
      </nav>
      {children}
    </>
  )
}
