import { createBrowserRouter } from '../../src/react/client.ts'
import { PageShell } from './components/PageShell.tsx'
import { routes } from './routes.ts'

createBrowserRouter({
  layout: PageShell,
  routes,
  fallback: () => import('./components/NotFoundPage.tsx'),
})
