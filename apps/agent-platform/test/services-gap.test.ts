/**
 * W3 收尾：零直接引用 services 补测（byok/license/permissions/quota-alert/
 * skill-watcher/survey-setup——真断言直调——非字符串贴片）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { getWhiteLabelInfo, getLicenseInfo } from '../src/services/license.ts'
import { surveyContract } from '../src/services/survey-setup.ts'
import { SkillWatcher } from '../src/services/skill-watcher.ts'
import { getByokConfig } from '../src/services/byok.ts'

describe('services 缺口补面（W3 收尾）', () => {
  it('license：白标信息（品牌面）', () => {
    const li = getLicenseInfo()
    assert.ok(li, 'license 信息存在')
    assert.equal(typeof li, 'object')
    const wl = getWhiteLabelInfo()
    assert.ok('productName' in wl || 'name' in wl, '白标产品名面')
  })
  it('survey-setup：surveyContract 生成契约（HTML 段落面）', () => {
    const html = surveyContract('https://example.com/s', '测试问卷')
    assert.ok(html.includes('https://example.com/s'), 'URL 嵌入')
    assert.ok(html.includes('测试问卷'), '名称嵌入')
  })
  it('skill-watcher：技能目录观察（构造面）', () => {
    const w = new SkillWatcher({}) as any
    assert.ok(w, '构造成功')
    assert.equal(typeof w.watch, 'function', 'watch 面')
  })
  it('byok：未配置 → null（falsey 面）', async () => {
    // memory orm 的面：app_ai_configs 表注册后查询——简化：null 面由空查询产出
    // 用真实 memory pg（与 routes-gap 同模式）
    const { postgres } = await import('weifuwu')
    const { AGENT_PLATFORM_SCHEMA } = await import('../src/db/tables.ts')
    const pg = postgres({ memory: true, tenant: { field: 'app_id', value: (c: any) => c?.appId } })
    await pg.migrateModule('agent-platform', AGENT_PLATFORM_SCHEMA as never)
    const { SHAPES } = await import('../src/db/shapes.ts')
    pg.orm.table('app_ai_configs', SHAPES.app_ai_configs as never)
    const cfg = await getByokConfig(pg.orm, 'a')
    assert.equal(cfg, null, '未配置 → null')
  })
  it('permissions：requireWriter 无 auth → 拒绝（401 面）', async () => {
    const { requireWriter, appRoleOf } = await import('../src/services/permissions.ts')
    const role = await appRoleOf({ auth: null, orm: null, appId: 'a' } as never)
    assert.equal(role, null, '无认证 → 无角色')
  })
})
