export async function GET(req: Request, ctx: { params: { slug: string } }) {
  return Response.json({ method: 'GET', slug: ctx.params.slug })
}

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  return Response.json({ method: 'POST', slug: ctx.params.slug })
}
