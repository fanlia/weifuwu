import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../client-state.ts'

describe('createStore', () => {
  it('getState returns initial state', () => {
    const store = createStore({ count: 0, name: 'test' })
    assert.deepEqual(store.getState(), { count: 0, name: 'test' })
  })

  it('setState updates state', () => {
    const store = createStore({ count: 0 })
    store.setState({ count: 1 })
    assert.equal(store.getState().count, 1)
  })

  it('setState merges partial', () => {
    const store = createStore({ a: 1, b: 2 })
    store.setState({ a: 10 })
    assert.deepEqual(store.getState(), { a: 10, b: 2 })
  })

  it('setState accepts updater function', () => {
    const store = createStore({ count: 0 })
    store.setState((s) => ({ count: s.count + 1 }))
    assert.equal(store.getState().count, 1)
  })

  it('subscribe notifies on setState', () => {
    const store = createStore({ count: 0 })
    let called = 0
    const unsub = store.subscribe(() => called++)
    assert.equal(called, 0)
    store.setState({ count: 1 })
    assert.equal(called, 1)
    unsub()
    store.setState({ count: 2 })
    assert.equal(called, 1)
  })

  it('multiple subscribers', () => {
    const store = createStore({ count: 0 })
    let a = 0,
      b = 0
    store.subscribe(() => a++)
    store.subscribe(() => b++)
    store.setState({ count: 1 })
    assert.equal(a, 1)
    assert.equal(b, 1)
  })

  it('setState with empty partial does nothing', () => {
    const store = createStore({ count: 0 })
    store.setState({})
    assert.equal(store.getState().count, 0)
  })

  it('subscribe returns unsubscribe function', () => {
    const store = createStore({ count: 0 })
    let called = 0
    const unsub = store.subscribe(() => called++)
    unsub()
    unsub() // calling twice should not throw
    store.setState({ count: 1 })
    assert.equal(called, 0)
  })
})
