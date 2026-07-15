import { useServerData, Link } from 'weifuwu/react'
import type { Context } from 'weifuwu'
import { MOCK_USERS } from '../../data.ts'

export async function loader(_ctx: Context) {
  return { users: MOCK_USERS }
}

export default function Users() {
  const data = useServerData<{ users: Array<{ id: number; name: string; email: string; bio: string }> }>()
  const users = data.users ?? []

  return (
    <div>
      <title>Users — weifuwu</title>
      <h1 className="text-3xl font-bold mb-2">Users</h1>
      <p className="text-gray-500 mb-6">loader() fetches data on the server → useServerData() on client</p>

      <div className="space-y-2 mb-8">
        {users.map(u => (
          <Link key={u.id} href={`/users/${u.id}`} className="block rounded-lg border border-gray-200 p-4 no-underline hover:border-blue-300 transition-all">
            <div className="font-semibold text-gray-900">{u.name}</div>
            <div className="text-sm text-gray-500">{u.email}</div>
          </Link>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold mb-3">Add User (POST form)</h2>
        <form method="post" action="/users" className="flex gap-2">
          <input name="name" placeholder="Name" className="border rounded px-3 py-2 flex-1 text-sm" />
          <input name="email" placeholder="Email" className="border rounded px-3 py-2 flex-1 text-sm" />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded text-sm">Add</button>
        </form>
      </div>
    </div>
  )
}
