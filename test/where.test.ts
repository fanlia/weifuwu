import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { eq, ne, gt, gte, lt, lte, isNull, isNotNull, like, contains, in_, and, or, not } from '../postgres/schema/where.ts'

describe('where helpers', () => {
  it('eq', () => {
    const s = eq('level', 'error')
    assert.equal(s.strings[0], '"level" = ')
    assert.equal(s.strings[1], '')
    assert.equal(s.values[0], 'error')
  })

  it('ne', () => {
    const s = ne('status', 'archived')
    assert.equal(s.strings[0], '"status" != ')
    assert.equal(s.values[0], 'archived')
  })

  it('gt', () => {
    const s = gt('age', 18)
    assert.equal(s.strings[0], '"age" > ')
    assert.equal(s.values[0], 18)
  })

  it('gte', () => {
    const s = gte('created_at', '2026-01-01')
    assert.equal(s.strings[0], '"created_at" >= ')
    assert.equal(s.values[0], '2026-01-01')
  })

  it('lt', () => {
    const s = lt('id', 100)
    assert.equal(s.strings[0], '"id" < ')
    assert.equal(s.values[0], 100)
  })

  it('lte', () => {
    const s = lte('score', 50)
    assert.equal(s.strings[0], '"score" <= ')
    assert.equal(s.values[0], 50)
  })

  it('isNull', () => {
    const s = isNull('deleted_at')
    assert.equal(s.strings[0], '"deleted_at" IS NULL')
    assert.equal(s.values.length, 0)
  })

  it('isNotNull', () => {
    const s = isNotNull('email')
    assert.equal(s.strings[0], '"email" IS NOT NULL')
    assert.equal(s.values.length, 0)
  })

  it('like', () => {
    const s = like('name', 'Alice%')
    assert.equal(s.strings[0], '"name" LIKE ')
    assert.equal(s.values[0], 'Alice%')
  })

  it('contains', () => {
    const s = contains('metadata', { service: 'auth' })
    assert.equal(s.strings[0], '"metadata" @> ')
    assert.equal(s.strings[1], '')
    assert.deepEqual(s.values[0], { service: 'auth' })
  })

  it('in_', () => {
    const s = in_('id', [1, 2, 3])
    assert.equal(s.strings[0], '"id" = ANY(')
    assert.equal(s.strings[1], ')')
    assert.deepEqual(s.values[0], [1, 2, 3])
  })

  it('and combines two conditions', () => {
    const s = and(eq('role', 'admin'), gt('age', 18))
    assert.equal(s.strings[0], '("role" = ')
    assert.equal(s.strings[1], ' AND "age" > ')
    assert.equal(s.strings[2], ')')
    assert.equal(s.values[0], 'admin')
    assert.equal(s.values[1], 18)
  })

  it('or combines two conditions', () => {
    const s = or(eq('role', 'admin'), eq('role', 'moderator'))
    assert.equal(s.strings[0], '("role" = ')
    assert.equal(s.strings[1], ' OR "role" = ')
    assert.equal(s.strings[2], ')')
    assert.equal(s.values[0], 'admin')
    assert.equal(s.values[1], 'moderator')
  })

  it('and with single condition', () => {
    const s = and(eq('status', 'active'))
    assert.equal(s.strings[0], '("status" = ')
    assert.equal(s.strings[1], ')')
    assert.equal(s.values[0], 'active')
  })

  it('or with single condition', () => {
    const s = or(eq('status', 'active'))
    assert.equal(s.strings[0], '("status" = ')
    assert.equal(s.strings[1], ')')
    assert.equal(s.values[0], 'active')
  })

  it('and + or nested', () => {
    const s = or(
      and(eq('role', 'admin'), eq('status', 'active')),
      eq('role', 'superadmin'),
    )
    assert.equal(s.values[0], 'admin')
    assert.equal(s.values[1], 'active')
    assert.equal(s.values[2], 'superadmin')
    assert.equal(s.strings[0], '(("role" = ')
  })

  it('not wraps condition in NOT (...)', () => {
    const s = not(eq('status', 'archived'))
    assert.equal(s.strings[0], 'NOT ("status" = ')
    assert.equal(s.strings[1], ')')
    assert.equal(s.values[0], 'archived')
  })

  it('empty and returns empty SQL', () => {
    const s = and()
    assert.equal(s.strings[0], '')
    assert.equal(s.values.length, 0)
  })

  it('empty or returns empty SQL', () => {
    const s = or()
    assert.equal(s.strings[0], '')
    assert.equal(s.values.length, 0)
  })
})
