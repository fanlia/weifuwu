/**
 * Shared page components — no duplication between server and client.
 *
 * Every component uses useServerData() for data. The provider differs:
 *   Server: ctx.render(<Page />, { data }) → ServerDataContext
 *   Client: createClientRouter([{ component: Page, loader }]) → ServerDataContext
 *
 * useServerData<T>() reads from ServerDataContext — works identically on both.
 */

import { createElement as h, useState } from 'react'
import {
  Link, useServerData, Form, ErrorBoundary, useNavigation,
} from 'weifuwu/react/navigation'

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
// Counter — interactive useState component (SSR + hydration)
// ════════════════════════════════════════════════════════════

export function Counter() {
  const [count, setCount] = useState(0)

  return h('div', { className: 'card', style: { background: '#f0f7ff' } },
    h('h2', null, '🧮 Counter Demo'),
    h('p', null, 'Live useState counter — server renders initial count (0), client handles clicks.'),
    h('div', { style: { fontSize: '4rem', fontWeight: 'bold', textAlign: 'center', margin: '1rem 0', fontVariantNumeric: 'tabular-nums' } }, String(count)),
    h('div', { style: { display: 'flex', gap: '0.5rem', justifyContent: 'center' } },
      h('button', {
        onClick: () => setCount(c => c - 1),
        style: { padding: '0.5rem 1.5rem', fontSize: '1.25rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: '#fff' },
      }, '−'),
      h('button', {
        onClick: () => setCount(0),
        style: { padding: '0.5rem 1.5rem', fontSize: '1rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: '#fff' },
      }, 'Reset'),
      h('button', {
        onClick: () => setCount(c => c + 1),
        style: { padding: '0.5rem 1.5rem', fontSize: '1.25rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: '#007aff', color: '#fff' },
      }, '+'),
    ),
    h('p', { style: { color: '#666', fontSize: '0.875rem', marginTop: '1rem' } },
      'SSR renders the initial count. After hydration, clicks update state on the client.',
    ),
  )
}

// ════════════════════════════════════════════════════════════
// Home — feature overview
// ════════════════════════════════════════════════════════════

export function HomePage() {
  return h('div', null,
    h('h1', null, 'weifuwu React SSR'),
    h('p', null, 'Web-standard HTTP framework with React server-side rendering.'),

    h('div', { className: 'card' },
      h('h2', null, 'Core'),
      h('ul', null,
        h('li', null, h('code', null, 'ctx.render()'), ' / ', h('code', null, 'ctx.renderStream()'), ' — render React to HTML'),
        h('li', null, h('code', null, 'useServerData()'), ' — typed data, identical on server & client'),
        h('li', null, h('code', null, 'head: { title, meta }'), ' — dynamic head tags'),
        h('li', null, 'Layout nesting via ', h('code', null, 'Router.mount()')),
        h('li', null, h('code', null, 'ErrorBoundary'), ' — catches render errors'),
      ),
    ),

    h('div', { className: 'card' },
      h('h2', null, 'SPA Navigation'),
      h('ul', null,
        h('li', null, h('code', null, 'Link'), ' — SPA links, no page reload'),
        h('li', null, h('code', null, 'Form'), ' — SPA form submit + revalidate'),
        h('li', null, h('code', null, 'useNavigation()'), ' — loading state ({ state: "loading" })'),
        h('li', null, h('code', null, 'useParams()'), ' / ', h('code', null, 'useNavigate()'), ' / ', h('code', null, 'useRevalidate()')),
      ),
    ),

    h('div', { className: 'card' },
      h('h2', null, 'DX'),
      h('ul', null,
        h('li', null, 'Auto ', h('code', null, '?_data'), ' — ', h('code', null, 'ctx.render()'), ' auto-returns JSON'),
        h('li', null, h('code', null, 'defineRoute()'), ' — type-safe route config (captures loader return type)'),
        h('li', null, h('code', null, 'weifuwu/react/navigation'), ' — shared primitives, safe for server & client'),
        h('li', null, 'Coexists with plain ', h('code', null, 'Response.json()'), ' routes'),
      ),
    ),

    h('div', { className: 'card', style: { background: '#f0f7ff' } },
      h('h2', null, 'Try it out'),
      h('ol', null,
        h('li', null, h(Link, { href: '/users' }, 'Users'), ' — SPA nav + Form submit + loading state'),
        h('li', null, h(Link, { href: '/admin/dashboard' }, 'Dashboard'), ' — streaming SSR + nested layout'),
        h('li', null, h(Link, { href: '/error' }, 'ErrorBoundary'), ' — error handling demo'),
        h('li', null, h(Link, { href: '/api/hello' }, 'API'), ' — non-React JSON route'),
      ),
    ),

    h(Counter),
  )
}

// ════════════════════════════════════════════════════════════
// Users list — data loading + Form + loading state
// ════════════════════════════════════════════════════════════

export function UsersPage() {
  const { users } = useServerData<{ users: User[] }>()
  const { state } = useNavigation()
  const busy = state === 'loading'

  return h('div', null,
    h('h1', null, 'Users'),
    busy && h('div', {
      style: {
        background: '#3498db', color: '#fff', padding: '0.5rem 1rem',
        borderRadius: '4px', marginBottom: '1rem', animation: 'pulse 1s infinite',
      },
    }, '⏳ Loading...'),
    h('p', null, 'Click a user for SPA navigation. Form uses POST → 302 redirect → revalidate.'),

    h('div', { className: 'card' },
      h(Form, { method: 'post', action: '/users', style: { marginBottom: '1rem' } },
        h('input', { name: 'name', placeholder: 'Name', required: true, disabled: busy,
          style: { marginRight: '0.5rem', padding: '0.25rem 0.5rem' } }),
        h('input', { name: 'email', placeholder: 'Email', type: 'email', required: true, disabled: busy,
          style: { marginRight: '0.5rem', padding: '0.25rem 0.5rem' } }),
        h('button', { type: 'submit', disabled: busy,
          style: { padding: '0.25rem 0.75rem', cursor: busy ? 'wait' : 'pointer' } },
          busy ? 'Saving...' : 'Add User'),
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
// User detail — ErrorBoundary wrapping
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
    h('p', null, 'ErrorBoundary caught a render error in UserProfile.'),
    h(Link, { className: 'back-link', href: '/users' }, '← Back to users'),
  )
}

export function UserDetailPage() {
  const { user } = useServerData<{ user: User }>()

  if (!user) {
    return h('div', { className: 'card', style: { borderColor: '#e74c3c' } },
      h('h1', null, '404 — User Not Found'),
      h('p', null, 'This user does not exist in the mock database.'),
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
    h('h1', null, 'ErrorBoundary'),
    h('p', null, 'ErrorBoundary catches render errors on the client after hydration.'),

    h('div', { className: 'card', style: { background: '#fef9e7' } },
      h('h2', null, 'Usage'),
      h('pre', { style: {
        background: '#f5f5f5', padding: '1rem', borderRadius: '4px',
        overflow: 'auto', fontSize: '0.875rem',
      } },
        'import { ErrorBoundary } from "weifuwu/react"\n' +
        '\n' +
        '<ErrorBoundary fallback={<ErrorFallback />}>\n' +
        '  <UserProfile />\n' +
        '</ErrorBoundary>',
      ),
      h('p', null, 'When UserProfile throws (client-side), ErrorFallback renders instead.'),
      h('p', null,
        h('strong', null, 'SSR: '),
        'React server renderers propagate errors upward. Use ',
        h('code', null, 'app.onError()'),
        ' for server-side error pages, ErrorBoundary for client-side isolation.',
      ),
    ),

    h('p', null,
      'The ', h(Link, { href: '/users/1' }, 'User Detail page'),
      ' is wrapped in ErrorBoundary — if user data causes a render error, the fallback shows.',
    ),
    h(Link, { className: 'back-link', href: '/' }, '← Go home'),
  )
}

// ════════════════════════════════════════════════════════════
// Dashboard — streaming SSR + nested layout
// ════════════════════════════════════════════════════════════

export function DashboardPage() {
  return h('div', { style: { border: '2px solid #e74c3c', borderRadius: '8px', padding: '1rem' } },
    h('div', { style: { color: '#e74c3c', fontWeight: 'bold', marginBottom: '1rem' } }, '🔒 Admin Area'),
    h('div', null,
      h('h1', null, 'Dashboard'),
      h('p', null, 'Rendered with ', h('code', null, 'renderStream()'), ' — chunks arrive progressively to the browser.'),
      h('p', null, 'This area uses a nested AdminLayout via ', h('code', null, 'Router.mount()'), '.'),
      h('div', { className: 'card' },
        h('h2', null, 'Streaming SSR Stats'),
        h('ul', null,
          h('li', null, 'Users: 42'),
          h('li', null, 'Posts: 128'),
          h('li', null, 'Comments: 512'),
        ),
      ),
      h('div', { className: 'card', style: { background: '#f0f7ff' } },
        h('h2', null, 'How it works'),
        h('ol', null,
          h('li', null, 'Server starts rendering the React tree'),
          h('li', null, 'Sends HTML chunks as they become available'),
          h('li', null, 'Browser renders progressively — no waiting for the full page'),
          h('li', null, h('strong', null, 'Check: '), h('code', null, 'curl -sI http://localhost:3456/admin/dashboard | grep transfer-encoding')),
        ),
      ),
    ),
  )
}

// ════════════════════════════════════════════════════════════
// 404
// ════════════════════════════════════════════════════════════

export function NotFoundPage({ path }: { path: string }) {
  return h('div', { className: 'card', style: { borderColor: '#e74c3c' } },
    h('h1', null, '404 — Page Not Found'),
    h('p', null, `No route matches "${path}".`),
    h(Link, { className: 'back-link', href: '/' }, '← Go home'),
  )
}
