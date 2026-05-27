export default function Post({ post, params }: { post?: { title: string }; params: { slug: string } }) {
  return <article><h1>{post?.title ?? params.slug}</h1></article>
}
