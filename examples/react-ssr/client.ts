/**
 * Client-side entry for hydration + SPA navigation.
 *
 * The page components MUST render the same DOM structure as the server
 * for React hydration to succeed. Data comes from useServerData().
 *
 * Build:  node build.mjs
 * Start:  node server.ts
 */

import { hydrate, createClientRouter, useServerData, Link } from 'weifuwu/react/client'
import { createElement as h } from 'react'

// ════════════════════════════════════════════════════════════
// Page components (must match server-side structure)
// ════════════════════════════════════════════════════════════

function HomePage() {
  return h('div', null,
    h('h1', null, 'weifuwu React SSR'),
    h('p', null, 'A web-standard HTTP framework with React server-side rendering.'),
    h('div', { className: 'card' },
      h('h2', null, 'Features'),
      h('ul', null,
        h('li', null, 'ctx.render() — render React to HTML'),
        h('li', null, 'ctx.renderStream() — streaming SSR'),
        h('li', null, 'Layout composition via mount nesting'),
        h('li', null, 'useServerData() — typed data loading'),
        h('li', null, 'Coexists with non-React API routes'),
        h('li', null, h('strong', null, 'NEW: '), 'Client-side SPA navigation with <Link>'),
      ),
    ),
    h('div', { className: 'card', style: { background: '#f0f7ff' } },
      h('h2', null, 'Try it out'),
      h('ol', null,
        h('li', null, h(Link, { href: '/users' }, 'Browse users'), ' — click any user to navigate without page reload'),
        h('li', null, h(Link, { href: '/admin/dashboard' }, 'Dashboard'), ' — streaming SSR with nested Admin layout'),
        h('li', null, h(Link, { href: '/api/hello' }, 'API'), ' — non-React JSON route cöexisting with React SSR'),
      ),
    ),
  )
}

function UsersPage() {
  const { users } = useServerData<{ users: Array<{ id: number; name: string; email: string }> }>()

  return h('div', null,
    h('h1', null, 'Users'),
    h('p', null, 'Click a user to navigate without page reload (SPA navigation).'),
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

function UserDetailPage() {
  const { user } = useServerData<{ user: { id: number; name: string; email: string; bio?: string } }>()

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
// Client router
// ════════════════════════════════════════════════════════════

const router = createClientRouter([
  { path: '/', component: HomePage },
  {
    path: '/users',
    component: UsersPage,
    loader: () => fetch('/users?_data').then(r => r.json()),
  },
  {
    path: '/users/:id',
    component: UserDetailPage,
    loader: (params) => fetch(`/users/${params.id}?_data`).then(r => r.json()),
  },
])

// Hydrate — RouterApp reads __DATA__ for initial data,
// then loads data via ?_data for subsequent SPA navigations.
hydrate(router.App)
