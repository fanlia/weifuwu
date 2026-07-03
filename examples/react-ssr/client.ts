import { mount } from './lib/weifuwu.ts'

const pathname = window.location.pathname

let loader: Promise<{ [key: string]: React.ComponentType }> | null = null

if (pathname === '/') {
  loader = import('./components/HomePage.tsx')
} else if (pathname === '/users') {
  loader = import('./components/UsersPage.tsx')
} else if (pathname === '/error') {
  loader = import('./components/ErrorDemoPage.tsx')
} else if (pathname === '/admin/dashboard') {
  loader = import('./components/DashboardPage.tsx')
} else if (/^\/users\/\d+$/.test(pathname)) {
  loader = import('./components/UserDetailPage.tsx')
} else {
  loader = import('./components/NotFoundPage.tsx')
}

loader.then(mod => {
  const Component = mod.default || Object.values(mod).find(v => typeof v === 'function')
  if (Component) mount(Component)
})
