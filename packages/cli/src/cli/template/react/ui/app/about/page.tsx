import { Head, useCtx } from 'weifuwu/react'

export default function About() {
  const ctx = useCtx()
  const t = ctx.i18n?.t || ((k: string) => k)

  return (
    <>
      <Head>
        <meta name="description" content="About weifuwu" />
      </Head>

      <section style={{ padding: '24px 0' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: 16 }}>
          About weifuwu
        </h1>
        <p style={{ lineHeight: 1.7, color: '#374151' }}>
          weifuwu is a web-standard HTTP microframework for Node.js.
          Built on React 19 server-side rendering, it provides a
          filesystem-based routing system inspired by Next.js App Router,
          but without the build step.
        </p>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 24, marginBottom: 12 }}>
          Key Features
        </h2>
        <ul style={{ lineHeight: 2, paddingLeft: 20 }}>
          <li>React 19 SSR with streaming</li>
          <li>File system routing (app/page.tsx, app/[slug]/page.tsx)</li>
          <li>Layout nesting (layout.tsx)</li>
          <li>Tailwind v4 CSS</li>
          <li>Theme switching (light/dark/system)</li>
          <li>Internationalization (i18n)</li>
          <li>Dev HMR via esbuild transformSync</li>
          <li>WebSocket chat support</li>
        </ul>
        <p style={{ marginTop: 24, color: '#6b7280', fontSize: '0.875rem' }}>
          Current theme: {ctx.theme?.value || 'system'} &middot; Locale: {ctx.i18n?.locale || 'en'}
        </p>
      </section>
    </>
  )
}
