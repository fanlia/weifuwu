/**
 * Client-side entry for hydration + SPA navigation.
 *
 * Imports the SAME page components as server.ts — they use useServerData()
 * which reads from ServerDataContext. The context is populated by:
 *   - createClientRouter (via loader) on SPA navigation
 *   - __WEIFUWU_DATA__ script on initial page load
 *
 * Build:  node build.mjs
 * Start:  node server.ts
 */

import { hydrate, createClientRouter } from 'weifuwu/react/client'
import { HomePage, UsersPage, UserDetailPage } from './components/pages.ts'

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

hydrate(router.App)
