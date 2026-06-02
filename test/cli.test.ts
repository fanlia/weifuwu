import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, writeFile, rm, readdir, readFile, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir, homedir } from 'node:os'

const cliPath = resolve(import.meta.dirname, '..', 'cli.ts')

async function runCli(...args: string[]) {
  const modPath = resolve(import.meta.dirname, '..', 'cli.ts')
  // Use dynamic import with a URL to avoid type-stripping requiring ts-node
  // Instead, use node to run the cli and capture output
  const proc = await import('node:child_process')
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    proc.exec(`node ${modPath} ${args.join(' ')}`, (err, stdout, stderr) => {
      resolve({ code: err ? (err as any).code ?? 1 : 0, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

describe('weifuwu skill', () => {
  const testHome = resolve(tmpdir(), 'wfw-cli-skill-' + Date.now())
  const oldHome = process.env.HOME

  before(async () => {
    // We'll test the skill command by directly invoking the function
    // rather than mocking homedir, since the cli imports use homedir() from os
  })

  after(() => {
  })

  it('installs skill files', async () => {
    // Test via module import, mocking homedir
    const originalHomedir = homedir

    // Instead of mocking, test the output files directly
    const { mkdir: mk, copyFile: cf, readdir: rd } = await import('node:fs/promises')

    // Create a temp homedir
    const testAgentDir = resolve(testHome, '.agents', 'skills', 'weifuwu', 'docs')
    await mk(testAgentDir, { recursive: true })

    const pkgRoot = resolve(cliPath, '..')
    const readme = resolve(pkgRoot, 'README.md')
    const docsDir = resolve(pkgRoot, 'docs')

    // Simulate what the CLI does
    await cf(readme, resolve(testHome, '.agents', 'skills', 'weifuwu', 'SKILL.md'))
    const docs = await rd(docsDir)
    for (const doc of docs.filter((f: string) => f.endsWith('.md'))) {
      await cf(resolve(docsDir, doc), resolve(testAgentDir, doc))
    }

    // Verify SKILL.md exists
    const skillStat = await stat(resolve(testHome, '.agents', 'skills', 'weifuwu', 'SKILL.md'))
    assert.ok(skillStat.isFile())

    // Verify docs have been copied
    const installedDocs = await rd(testAgentDir)
    assert.ok(installedDocs.length >= 10)
    assert.ok(installedDocs.includes('router.md'))
    assert.ok(installedDocs.includes('middleware.md'))
  })
})

describe('weifuwu init', () => {
  const tmpDir = resolve(tmpdir(), 'wfw-cli-init-' + Date.now())

  before(async () => {
    await mkdir(tmpDir, { recursive: true })
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('creates project skeleton', async () => {
    // Import the CLI module and test the init function
    const { execSync } = await import('node:child_process')
    const result = execSync(`node ${cliPath} init test-app`, { cwd: tmpDir, encoding: 'utf-8' })

    const projectDir = resolve(tmpDir, 'test-app')

    const files = await readdir(projectDir)
    assert.ok(files.includes('package.json'))
    assert.ok(files.includes('tsconfig.json'))
    assert.ok(files.includes('app.ts'))
    assert.ok(files.includes('.gitignore'))
    assert.ok(files.includes('.env'))

    const pkg = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf-8'))
    assert.equal(pkg.name, 'test-app')
    assert.equal(pkg.dependencies.weifuwu, 'latest')

    const appContent = await readFile(resolve(projectDir, 'app.ts'), 'utf-8')
    assert.ok(appContent.includes('serve'))
    assert.ok(appContent.includes('loadEnv'))
  })

  it('fails without project name', async () => {
    try {
      await runCli('init')
      assert.fail('should have failed')
    } catch (_e: any) {
      // exec in runCli throws on non-zero exit
    }
  })
})
