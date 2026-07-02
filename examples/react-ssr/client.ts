/**
 * Client-side entry — hydration + SPA navigation with type-safe routes.
 *
 * Shared components (components/pages.ts) use useServerData() —
 * same code runs on server and client. Data flows via:
 *   Server: ctx.render(<Page />, { data })
 *   Client: createClientRouter([{ component: Page, loader }])
 *
 * Auto-compiled by esbuildDev middleware in server.ts — no build step needed.
 * For production, use node build.mjs to pre-build static files.
 */

import { hydrate, createClientRouter, defineRoute } from 'weifuwu/react/client'
import { HomePage, UsersPage, UserDetailPage, ErrorDemoPage, DashboardPage } from './components/pages.ts'

// Type-safe route definitions — loader return types captured as $data
const homeRoute      = defineRoute({ path: '/',                   component: HomePage,         loader: () => Promise.resolve({}) })
const usersRoute     = defineRoute({ path: '/users',              component: UsersPage,        loader: () => fetch('/users?_data').then(r => r.json()) })
const userRoute      = defineRoute({ path: '/users/:id',          component: UserDetailPage,   loader: (p) => fetch(`/users/${p.id}?_data`).then(r => r.json()) })
const errorRoute     = defineRoute({ path: '/error',              component: ErrorDemoPage,    loader: () => Promise.resolve({}) })
const dashboardRoute = defineRoute({ path: '/admin/dashboard',   component: DashboardPage,    loader: () => Promise.resolve({}) })

// In components: useServerData<typeof usersRoute.$data>() → full auto-complete
const router = createClientRouter([
  homeRoute,
  usersRoute,
  userRoute,
  errorRoute,
  dashboardRoute,
])

hydrate(router.App)
