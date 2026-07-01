import type { ReactNode } from 'react'
import { Head, useCtx, Link } from 'weifuwu/react'

export default function RootLayout({ children }: { children: ReactNode }) {
  const ctx = useCtx()
  const theme = ctx.theme?.value === 'dark' ? 'dark' : ''

  return (
    <html lang={ctx.i18n?.locale || 'en'} data-theme={theme}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>weifuwu SSR</title>
        <Head>{children}</Head>
      </head>
      <body>
        <nav style={{ display: 'flex', gap: 16, padding: '12px 24px', borderBottom: '1px solid #e5e7eb', alignItems: 'center' }}>
          <strong>weifuwu</strong>
          <Link href="/">Home</Link>
          <Link href="/about">About</Link>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            <ThemeToggle />
            <LocaleToggle />
          </div>
        </nav>
        <main style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
          {children}
        </main>
      </body>
    </html>
  )
}

function ThemeToggle() {
  const ctx = useCtx()
  const theme = ctx.theme?.value || 'system'
  const next = theme === 'dark' ? 'light' : theme === 'light' ? 'system' : 'dark'
  const label = theme === 'dark' ? '🌙' : theme === 'light' ? '☀️' : '🌓'
  return <Link href={`/__theme/${next}`}>{label}</Link>
}

function LocaleToggle() {
  const ctx = useCtx()
  const current = ctx.i18n?.locale || 'en'
  const next = current === 'zh-CN' ? 'en' : 'zh-CN'
  return <Link href={`/__lang/${next}`}>{ctx.i18n?.t('lang') || next}</Link>
}
