import { useServerData, HttpError } from 'weifuwu'
import type { Context } from 'weifuwu'
import { MOCK_USERS } from '../../../data.ts'

export async function loader(ctx: Context) {
  const user = MOCK_USERS.find(u => u.id === Number(ctx.params.id))
  if (!user) throw new HttpError('Not found', 404)
  return { user }
}

export default function UserDetail() {
  const data = useServerData<{ user: { name: string; email: string; bio: string } }>()
  const user = data.user
  if (!user) return <p>Not found</p>

  return (
    <div>
      <title>{`${user.name} — weifuwu`}</title>
      <h1 className="text-3xl font-bold mb-2">{user.name}</h1>
      <p className="text-gray-500 mb-4">{user.email}</p>
      <p className="text-gray-700">{user.bio}</p>
    </div>
  )
}
