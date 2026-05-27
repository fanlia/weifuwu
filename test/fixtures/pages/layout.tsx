export default function RootLayout({ children }: { children: any }) {
  return (
    <html>
      <head>
        <title>App</title>
      </head>
      <body>
        <div id="__weifuwu_root">{children}</div>
      </body>
    </html>
  )
}
