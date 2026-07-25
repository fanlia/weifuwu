/**
 * 角色模板测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getRoleTemplates } from '../src/routes/role-templates.ts'

describe('Role Templates', () => {
  it('返回 9 个模板', () => {
    const templates = getRoleTemplates()
    assert.equal(templates.length, 9)
  })

  it('每个模板有必填字段', () => {
    for (const t of getRoleTemplates()) {
      assert.ok(t.slug, `slug missing for ${t.name}`)
      assert.ok(t.name, 'name missing')
      assert.ok(t.icon, 'icon missing')
      assert.ok(t.category, 'category missing')
      assert.ok(t.description, 'description missing')
      assert.ok(t.default_system_prompt, `system_prompt missing for ${t.name}`)
      assert.equal(typeof t.default_temperature, 'number')
      assert.equal(typeof t.default_max_tokens, 'number')
      assert.equal(typeof t.default_allow_file_tools, 'boolean')
      assert.equal(typeof t.default_allow_command_exec, 'boolean')
      assert.ok(Array.isArray(t.default_skills))
    }
  })

  it('developer 模板有文件工具和 bash', () => {
    const t = getRoleTemplates().find(t => t.slug === 'developer')
    assert.ok(t)
    assert.equal(t!.default_allow_file_tools, true)
    assert.equal(t!.default_allow_command_exec, true)
    assert.ok(t!.default_skills.includes('search-knowledge-base'))
  })

  it('customer-support 模板无文件工具', () => {
    const t = getRoleTemplates().find(t => t.slug === 'customer-support')
    assert.ok(t)
    assert.equal(t!.default_allow_file_tools, false)
    assert.equal(t!.default_allow_command_exec, false)
  })

  it('general 模板无技能', () => {
    const t = getRoleTemplates().find(t => t.slug === 'general')
    assert.ok(t)
    assert.equal(t!.default_skills.length, 0)
  })

  it('所有 slug 唯一', () => {
    const templates = getRoleTemplates()
    const slugs = templates.map(t => t.slug)
    assert.equal(new Set(slugs).size, slugs.length)
  })

  it('ops-bot 模板包含两个技能', () => {
    const t = getRoleTemplates().find(t => t.slug === 'ops-bot')
    assert.ok(t)
    assert.ok(t!.default_skills.includes('search-knowledge-base'))
    assert.ok(t!.default_skills.includes('get-current-time'))
  })
})
