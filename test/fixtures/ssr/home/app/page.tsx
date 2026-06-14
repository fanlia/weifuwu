import { useLoaderData } from 'weifuwu/react'

export default function Home() {
  const ctx = useLoaderData<{ posts?: { title: string }[] }>()
  const posts = ctx?.posts
  return (
    <div>
      <h1>Home</h1>
      {posts?.map((p: any, i: number) => (
        <p key={i}>{p.title}</p>
      ))}
    </div>
  )
}
