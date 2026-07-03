import { useServerData } from '../lib/weifuwu.ts'

interface User { id: number; name: string; email: string; bio?: string }

export function UsersPage() {
  const { users } = useServerData<{ users: User[] }>()

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Users</h1>
      <p className="text-gray-600 mb-4">
        Add a user via the form below. POST → 302 redirect.
      </p>

      <div className="rounded-lg border border-gray-200 p-6">
        <form method="post" action="/users" className="mb-4">
          <input name="name" placeholder="Name" required
            className="mr-2 px-2 py-1 border border-gray-300 rounded" />
          <input name="email" placeholder="Email" type="email" required
            className="mr-2 px-2 py-1 border border-gray-300 rounded" />
          <button type="submit"
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 cursor-pointer transition-colors">
            Add User
          </button>
        </form>
        <hr className="mb-4" />
        {!users || users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          users.map(u => (
            <a key={u.id} href={`/users/${u.id}`}
              className="block py-1 text-blue-600 no-underline hover:underline">
              {`${u.name} — ${u.email}`}
            </a>
          ))
        )}
      </div>
    </div>
  )
}
