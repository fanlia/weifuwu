import { useServerData } from '../lib/weifuwu.ts'

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
        <script type="importmap">
          {JSON.stringify({ imports: {
            react: '/assets/vendor.js',
            'react/jsx-runtime': '/assets/vendor.js',
            'react-dom/client': '/assets/vendor.js',
          }})}
        </script>
        <script type="module" src="/assets/client.js"></script>
      </head>
      <body className="font-sans max-w-3xl mx-auto p-8">
        <nav className="flex gap-4 mb-8 border-b border-gray-200 pb-4">
          <a href="/" className="text-gray-700 no-underline hover:underline">Home</a>
          <a href="/users" className="text-gray-700 no-underline hover:underline">Users</a>
          <a href="/admin/dashboard" className="text-gray-700 no-underline hover:underline">Dashboard</a>
          <a href="/api/hello" className="text-gray-700 no-underline hover:underline">API</a>
        </nav>
        <div id="root">{children}</div>
        {hasData && (
          <script id="__WEIFUWU_DATA__" type="application/json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
        )}
      </body>
    </html>
  )
}
