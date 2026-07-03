import { Link } from 'weifuwu/react/navigation'
import { useServerData } from 'weifuwu/react'

export function RootLayout({ children }: { children: React.ReactNode }) {
  const data = useServerData()
  const hasData = Object.keys(data).length > 0

  return (
    <html lang="zh">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>weifuwu</title>
        <link rel="stylesheet" href="/assets/tailwind.css" />
        <script
          type="importmap"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              imports: {
                react: '/assets/vendor.js',
                'react/jsx-runtime': '/assets/vendor.js',
                'react-dom/client': '/assets/vendor.js',
              },
            }),
          }}
        />
        <script type="module" src="/assets/client.js" />
      </head>
      <body className="font-sans max-w-3xl mx-auto p-8">
        <nav className="flex gap-4 mb-8 border-b border-gray-200 pb-4">
          <Link href="/" className="text-gray-700 no-underline hover:underline">Home</Link>
          <Link href="/users" className="text-gray-700 no-underline hover:underline">Users</Link>
          <Link href="/admin/dashboard" className="text-gray-700 no-underline hover:underline">Dashboard</Link>
          <Link href="/api/hello" className="text-gray-700 no-underline hover:underline">API</Link>
        </nav>
        <div id="root">{children}</div>
        {hasData && (
          <script
            id="__WEIFUWU_DATA__"
            type="application/json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
          />
        )}
      </body>
    </html>
  )
}
