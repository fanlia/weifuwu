export default async function load({ params }: { params: { slug: string } }) {
  return { post: { title: `Post: ${params.slug}` } }
}
