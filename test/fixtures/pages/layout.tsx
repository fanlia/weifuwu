/* eslint-disable @typescript-eslint/no-explicit-any */
export default function RootLayout({ children }: { children: any }) {
  return (
    <html>
      <head>
        <title>App</title>
      </head>
      <body>
        <main>{children}</main>
      </body>
    </html>
  )
}
