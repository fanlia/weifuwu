/**
 * Client-side entry — SPA mount + navigation.
 *
 * Components are imported (for bundling) and registered (for string-based
 * resolution). Both server (ctx.render('./components/...')) and client
 * use the same path strings.
 *
 * Uses mount() (createRoot) instead of hydrate() because the server
 * loads components via esbuild (loadTsxComponent), producing different
 * function references than the client's bundled imports. mount() avoids
 * hydration type mismatches by doing a clean client-side render.
 *
 * Auto-compiled by esbuildDev middleware in server.ts — no build step needed.
 * For production, use node build.mjs to pre-build static files.
 */

import {
  mount,
  createClientRouter,
  defineRoute,
  registerComponent,
} from 'weifuwu/react/client'

// Import components for bundling
import { HomePage } from './components/HomePage.tsx'
import { UsersPage } from './components/UsersPage.tsx'
import { UserDetailPage } from './components/UserDetailPage.tsx'
import { ErrorDemoPage } from './components/ErrorDemoPage.tsx'
import { DashboardPage } from './components/DashboardPage.tsx'

// Register all components so string-based routes can resolve them.
// These paths MUST match what ctx.render() uses in server.ts.
registerComponent('./components/HomePage.tsx', HomePage)
registerComponent('./components/UsersPage.tsx', UsersPage)
registerComponent('./components/UserDetailPage.tsx', UserDetailPage)
registerComponent('./components/ErrorDemoPage.tsx', ErrorDemoPage)
registerComponent('./components/DashboardPage.tsx', DashboardPage)

// Type-safe route definitions — same paths as server.ts
const homeRoute = defineRoute({
  path: '/',
  component: './components/HomePage.tsx',
  loader: () => Promise.resolve({}),
})

const usersRoute = defineRoute({
  path: '/users',
  component: './components/UsersPage.tsx',
  loader: () => fetch('/users?_data').then(r => r.json()),
})

const userRoute = defineRoute({
  path: '/users/:id',
  component: './components/UserDetailPage.tsx',
  loader: (p) => fetch(`/users/${p.id}?_data`).then(r => r.json()),
})

const errorRoute = defineRoute({
  path: '/error',
  component: './components/ErrorDemoPage.tsx',
  loader: () => Promise.resolve({}),
})

const dashboardRoute = defineRoute({
  path: '/admin/dashboard',
  component: './components/DashboardPage.tsx',
  loader: () => Promise.resolve({}),
})

const router = createClientRouter([
  homeRoute,
  usersRoute,
  userRoute,
  errorRoute,
  dashboardRoute,
])

mount(router.App)
