import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crc32, zipEntries } from '../zip.ts'
import { unzip } from './helpers.ts'

test('crc32: 已知向量', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926)
  assert.equal(crc32(Buffer.from('')), 0x00000000)
  assert.equal(crc32(Buffer.from('hello world')), 0x0d4a1185)
})

test('zip: 打包后可用 unzip 完整回读（deflate）', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('hello 你好') },
    { name: 'b/c.xml', data: Buffer.from('<x>content</x>') },
  ]
  const buf = zipEntries(entries)
  const map = unzip(buf)
  assert.equal(map.size, 2)
  assert.equal(map.get('a.txt')!.toString(), 'hello 你好')
  assert.equal(map.get('b/c.xml')!.toString(), '<x>content</x>')
})

test('zip: 确定性 — 同一输入两次打包字节一致', () => {
  const entries = [{ name: 'x', data: Buffer.from('data') }]
  const a = zipEntries(entries)
  const b = zipEntries(entries)
  assert.deepEqual(a, b)
})

test('zip: store 方法也可回读', () => {
  const buf = zipEntries([{ name: 's.bin', data: Buffer.from([1, 2, 3, 255]), method: 0 }])
  const map = unzip(buf)
  assert.deepEqual([...map.get('s.bin')!], [1, 2, 3, 255])
})
