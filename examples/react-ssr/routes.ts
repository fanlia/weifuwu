/**
 * Shared route config — single source of truth for server and client.
 *
 * Server: `reactRouter(app, routes, opts)`
 * Client: `createBrowserRouter({ routes, ... })`
 */
export const routes = {
  '/':              () => import('./components/HomePage.tsx'),
  '/users':         () => import('./components/UsersPage.tsx'),
  '/users/:id':     () => import('./components/UserDetailPage.tsx'),
  '/admin/dashboard': () => import('./components/DashboardPage.tsx'),
  '/error':         () => import('./components/ErrorDemoPage.tsx'),
  '/streaming':     () => import('./components/StreamingDemoPage.tsx'),
}
