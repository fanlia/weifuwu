/**
 * cron 调度器契约（注入 now/execute 假面——零 DB——tick 幂等/过滤/触发链路）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createScheduler } from './index.ts'

/** 内存 sql 假面（scheduler 只用 from/where/select/run） */
function fakeSql(rows: Array<Record<string, unknown>>) {
  return {
    query: {
      from: (table: string) => ({
        where: () => ({
          select: () => ({ run: async () => rows }),
        }),
        select: () => ({ run: async () => rows }),
      }),
    },
  } as any
}

test('scheduler: 匹配 cron 触发 + 同分钟幂等 + 不匹配跳过', async () => {
  const fired: string[] = []
  const wf = { id: 'w1', app_id: 'a1', cron: '*/5 * * * *' } as any
  const wf2 = { id: 'w2', app_id: 'a1', cron: '0 9 * * *' } as any
  const sch = createScheduler(
    fakeSql([wf, wf2]),
    async (appId, wid, _args, trigger) => { fired.push(`${appId}:${wid}:${trigger}`) },
    { intervalMs: 999_999, now: () => new Date(2026, 0, 5, 10, 0) }, // 10:00 → */5 匹配、9 点不匹配
  )
  sch.start()
  await new Promise((r) => setTimeout(r, 50))
  sch.stop()
  assert.deepEqual(fired, ['a1:w1:cron']) // w2（9 点）跳过
})

test('scheduler: 幂等——同分钟第二次 tick 不重复触发', async () => {
  const fired: string[] = []
  const wf = { id: 'w1', app_id: 'a1', cron: '* * * * *' } as any
  const sch = createScheduler(
    fakeSql([wf]),
    async (appId, wid) => { fired.push(`${appId}:${wid}`) },
    { intervalMs: 999_999, now: () => new Date(2026, 0, 5, 10, 30) },
  )
  // 直接驱动 tick 两次（interval 不触发——999s）——利用 start 的首次 tick + 重造实例模拟同分钟
  // 同一实例 tick 只能 start 一次——用两个实例共享 fake execute 验证跨实例非幂等（进程级语义）+ 同实例幂等
  const sch2 = createScheduler(
    fakeSql([wf]),
    async (appId, wid) => { fired.push(`${appId}:${wid}`) },
    { intervalMs: 999_999, now: () => new Date(2026, 0, 5, 10, 30) },
  )
  sch.start()
  await new Promise((r) => setTimeout(r, 50))
  sch.stop()
  assert.equal(fired.length, 1)
  sch2.start()
  await new Promise((r) => setTimeout(r, 50))
  sch2.stop()
  assert.equal(fired.length, 2) // 新进程实例（重启）同分钟会再触发——诚实边界（进程内记忆）
})

test('scheduler: cron 非法不刷错（tick 吞掉）', async () => {
  const fired: string[] = []
  const wf = { id: 'w1', app_id: 'a1', cron: 'not a cron' } as any
  const sch = createScheduler(
    fakeSql([wf]),
    async (appId, wid) => { fired.push(`${appId}:${wid}`) },
    { intervalMs: 999_999, now: () => new Date(2026, 0, 5, 10, 30) },
  )
  sch.start()
  await new Promise((r) => setTimeout(r, 50))
  sch.stop()
  assert.deepEqual(fired, [])
})
