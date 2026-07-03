// Deprecated — use PageShell.tsx with react({ layout: './components/PageShell.tsx' })
// The framework now handles layout wrapping and __WEIFUWU_DATA__ injection.
export function RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
