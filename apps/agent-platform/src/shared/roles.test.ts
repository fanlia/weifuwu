/**
 * 角色矩阵单源契约（fullstack W2——声明即校验）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasCapability, CAPABILITIES } from './roles.ts'

test('W2：write 矩阵（owner/admin/member ✓——viewer/unknown/null ✗）', () => {
  assert.ok(hasCapability('owner', 'write'))
  assert.ok(hasCapability('admin', 'write'))
  assert.ok(hasCapability('member', 'write'))
  assert.ok(!hasCapability('viewer', 'write'))
  assert.ok(!hasCapability('unknown', 'write'))
  assert.ok(!hasCapability(null, 'write'))
})

test('W2：tenant 面仅 owner——manage 面 owner/admin', () => {
  assert.ok(hasCapability('owner', 'tenant'))
  assert.ok(!hasCapability('admin', 'tenant'))
  assert.ok(hasCapability('admin', 'manage'))
  assert.ok(!hasCapability('member', 'manage'))
})

test('W2：CAPABILITIES 声明闭合（角色枚举不漂移）', () => {
  for (const allowed of Object.values(CAPABILITIES)) {
    for (const r of allowed) assert.ok(['owner', 'admin', 'member', 'viewer'].includes(r), `未知角色 ${r}`)
  }
})
