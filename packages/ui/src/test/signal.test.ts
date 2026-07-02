/**
 * Tests for signal.ts — ref, computed, effect
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ref, computed, effect, Signal } from '../signal.ts'

// ── ref() ───────────────────────────────────────────────────────────

describe('ref', () => {
  it('should create with initial value', () => {
    const r = ref(42)
    assert.equal(r.value, 42)
  })

  it('should update value', () => {
    const r = ref('hello')
    r.value = 'world'
    assert.equal(r.value, 'world')
  })

  it('should not notify if value is same (Object.is)', () => {
    const r = ref(0)
    let calls = 0
    const fn = () => calls++
    r._addSub(fn)
    r.value = 0  // same value — no notify
    assert.equal(calls, 0)
    r.value = 1  // different
    assert.equal(calls, 1)
  })

  it('should handle null/undefined', () => {
    const r = ref<string | null>('x')
    r.value = null
    assert.equal(r.value, null)
    r.value = undefined as any
    assert.equal(r.value, undefined)
  })

  it('should handle objects by reference', () => {
    const obj = { a: 1 }
    const r = ref(obj)
    assert.equal(r.value, obj)
    r.value = { b: 2 }
    assert.notEqual(r.value, obj)
  })

  it('should subscribe and unsubscribe', () => {
    const r = ref(0)
    let calls = 0
    const fn = () => calls++
    r._addSub(fn)
    r.value = 1
    assert.equal(calls, 1)
    r._removeSub(fn)
    r.value = 2
    // After removal, should not be called
    assert.equal(calls, 1)
  })

  it('should notify multiple subscribers', () => {
    const r = ref(0)
    let a = 0, b = 0
    r._addSub(() => a++)
    r._addSub(() => b++)
    r.value = 1
    assert.equal(a, 1)
    assert.equal(b, 1)
  })
})

// ── computed() ──────────────────────────────────────────────────────

describe('computed', () => {
  it('should compute derived value', () => {
    const a = ref(1)
    const b = ref(2)
    const c = computed(() => a.value + b.value)
    assert.equal(c.value, 3)
  })

  it('should be lazy (not re-evaluate until read)', () => {
    const a = ref(1)
    let evalCount = 0
    const c = computed(() => {
      evalCount++
      return a.value * 2
    })
    assert.equal(evalCount, 0)   // not evaluated yet
    assert.equal(c.value, 2)     // first read
    assert.equal(evalCount, 1)
  })

  it('should cache until dependency changes', () => {
    const a = ref(1)
    let evalCount = 0
    const c = computed(() => {
      evalCount++
      return a.value * 2
    })
    assert.equal(c.value, 2)
    assert.equal(evalCount, 1)
    assert.equal(c.peek(), 2)   // cached, no re-eval
    assert.equal(evalCount, 1)
  })

  it('should re-evaluate when dependency changes', () => {
    const a = ref(1)
    const c = computed(() => a.value * 2)
    assert.equal(c.value, 2)
    a.value = 5
    assert.equal(c.value, 10)   // re-evaluated
  })

  it('should chain computed dependencies', () => {
    const a = ref(1)
    const b = computed(() => a.value + 1)
    const c = computed(() => b.value * 2)
    assert.equal(c.value, 4)
    a.value = 3
    assert.equal(c.value, 8)
  })

  it('should handle multiple dependencies', () => {
    const x = ref(1)
    const y = ref(2)
    const z = ref(3)
    const c = computed(() => x.value + y.value + z.value)
    assert.equal(c.value, 6)
    x.value = 10
    assert.equal(c.value, 15)
    z.value = 0
    assert.equal(c.value, 12)
  })
})

// ── effect() ────────────────────────────────────────────────────────

describe('effect', () => {
  it('should run immediately', () => {
    let ran = false
    effect(() => { ran = true })
    assert.equal(ran, true)
  })

  it('should re-run when dependency changes', () => {
    const r = ref(0)
    let lastVal = -1
    effect(() => { lastVal = r.value })
    assert.equal(lastVal, 0)
    r.value = 42
    assert.equal(lastVal, 42)
    r.value = 100
    assert.equal(lastVal, 100)
  })

  it('should run cleanup on re-run', () => {
    const r = ref(0)
    const cleanups: string[] = []
    effect(() => {
      void r.value // track
      return () => cleanups.push('cleanup')
    })
    assert.equal(cleanups.length, 0)
    r.value = 1
    assert.equal(cleanups.length, 1)
    r.value = 2
    assert.equal(cleanups.length, 2)
  })

  it('should track multiple signals', () => {
    const a = ref(0)
    const b = ref(0)
    let result = 0
    effect(() => { result = a.value + b.value })
    assert.equal(result, 0)
    a.value = 5
    assert.equal(result, 5)
    b.value = 3
    assert.equal(result, 8)
  })

  it('should handle effect with no signal dependencies', () => {
    let ran = false
    effect(() => { ran = true })
    assert.equal(ran, true)
    // just verifying it doesn't crash
  })
})
