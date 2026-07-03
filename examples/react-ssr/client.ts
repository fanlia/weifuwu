/**
 * Client-side entry — hydration + SPA navigation with type-safe routes.
 *
 * Components are imported (for bundling) and registered (for string-based
 * resolution). Both server (ctx.render('./components/...')) and client
 * use the same path strings.
 *
 * Auto-compiled by esbuildDev middleware in server.ts — no build step needed.
 */

import { hydrate, createClientRouter, defineRoute, registerComponent } from 'weifuwu/react/client'
import { HomePage } from './components/HomePage.tsx'
import { UsersPage } from './components/UsersPage.tsx'
import { UserDetailPage } from './components/UserDetailPage.tsx'
import { ErrorDemoPage } from './components/ErrorDemoPage.tsx'
import { DashboardPage } from './components/DashboardPage.tsx'

registerComponent('./components/HomePage.tsx', HomePage)
registerComponent('./components/UsersPage.tsx', UsersPage)
registerComponent('./components/UserDetailPage.tsx', UserDetailPage)
registerComponent('./components/ErrorDemoPage.tsx', ErrorDemoPage)
registerComponent('./components/DashboardPage.tsx', DashboardPage)

const homeRoute      = defineRoute({ path: '/',                 component: './components/HomePage.tsx',       loader: () => Promise.resolve({}) })
const usersRoute     = defineRoute({ path: '/users',            component: './components/UsersPage.tsx',      loader: () => fetch('/users?_data').then(r => r.json()) })
const userRoute      = defineRoute({ path: '/users/:id',        component: './components/UserDetailPage.tsx', loader: (p) => fetch(`/users/${p.id}?_data`).then(r => r.json()) })
const errorRoute     = defineRoute({ path: '/error',            component: './components/ErrorDemoPage.tsx',  loader: () => Promise.resolve({}) })
const dashboardRoute = defineRoute({ path: '/admin/dashboard',  component: './components/DashboardPage.tsx',  loader: () => Promise.resolve({}) })

const router = createClientRouter([homeRoute, usersRoute, userRoute, errorRoute, dashboardRoute])
hydrate(router.App)
