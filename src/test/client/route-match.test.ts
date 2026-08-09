/**
 * route-match 纯函数测试 — router 与 SSR 共用的路由匹配契约
 *
 * 覆盖 compilePath / joinPaths / flattenRoutes / matchRoute / extractParams。
 * 重点：extractParams 对畸形 URL 序列不抛（safeDecode 兜底）。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  joinPaths,
  compilePath,
  flattenRoutes,
  matchRoute,
  extractParams,
} from '../../client/route-match.ts'
import type { RouteDef } from '../../client/types.ts'

// ── joinPaths ────────────────────────────────────────

test('joinPaths: 基本拼接', () => {
  assert.equal(joinPaths('/api', 'users'), '/api/users')
  assert.equal(joinPaths('/api', '/users'), '/api/users')
  assert.equal(joinPaths('/api/', 'users'), '/api/users')
})

test('joinPaths: 空与根', () => {
  assert.equal(joinPaths('', ''), '/')
  assert.equal(joinPaths('', '/'), '/')
  assert.equal(joinPaths('/api', ''), '/api')
  assert.equal(joinPaths('/api', '/'), '/api')
})

// ── compilePath ──────────────────────────────────────

test('compilePath: 普通路径精确匹配', () => {
  const { re, keys } = compilePath('/users')
  assert.deepEqual(keys, [])
  assert.ok(re.test('/users'))
  assert.ok(!re.test('/users/1'))
  assert.ok(!re.test('/users/'))
})

test('compilePath: 路径参数 :id', () => {
  const { re, keys } = compilePath('/users/:id')
  assert.deepEqual(keys, ['id'])
  assert.ok(re.test('/users/42'))
  assert.ok(re.test('/users/abc'))
  assert.ok(!re.test('/users'))       // 缺参数段
  assert.ok(!re.test('/users/1/2'))   // 多余段
})

test('compilePath: 多参数', () => {
  const { re, keys } = compilePath('/posts/:post/comments/:cid')
  assert.deepEqual(keys, ['post', 'cid'])
  assert.ok(re.test('/posts/1/comments/9'))
})

test('compilePath: 通配符 *', () => {
  const { re, keys } = compilePath('/files/*')
  assert.deepEqual(keys, [])
  assert.ok(re.test('/files/a/b/c'))
  assert.ok(re.test('/files/x.txt'))
})

test('compilePath: 根路径', () => {
  const { re, keys } = compilePath('/')
  assert.deepEqual(keys, [])
  assert.ok(re.test('/'))
})

// ── flattenRoutes ────────────────────────────────────

test('flattenRoutes: 平铺 + 嵌套 chain 累积', () => {
  const routes: RouteDef[] = [
    {
      path: '/admin',
      component: () => null as any,
      children: [
        { path: 'users', component: () => null as any },
        { path: 'settings', component: () => null as any },
      ],
    },
  ]
  const flat = flattenRoutes(routes)
  assert.equal(flat.length, 3)
  // 父路由 chain 仅含自身
  const admin = flat.find((f) => f.def.path === '/admin')!
  assert.equal(admin.chain.length, 1)
  // 子路由 chain 含父+自身
  const users = flat.find((f) => f.def.path === 'users')!
  assert.equal(users.chain.length, 2)
  assert.equal(users.chain[0].path, '/admin')
  assert.equal(users.chain[1].path, 'users')
})

test('flattenRoutes: 拼接完整路径', () => {
  const routes: RouteDef[] = [
    { path: '/api', component: () => null as any, children: [
      { path: 'v1', component: () => null as any },
    ] },
  ]
  const flat = flattenRoutes(routes)
  const v1 = flat.find((f) => f.def.path === 'v1')!
  // joinPaths('/api', 'v1') = '/api/v1'
  assert.ok(v1.re.test('/api/v1'))
})

// ── matchRoute ───────────────────────────────────────

test('matchRoute: 最长 chain 胜出（嵌套优先）', () => {
  const routes: RouteDef[] = [
    { path: '/users', component: () => null as any, children: [
      { path: ':id', component: () => null as any },
    ] },
  ]
  const flat = flattenRoutes(routes)
  // /users/1 同时匹配 /users（chain=1）和 /users/:id（chain=2）→ 取后者
  const m = matchRoute('/users/1', flat)
  assert.ok(m)
  assert.equal(m!.chain.length, 2)
  assert.deepEqual(m!.keys, ['id'])
})

test('matchRoute: 无匹配返回 null', () => {
  const routes: RouteDef[] = [{ path: '/users', component: () => null as any }]
  const flat = flattenRoutes(routes)
  assert.equal(matchRoute('/posts', flat), null)
})

// ── extractParams ────────────────────────────────────

test('extractParams: 正常参数提取', () => {
  const routes: RouteDef[] = [
    { path: '/users/:id', component: () => null as any },
  ]
  const flat = flattenRoutes(routes)
  const m = matchRoute('/users/42', flat)!
  assert.deepEqual(extractParams('/users/42', m), { id: '42' })
})

test('extractParams: 多参数', () => {
  const routes: RouteDef[] = [
    { path: '/posts/:post/comments/:cid', component: () => null as any },
  ]
  const flat = flattenRoutes(routes)
  const m = matchRoute('/posts/1/comments/9', flat)!
  assert.deepEqual(extractParams('/posts/1/comments/9', m), { post: '1', cid: '9' })
})

test('extractParams: URL 编码参数解码', () => {
  const routes: RouteDef[] = [
    { path: '/search/:q', component: () => null as any },
  ]
  const flat = flattenRoutes(routes)
  const encoded = '/search/' + encodeURIComponent('中文 测试')
  const m = matchRoute(encoded, flat)!
  assert.deepEqual(extractParams(encoded, m), { q: '中文 测试' })
})

test('extractParams: 畸形 URL 序列不抛（safeDecode 兜底）', () => {
  const routes: RouteDef[] = [
    { path: '/search/:q', component: () => null as any },
  ]
  const flat = flattenRoutes(routes)
  // %E0%A4 是不完整的 UTF-8 序列——decodeURIComponent 会抛 "URI malformed"
  const malformed = '/search/%E0%A4'
  const m = matchRoute(malformed, flat)
  if (m) {
    // 不应抛；应返回原值（未解码）
    const params = extractParams(malformed, m)
    assert.equal(params.q, '%E0%A4')
  }
})

test('extractParams: 无参数路由返回空对象', () => {
  const routes: RouteDef[] = [
    { path: '/about', component: () => null as any },
  ]
  const flat = flattenRoutes(routes)
  const m = matchRoute('/about', flat)!
  assert.deepEqual(extractParams('/about', m), {})
})
