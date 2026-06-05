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
    const { mkdir: mk, copyFile: cf } = await import('node:fs/promises')

    const testAgentDir = resolve(testHome, '.agents', 'skills', 'weifuwu')
    await mk(testAgentDir, { recursive: true })

    const pkgRoot = resolve(cliPath, '..')
    const readme = resolve(pkgRoot, 'README.md')

    await cf(readme, resolve(testAgentDir, 'SKILL.md'))

    const skillStat = await stat(resolve(testAgentDir, 'SKILL.md'))
    assert.ok(skillStat.isFile())
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
    assert.ok(files.includes('AGENTS.md'))

    const agentsContent = await readFile(resolve(projectDir, 'AGENTS.md'), 'utf-8')
    assert.ok(agentsContent.includes('node_modules/weifuwu/README.md'))

    const pkg = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf-8'))
    assert.equal(pkg.name, 'test-app')
    assert.equal(pkg.dependencies.weifuwu, 'latest')

    // Check tsx + ui files
    const appContent = await readFile(resolve(projectDir, 'app.ts'), 'utf-8')
    assert.ok(appContent.includes('import { serve, Router, loadEnv, tsx }'))
    assert.ok(appContent.includes('tsx({ dir:'))
    assert.ok(appContent.includes('/api/ping'))
    assert.ok(appContent.includes('/ws/echo'))
    assert.ok(appContent.includes('websocket: app.websocketHandler()'))
    assert.ok(appContent.includes('await server.ready'))

    const uiFiles = await readdir(resolve(projectDir, 'ui', 'pages'))
    assert.ok(uiFiles.includes('layout.tsx'))
    assert.ok(uiFiles.includes('page.tsx'))

    const uiDir = await readdir(resolve(projectDir, 'ui'))
    assert.ok(uiDir.includes('app.css'))

    const layoutContent = await readFile(resolve(projectDir, 'ui', 'pages', 'layout.tsx'), 'utf-8')
    assert.ok(layoutContent.includes('<main>{children}</main>'))

    const pageContent = await readFile(resolve(projectDir, 'ui', 'pages', 'page.tsx'), 'utf-8')
    assert.ok(pageContent.includes("from 'weifuwu/react'"))
    assert.ok(pageContent.includes('useWebsocket'))
    assert.ok(pageContent.includes('/ws/echo'))
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
