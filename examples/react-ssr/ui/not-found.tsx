import { Link } from 'weifuwu/react'

export default function NotFound() {
  return (
    <div className="text-center py-16">
      <title>404 — weifuwu</title>
      <h1 className="text-6xl font-bold text-gray-300 mb-4">404</h1>
      <p className="text-gray-600 text-lg mb-8">Page not found</p>
      <Link href="/" className="text-blue-600 no-underline hover:underline">Go Home</Link>
    </div>
  )
}
