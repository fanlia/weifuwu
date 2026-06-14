import { ReactNode } from 'react'
export default function BlogLayout({ children }: { children: ReactNode }) {
  return <div><nav>BlogNav</nav>{children}</div>
}
