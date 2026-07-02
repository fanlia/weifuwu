/**
 * Shared page components.
 *
 * Data flow — identical on both sides:
 *   Server: ctx.render(<Page />, { data: { users: [...] } })
 *   Client: createClientRouter([{ path: '/users', component: Page, loader: ... }])
 *
 * Both sides use useServerData() → same component code, zero duplication.
 */

import { createElement as h } from 'react'
import { Link, useServerData, Form, ErrorBoundary, useNavigation } from 'weifuwu/react/navigation'

// ════════════════════════════════════════════════════════════
// Types
// ════════════════════════════════════════════════════════════

interface User {
  id: number
  name: string
  email: string
  bio?: string
}

// ════════════════════════════════════════════════════════════
// Home page
// ════════════════════════════════════════════════════════════

export function HomePage() {
  return h('div', null,
    h('h1', null, 'weifuwu React SSR'),
    h('p', null, 'A web-standard HTTP framework with React server-side rendering.'),
    h('div', { className: 'card' },
      h('h2', null, 'Features'),
      h('ul', null,
        h('li', null, h('code', null, 'ctx.render()'), ' / ', h('code', null, 'ctx.renderStream()'), ' — render React to HTML'),
        h('li', null, h('code', null, 'Link'), ' — SPA navigation (no page reload)'),
        h('li', null, h('code', null, 'Form'), ' — SPA form submission with revalidate'),
        h('li', null, h('code', null, 'useServerData()'), ' — typed data loading, same on server & client'),
        h('li', null, 'Layout nesting via ', h('code', null, 'Router.mount()')),
        h('li', null, h('code', null, 'head: { title, meta }'), ' — dynamic head tags'),
        h('li', null, 'Auto ', h('code', null, '?_data'), ' — no manual JSON if-checks'),
        h('li', null, h('code', null, 'ErrorBoundary'), ' — SSR-safe error catching'),
        h('li', null, 'Coexists with non-React API routes'),
      ),
    ),
    h('div', { className: 'card', style: { background: '#f0f7ff' } },
      h('h2', null, 'Try it out'),
      h('ol', null,
        h('li', null, h(Link, { href: '/users' }, 'Browse users'), ' — SPA navigation + Form submit'),
        h('li', null, h(Link, { href: '/admin/dashboard' }, 'Dashboard'), ' — streaming SSR + nested layout'),
        h('li', null, h(Link, { href: '/error' }, 'Error demo'), ' — ErrorBoundary in action'),
        h('li', null, h(Link, { href: '/api/hello' }, 'API'), ' — non-React JSON route'),
      ),
    ),
  )
}

// ════════════════════════════════════════════════════════════
// Users page — with Form for creating users
// ════════════════════════════════════════════════════════════

export function UsersPage() {
  const { users } = useServerData<{ users: User[] }>()
  const { state } = useNavigation()
  const busy = state === 'loading'

  return h('div', null,
    h('h1', null, 'Users'),
    busy && h('div', { style: { background: '#3498db', color: '#fff', padding: '0.5rem 1rem', borderRadius: '4px', marginBottom: '1rem' } }, '⏳ Loading...'),
    h('p', null, 'Click a user to SPA-navigate. Use the form to add one (redirects + revalidates).'),
    h('div', { className: 'card' },
      h(Form, { method: 'post', action: '/users', style: { marginBottom: '1rem' } },
        h('input', { name: 'name', placeholder: 'Name', required: true, disabled: busy, style: { marginRight: '0.5rem' } }),
        h('input', { name: 'email', placeholder: 'Email', type: 'email', required: true, disabled: busy, style: { marginRight: '0.5rem' } }),
        h('button', { type: 'submit', disabled: busy }, busy ? 'Saving...' : 'Add User'),
      ),
      h('hr', null),
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
// User detail page — wrapped in ErrorBoundary
// ════════════════════════════════════════════════════════════

function UserProfile({ user }: { user: User }) {
  return h('div', { className: 'card' },
    h('h1', null, user.name),
    h('p', null, h('strong', null, 'Email: '), user.email),
    h('p', null, h('strong', null, 'ID: '), String(user.id)),
    user.bio ? h('p', null, h('em', null, user.bio)) : null,
    h(Link, { className: 'back-link', href: '/users' }, '← Back to users'),
  )
}

function ErrorFallback() {
  return h('div', { className: 'card', style: { borderColor: '#e74c3c', background: '#fff5f5' } },
    h('h1', null, '⚠️ Something went wrong'),
    h('p', null, 'The user profile failed to render. The ErrorBoundary caught this.'),
    h(Link, { className: 'back-link', href: '/users' }, '← Back to users'),
  )
}

export function UserDetailPage() {
  const { user } = useServerData<{ user: User }>()

  if (!user) {
    return h('div', { className: 'card', style: { borderColor: '#e74c3c' } },
      h('h1', null, '404 — User Not Found'),
      h(Link, { className: 'back-link', href: '/users' }, '← Back to users'),
    )
  }

  return h(ErrorBoundary, { fallback: h(ErrorFallback) },
    h(UserProfile, { user }),
  )
}

// ════════════════════════════════════════════════════════════
// ErrorBoundary demo
// ════════════════════════════════════════════════════════════

export function ErrorDemoPage() {
  return h('div', null,
    h('h1', null, 'ErrorBoundary Demo'),
    h('p', null, 'ErrorBoundary catches render errors on the client (after hydration).'),
    h('p', null, 'The UserDetailPage already uses ErrorBoundary — if user data fails to render, the fallback is shown.'),
    h('div', { className: 'card', style: { background: '#f0f7ff' } },
      h('h2', null, 'Usage'),
      h('pre', { style: { background: '#f5f5f5', padding: '1rem', borderRadius: '4px', overflow: 'auto' } },
        `<ErrorBoundary fallback={<ErrorFallback />}>
  <UserProfile />
</ErrorBoundary>`,
      ),
      h('p', null, 'When UserProfile throws (SSR or client), ErrorFallback is rendered instead.'),
      h('p', null, h('strong', null, 'SSR note: '), 'React server renderers propagate errors up. Use onError() for server-side error handling, ErrorBoundary for client-side after hydration.'),
    ),
    h(Link, { className: 'back-link', href: '/' }, '← Go home'),
  )
}

// ════════════════════════════════════════════════════════════
// Dashboard page (streaming SSR)
// ════════════════════════════════════════════════════════════

export function DashboardPage() {
  return h('div', null,
    h('h1', null, 'Dashboard'),
    h('p', null, 'Rendered with renderStream() — chunks arrive progressively.'),
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
// 404 page
// ════════════════════════════════════════════════════════════

export function NotFoundPage({ path }: { path: string }) {
  return h('div', { className: 'card', style: { borderColor: '#e74c3c' } },
    h('h1', null, '404 — Page Not Found'),
    h('p', null, `No route matches "${path}".`),
    h(Link, { className: 'back-link', href: '/' }, '← Go home'),
  )
}
