import { useServerData, Link } from 'weifuwu/react'
import type { Context } from 'weifuwu'

export async function loader(_ctx: Context) {
  return { appName: 'weifuwu', year: new Date().getFullYear() }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { appName } = useServerData<{ appName: string }>()
  return (
    <>
      <nav className="flex gap-4 mb-8 border-b border-gray-200 pb-4 items-center">
        <Link href="/" className="font-bold text-lg text-gray-900 no-underline">{appName}</Link>
        <div className="flex gap-4 ml-8">
          <Link href="/users" className="text-gray-600 no-underline hover:text-gray-900 transition-colors">Users</Link>
          <Link href="/admin/dashboard" className="text-gray-600 no-underline hover:text-gray-900 transition-colors">Dashboard</Link>
          <Link href="/error" className="text-gray-600 no-underline hover:text-gray-900 transition-colors">Error</Link>
          <Link href="/streaming" className="text-gray-600 no-underline hover:text-gray-900 transition-colors">Streaming</Link>
        </div>
        <div className="ml-auto flex gap-4">
          <Link href="/api/hello" className="text-sm text-gray-400 no-underline hover:text-gray-600">API</Link>
        </div>
      </nav>
      <main className="min-h-[60vh]">{children}</main>
      <footer className="mt-16 pt-8 border-t border-gray-100 text-center text-sm text-gray-400">
        Built with {appName}
      </footer>
    </>
  )
}
