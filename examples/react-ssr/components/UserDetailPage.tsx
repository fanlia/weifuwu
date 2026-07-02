import { Link, useServerData, ErrorBoundary } from 'weifuwu/react/navigation'

interface User {
  id: number
  name: string
  email: string
  bio?: string
}

function UserProfile({ user }: { user: User }) {
  return (
    <div className="rounded-lg border border-gray-200 p-6">
      <h1 className="text-3xl font-bold mb-3">{user.name}</h1>
      <p className="mb-1">{`Email: ${user.email}`}</p>
      <p className="mb-1">{`ID: ${user.id}`}</p>
      {user.bio && <p className="italic text-gray-600 mt-2">{user.bio}</p>}
      <Link href="/users" className="inline-block mt-4 text-blue-600 no-underline hover:underline">
        ← Back to users
      </Link>
    </div>
  )
}

function ErrorFallback() {
  return (
    <div className="rounded-lg border-2 border-red-500 bg-red-50 p-6">
      <h1 className="text-2xl font-bold text-red-600 mb-2">⚠️ Something went wrong</h1>
      <p className="text-gray-700 mb-4">ErrorBoundary caught a render error in UserProfile.</p>
      <Link href="/users" className="text-blue-600 no-underline hover:underline">
        ← Back to users
      </Link>
    </div>
  )
}

export function UserDetailPage() {
  const { user } = useServerData<{ user: User }>()

  if (!user) {
    return (
      <div className="rounded-lg border-2 border-red-500 p-6">
        <h1 className="text-2xl font-bold mb-2">404 — User Not Found</h1>
        <p className="text-gray-600 mb-4">This user does not exist in the mock database.</p>
        <Link href="/users" className="text-blue-600 no-underline hover:underline">
          ← Back to users
        </Link>
      </div>
    )
  }

  return (
    <ErrorBoundary fallback={<ErrorFallback />}>
      <UserProfile user={user} />
    </ErrorBoundary>
  )
}
