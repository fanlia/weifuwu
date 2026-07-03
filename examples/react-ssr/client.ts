import { hydrate } from './lib/weifuwu.ts'
import { HomePage } from './components/HomePage.tsx'
import { UsersPage } from './components/UsersPage.tsx'
import { UserDetailPage } from './components/UserDetailPage.tsx'
import { ErrorDemoPage } from './components/ErrorDemoPage.tsx'
import { DashboardPage } from './components/DashboardPage.tsx'

switch (window.location.pathname) {
  case '/':                hydrate(HomePage); break
  case '/users':           hydrate(UsersPage); break
  case '/error':           hydrate(ErrorDemoPage); break
  case '/admin/dashboard':  hydrate(DashboardPage); break
  default:
    if (/^\/users\/\d+$/.test(window.location.pathname)) hydrate(UserDetailPage)
}
