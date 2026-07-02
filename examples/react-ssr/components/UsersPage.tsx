import { Link, useServerData, Form, useNavigation } from 'weifuwu/react/navigation'

interface User {
  id: number
  name: string
  email: string
  bio?: string
}

export function UsersPage() {
  const { users } = useServerData<{ users: User[] }>()
  const { state } = useNavigation()
  const busy = state === 'loading'

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">Users</h1>
      {busy && (
        <div className="bg-blue-500 text-white px-4 py-2 rounded mb-4">⏳ Loading...</div>
      )}
      <p className="text-gray-600 mb-4">
        Click a user for SPA navigation. Form uses POST → 302 redirect → revalidate.
      </p>

      <div className="rounded-lg border border-gray-200 p-6">
        <Form method="post" action="/users" className="mb-4">
          <input
            name="name"
            placeholder="Name"
            required
            disabled={busy}
            className="mr-2 px-2 py-1 border border-gray-300 rounded"
          />
          <input
            name="email"
            placeholder="Email"
            type="email"
            required
            disabled={busy}
            className="mr-2 px-2 py-1 border border-gray-300 rounded"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 cursor-pointer transition-colors"
          >
            {busy ? 'Saving...' : 'Add User'}
          </button>
        </Form>
        <hr className="mb-4" />
        {!users || users.length === 0 ? (
          <p>No users found.</p>
        ) : (
          users.map(u => (
            <Link key={u.id} href={`/users/${u.id}`} className="block py-1 text-blue-600 no-underline hover:underline">
              {u.name} — {u.email}
            </Link>
          ))
        )}
      </div>
    </div>
  )
}
