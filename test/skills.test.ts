import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

describe('skills', () => {
  const tmpDir = resolve(tmpdir(), 'wfw-skills-test-' + Date.now())
  const skillsDir = resolve(tmpDir, '.opencode', 'skills')
  const skillDir = resolve(skillsDir, 'test-skill')

  before(() => {
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(resolve(skillDir, 'SKILL.md'), [
      '---',
      'name: test-skill',
      'description: A test skill for unit tests',
      'license: MIT',
      'compatibility: opencode',
      '---',
      '',
      '## What I do',
      '',
      'This is the skill content.',
    ].join('\n'), 'utf-8')
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('parses SKILL.md with frontmatter', async () => {
    const { parseSkillFile } = await import('../opencode/skills.ts')
    const skill = parseSkillFile(resolve(skillDir, 'SKILL.md'))
    assert.ok(skill)
    assert.equal(skill.name, 'test-skill')
    assert.equal(skill.description, 'A test skill for unit tests')
    assert.equal(skill.license, 'MIT')
    assert.equal(skill.compatibility, 'opencode')
    assert.ok(skill.content)
    assert.ok(skill.content.includes('## What I do'))
    assert.ok(skill.content.includes('This is the skill content.'))
  })

  it('discoverSkills finds skills in .opencode/skills', async () => {
    const { discoverSkills } = await import('../opencode/skills.ts')
    const skills = discoverSkills(tmpDir)
    assert.ok(skills.length >= 1)
    const found = skills.find(s => s.name === 'test-skill')
    assert.ok(found)
  })

  it('buildSkillRegistry merges discovered and manual', async () => {
    const { discoverSkills, buildSkillRegistry } = await import('../opencode/skills.ts')
    const discovered = discoverSkills(tmpDir)
    const manual = [
      { name: 'manual-skill', description: 'Manual', content: 'Manual content' },
    ]

    const registry = buildSkillRegistry(discovered, manual)

    assert.ok(registry.get('test-skill'))
    assert.ok(registry.get('manual-skill'))
    assert.equal(registry.get('test-skill')!.content.includes('## What I do'), true)
    assert.ok(registry.list().length >= 2)
  })

  it('manual skills override discovered with same name', async () => {
    const { discoverSkills, buildSkillRegistry } = await import('../opencode/skills.ts')
    const discovered = discoverSkills(tmpDir)
    const manual = [
      { name: 'test-skill', description: 'Override', content: 'Override content' },
    ]

    const registry = buildSkillRegistry(discovered, manual)
    const skill = registry.get('test-skill')
    assert.ok(skill)
    assert.equal(skill.description, 'Override')
    assert.equal(skill.content, 'Override content')
  })

  it('returns null for invalid SKILL.md (no frontmatter)', async () => {
    const { parseSkillFile } = await import('../opencode/skills.ts')
    const invalidDir = resolve(tmpDir, 'bad-skill')
    mkdirSync(invalidDir, { recursive: true })
    const filePath = resolve(invalidDir, 'SKILL.md')
    writeFileSync(filePath, 'Just some text without frontmatter', 'utf-8')
    const result = parseSkillFile(filePath)
    assert.equal(result, null)
  })

  it('returns null for SKILL.md missing name', async () => {
    const { parseSkillFile } = await import('../opencode/skills.ts')
    const invalidDir = resolve(tmpDir, 'no-name-skill')
    mkdirSync(invalidDir, { recursive: true })
    const filePath = resolve(invalidDir, 'SKILL.md')
    writeFileSync(filePath, [
      '---',
      'description: No name here',
      '---',
      '',
      'Some content',
    ].join('\n'), 'utf-8')
    const result = parseSkillFile(filePath)
    assert.equal(result, null)
  })

  it('isSkillAllowed checks glob patterns', async () => {
    const { isSkillAllowed } = await import('../opencode/permissions.ts')
    const perms = { skill: { '*': { allow: true }, 'internal-*': { allow: false } } }
    assert.equal(isSkillAllowed('git-release', perms), true)
    assert.equal(isSkillAllowed('internal-secret', perms), false)
  })
})
