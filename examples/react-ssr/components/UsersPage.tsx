import { useServerData } from '../lib/weifuwu.ts'
import { PageShell } from './PageShell.tsx'

export function UsersPage() {
  const data = useServerData<{ users: Array<{ id: number; name: string; email: string; bio: string }> }>()
  const users = data.users ?? []

  return (
    <PageShell>
      <div>
        <h1 className="text-3xl font-bold mb-4">Users</h1>
        <div className="space-y-3">
          {users.map(u => (
            <a key={u.id} href={`/users/${u.id}`} className="block rounded-lg border border-gray-200 p-4 no-underline hover:border-blue-300 transition-colors">
              <div className="font-semibold">{u.name}</div>
              <div className="text-sm text-gray-500">{u.email}</div>
            </a>
          ))}
        </div>
        <form method="post" action="/users" className="mt-6 flex gap-2">
          <input name="name" placeholder="Name" className="border rounded px-3 py-2 flex-1" />
          <input name="email" placeholder="Email" className="border rounded px-3 py-2 flex-1" />
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Add</button>
        </form>
      </div>
    </PageShell>
  )
}
