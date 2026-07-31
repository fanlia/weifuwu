/// <reference path="../../src/client/index.ts" />

/**
 * aippt 前端入口 — AI PPT 生成
 */

import { createApp, router, RouteView, api } from 'weifuwu/client'
import { Home } from './pages/Home'
import { Deck } from './pages/Deck'

const app = createApp()

app.use(api({ baseURL: '' }))

app.use(router({
  mode: 'history',
  routes: [
    { path: '/', component: Home, title: 'aippt — AI PPT 生成' },
    { path: '/decks/:id', component: Deck, title: '预览 — aippt' },
  ],
  notFound: () => () => (
    <div class="empty">
      <h2>404 — 页面不存在</h2>
      <a href="/">← 返回</a>
    </div>
  ),
}))

app.mount('#root', () => () => <RouteView />)
