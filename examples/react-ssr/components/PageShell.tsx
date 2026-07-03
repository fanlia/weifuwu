import type { Context } from '../../../src/types.ts'
import { useServerData } from '../../../src/react/hooks.ts'

export async function loader(_ctx: Context) {
  return { appName: 'weifuwu', navItems: ['Home', 'Users', 'Dashboard', 'Streaming', 'API'] }
}

export function PageShell({ children }: { children: React.ReactNode }) {
  const { appName } = useServerData<{ appName: string }>()

  return (
    <>
      <nav className="flex gap-4 mb-8 border-b border-gray-200 pb-4">
        <a href="/" className="text-gray-700 no-underline hover:underline">Home</a>
        <a href="/users" className="text-gray-700 no-underline hover:underline">Users</a>
        <a href="/admin/dashboard" className="text-gray-700 no-underline hover:underline">Dashboard</a>
        <a href="/streaming" className="text-gray-700 no-underline hover:underline">Streaming</a>
        <a href="/api/hello" className="text-gray-700 no-underline hover:underline">API</a>
        <span className="ml-auto text-sm text-gray-400">{appName}</span>
      </nav>
      {children}
    </>
  )
}
