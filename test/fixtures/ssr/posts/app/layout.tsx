import { ReactNode } from 'react'

export default function PostsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <header>Layout-Header</header>
      {children}
    </div>
  )
}
