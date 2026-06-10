export default function RootLayout({ children }: { children: any }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Opencode Chat</title>
      </head>
      <body>
        {children}
      </body>
    </html>
  )
}
