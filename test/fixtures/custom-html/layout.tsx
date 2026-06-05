export default function RootLayout({ children, req }: { children: any; req: Request }) {
  const theme = req.headers.get('x-theme') || 'light'
  return (
    <html>
      <head><title>Test</title></head>
      <body data-theme={theme}>
        <main>{children}</main>
      </body>
    </html>
  )
}
