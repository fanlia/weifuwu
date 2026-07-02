/**
 * Shared page components.
 *
 * These components use useServerData() to read data — the data source
 * differs between server and client, but the component code is identical:
 *
 *   Server: ctx.render(<Page />, { data: { users: [...] } })
 *           → ServerDataContext provides data during renderToString
 *
 *   Client: createClientRouter([{ path: '/users', component: Page, loader: ... }])
 *           → loader fetches data → ServerDataContext provides in Browser
 */

import { createElement as h } from 'react'
import { Link, useServerData } from 'weifuwu/react/navigation'

// ════════════════════════════════════════════════════════════

export function HomePage() {
  return h('div', null,
    h('h1', null, 'weifuwu React SSR'),
    h('p', null, 'A web-standard HTTP framework with React server-side rendering.'),
    h('div', { className: 'card' },
      h('h2', null, 'Features'),
      h('ul', null,
        h('li', null, 'ctx.render() — render React to HTML'),
        h('li', null, 'ctx.renderStream() — streaming SSR'),
        h('li', null, 'Layout composition via mount nesting'),
        h('li', null, 'useServerData() — typed data loading on both sides'),
        h('li', null, 'Coexists with non-React API routes'),
        h('li', null, h('strong', null, 'NEW: '), 'Client-side SPA navigation'),
      ),
    ),
    h('div', { className: 'card', style: { background: '#f0f7ff' } },
      h('h2', null, 'Try it out'),
      h('ol', null,
        h('li', null, h(Link, { href: '/users' }, 'Browse users'), ' — SPA navigation, no page reload'),
        h('li', null, h(Link, { href: '/admin/dashboard' }, 'Dashboard'), ' — streaming SSR + nested layout'),
        h('li', null, h(Link, { href: '/api/hello' }, 'API'), ' — non-React JSON route'),
      ),
    ),
  )
}

// ════════════════════════════════════════════════════════════

interface User {
  id: number
  name: string
  email: string
  bio?: string
}

export function UsersPage() {
  const { users } = useServerData<{ users: User[] }>()

  return h('div', null,
    h('h1', null, 'Users'),
    h('p', null, 'Click a user to navigate without page reload.'),
    h('div', { className: 'card' },
      !users || users.length === 0
        ? h('p', null, 'No users found.')
        : users.map(u =>
            h(Link, { key: u.id, className: 'user-link', href: `/users/${u.id}` },
              `${u.name} — ${u.email}`,
            ),
          ),
    ),
  )
}

// ════════════════════════════════════════════════════════════

export function UserDetailPage() {
  const { user } = useServerData<{ user: User }>()

  if (!user) {
    return h('div', { className: 'card', style: { borderColor: '#e74c3c' } },
      h('h1', null, '404 — User Not Found'),
      h(Link, { className: 'back-link', href: '/users' }, '← Back to users'),
    )
  }

  return h('div', { className: 'card' },
    h('h1', null, user.name),
    h('p', null, h('strong', null, 'Email: '), user.email),
    h('p', null, h('strong', null, 'ID: '), String(user.id)),
    user.bio ? h('p', null, h('em', null, user.bio)) : null,
    h(Link, { className: 'back-link', href: '/users' }, '← Back to users'),
  )
}

// ════════════════════════════════════════════════════════════

export function DashboardPage() {
  return h('div', null,
    h('h1', null, 'Dashboard'),
    h('p', null, 'Uses renderStream() — browser receives chunks progressively.'),
    h('div', { className: 'card' },
      h('h2', null, 'Streaming SSR Stats'),
      h('ul', null,
        h('li', null, 'Users: 42'),
        h('li', null, 'Posts: 128'),
        h('li', null, 'Comments: 512'),
      ),
    ),
  )
}

// ════════════════════════════════════════════════════════════

export function NotFoundPage({ path }: { path: string }) {
  return h('div', { className: 'card', style: { borderColor: '#e74c3c' } },
    h('h1', null, '404 — Page Not Found'),
    h('p', null, `No route matches "${path}".`),
    h(Link, { className: 'back-link', href: '/' }, '← Go home'),
  )
}
