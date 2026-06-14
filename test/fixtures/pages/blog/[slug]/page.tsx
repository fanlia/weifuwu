import { useLoaderData } from 'weifuwu/react'

export default function Post() {
  const data = useLoaderData<{ post?: { title: string } }>()
  return (
    <article>
      <h1>{data.post?.title ?? ''}</h1>
    </article>
  )
}
