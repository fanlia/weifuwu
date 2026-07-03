import { createBrowserRouter } from '../../src/react/client.ts'
import { PageShell } from './components/PageShell.tsx'

createBrowserRouter({
  layout: PageShell,
  routes: {
    '/': () => import('./components/HomePage.tsx'),
    '/users': () => import('./components/UsersPage.tsx'),
    '/users/:id': () => import('./components/UserDetailPage.tsx'),
    '/admin/dashboard': () => import('./components/DashboardPage.tsx'),
    '/error': () => import('./components/ErrorDemoPage.tsx'),
    '/streaming': () => import('./components/StreamingDemoPage.tsx'),
  },
  fallback: () => import('./components/NotFoundPage.tsx'),
})
