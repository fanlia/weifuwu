/**
 * userSystem — B3 登录时间侧信道（邮箱枚举）契约测试
 *
 * 原缺陷：login / loginApp 对不存在邮箱**立即** 401（无 scrypt——~1ms）而
 * 错误密码走 verifyPassword（scrypt N=16384 —— ~45ms）——消息统一但耗时未统一
 * → 时序攻击可按响应时间枚举邮箱（响应时间即签名）。
 * 修复：不存在邮箱 / SSO 无密码账号（password_hash=null）也执行一次
 * dummy scrypt verify（同参数同耗时拉平）。
 *
 * 断言方式：mock verifyPassword 调用计数（比时钟断言稳定——不引入计时 flake）。
 * 运行需 --experimental-test-module-mocks（见 package.json test:server）。
 */
import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'

describe('userSystem timing 拉平（B3）', () => {
  it('不存在邮箱 / SSO 账号 / loginApp：均执行一次 verifyPassword（dummy 拉平）', async () => {
    let verifyCalls = 0
    // 先捕获真实实现（mock 后的模块需提供 hashPassword 真实语义）
    const real = await import('../user/password.ts')
    mock.module('../user/password.ts', {
      namedExports: {
        hashPassword: real.hashPassword,
        verifyPassword: async () => {
          verifyCalls++
          return false
        },
      },
    })
    const { userSystem } = await import('../user/index.ts')
    const { createMemoryOrm } = await import('../db/memory-sql.ts')
    const { WEIFUWU_USER_SCHEMA } = await import('../user/index.ts')

    const db = createMemoryOrm()
    db.mem.applySchema(WEIFUWU_USER_SCHEMA)
    const users = userSystem({ orm: db.orm, secret: 'test-secret-0123456789abcdef' })
    await users.migrate()

    async function authCtx() {
      const ctx: any = {}
      await users(new Request('http://localhost/'), ctx, async () => new Response('ok'))
      return ctx
    }
    const reject401 = (e: any) => e?.status === 401

    // ① 不存在邮箱 → dummy verify 1 次
    const ctx1 = await authCtx()
    await assert.rejects(() => ctx1.auth.login('ghost-1@timing.test', 'password123'), reject401)
    assert.equal(verifyCalls, 1, '不存在邮箱必须执行 dummy scrypt（拉平耗时）')

    // ② SSO 无密码账号 → dummy verify 1 次
    const ctx2 = await authCtx()
    await ctx2.auth.ssoLogin('sso@timing.test')
    await assert.rejects(() => ctx2.auth.login('sso@timing.test', 'whatever'), reject401)
    assert.equal(verifyCalls, 2, 'SSO 无密码账号同样拉平')

    // ③ 存在账号 + 错误密码 → 真实 verify 1 次（路径不变）
    const ctx3 = await authCtx()
    await ctx3.auth.register({ email: 'real@timing.test', password: 'password123' })
    await assert.rejects(() => ctx3.auth.login('real@timing.test', 'wrongpass'), reject401)
    assert.equal(verifyCalls, 3)

    // ④ loginApp 不存在邮箱（app 存在）→ dummy verify 1 次
    const ctx4 = await authCtx()
    await ctx4.auth.register({ email: 'owner@timing.test', password: 'password123' })
    await ctx4.auth.createApp({ slug: 'timing-app', name: 'Timing' })
    await assert.rejects(() => ctx4.auth.loginApp('timing-app', 'ghost-4@timing.test', 'password123'), reject401)
    assert.equal(verifyCalls, 4, 'loginApp 端点同样拉平')

    await db.close()
  })
})
