import { useServerData } from '../../../src/react/hooks.ts'

export function UserDetailPage() {
  const data = useServerData<{ user: { id: number; name: string; email: string; bio: string } }>()
  const user = data.user

  if (!user) return <p>User not found</p>

  return (
    <div>
      <title>{`${user ? user.name : 'Not Found'} — weifuwu`}</title>
      <a href="/users" className="text-blue-600 text-sm">&larr; Back to Users</a>
      <h1 className="text-3xl font-bold mt-2 mb-4">{user.name}</h1>
      <div className="space-y-3 text-gray-700">
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Bio:</strong> {user.bio}</p>
      </div>
    </div>
  )
}
