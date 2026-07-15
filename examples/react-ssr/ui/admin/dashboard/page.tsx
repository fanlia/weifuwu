import { Link } from 'weifuwu/react'

export default function Dashboard() {
  return (
    <div>
      <title>Dashboard — weifuwu</title>
      <h1 className="text-3xl font-bold mb-1">Dashboard</h1>
      <p className="text-gray-500 mb-6">Nested route: <code>ui/admin/dashboard/page.tsx</code> → <code>/admin/dashboard</code></p>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-lg border border-gray-200 p-6">
          <div className="text-2xl font-bold">1,234</div>
          <div className="text-gray-500 text-sm">Total Users</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-6">
          <div className="text-2xl font-bold">567</div>
          <div className="text-gray-500 text-sm">Active Sessions</div>
        </div>
      </div>
      <Link href="/users" className="text-blue-600 no-underline hover:underline">← Users</Link>
    </div>
  )
}
