import { useCtx, Head } from '@weifuwujs/react'
export default function Home() {
  const ctx = useCtx()
  const t = ctx.i18n?.t || ((k: string) => k)

  return (
    <>
      <Head>
        <meta name="description" content="weifuwu React SSR" />
      </Head>

      <section style={{ textAlign: 'center', padding: '48px 0' }}>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: 12 }}>
          {t('title')}
        </h1>
        <p style={{ color: '#6b7280', marginBottom: 24 }}>
          Node.js + TypeScript + React 19 SSR — no build step
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <a href="/api/ping" style={{
            padding: '10px 24px',
            borderRadius: 6,
            background: '#3b82f6',
            color: '#fff',
            textDecoration: 'none',
          }}>
            {t('cta')}
          </a>
          <a href="https://github.com/yourname/weifuwu" target="_blank" rel="noopener noreferrer" style={{
            padding: '10px 24px',
            borderRadius: 6,
            border: '1px solid #d1d5db',
            color: '#111827',
            textDecoration: 'none',
          }}>
            {t('docs')}
          </a>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 32 }}>
        <FeatureCard title="React SSR" description="React 19 server-side rendering with streaming. Hydration on the client." />
        <FeatureCard title="File System Routing" description="Pages from ui/app/**/page.tsx. Layouts from layout.tsx. Params from [slug]/." />
        <FeatureCard title="Dev HMR" description="Hot module replacement via esbuild transformSync + WebSocket livereload." />
        <FeatureCard title="Zero Build" description="Node.js 24+ handles TypeScript natively. No tsc, no bundler needed." />
      </section>

      <section style={{ marginTop: 48, textAlign: 'center', color: '#6b7280' }}>
        <p style={{ fontStyle: 'italic' }}>
          &ldquo;{t('demo')}&rdquo;
        </p>
        <p style={{ marginTop: 24, fontSize: '0.875rem' }}>
          Theme: {ctx.theme?.value || 'system'} &middot; Locale: {ctx.i18n?.locale || 'en'}
        </p>
      </section>
    </>
  )
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div style={{
      padding: 24,
      borderRadius: 10,
      border: '1px solid #e5e7eb',
      background: '#f9fafb',
    }}>
      <h3 style={{ fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.5 }}>{description}</p>
    </div>
  )
}
