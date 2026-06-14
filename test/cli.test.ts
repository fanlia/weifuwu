import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, rm, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'

void describe('CLI', () => {
  let tmpDir: string
  let projectRoot: string

  before(async () => {
    tmpDir = join(tmpdir(), 'weifuwu-cli-test-' + randomUUID().slice(0, 8))
    await mkdir(tmpDir, { recursive: true })
    projectRoot = process.cwd()
  })

  after(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  void describe('cmdVersion', () => {
    it('prints version from package.json', () => {
      const cliPath = join(projectRoot, 'cli.ts')
      const output = execSync(`node ${cliPath} version`, {
        cwd: projectRoot,
        stdio: 'pipe',
        timeout: 10_000,
      }).toString().trim()
      assert.ok(output.length > 0)
      assert.match(output, /^\d+\.\d+\.\d+$/)
    })
  })

  void describe('cmdInit', () => {
    it('creates project directory with template files', async () => {
      const cliPath = join(projectRoot, 'cli.ts')
      execSync(`node ${cliPath} init test-project --skip-install`, {
        cwd: tmpDir,
        stdio: 'pipe',
        timeout: 15_000,
      })

      const projectDir = join(tmpDir, 'test-project')
      await access(join(projectDir, 'index.ts'))
      await access(join(projectDir, 'app.ts'))
      await access(join(projectDir, 'package.json'))

      const pkg = JSON.parse(await readFile(join(projectDir, 'package.json'), 'utf-8'))
      assert.ok(pkg.dependencies?.weifuwu)
    })

    it('creates minimal project with --minimal flag', async () => {
      const cliPath = join(projectRoot, 'cli.ts')
      execSync(`node ${cliPath} init minimal-project --minimal --skip-install`, {
        cwd: tmpDir,
        stdio: 'pipe',
        timeout: 15_000,
      })

      const projectDir = join(tmpDir, 'minimal-project')
      await access(join(projectDir, 'index.ts'))
      await access(join(projectDir, 'package.json'))
    })
  })

  void describe('cmdGenerate', () => {
    it('generates module scaffold with test file', async () => {
      const cliPath = join(projectRoot, 'cli.ts')

      // Create project first
      execSync(`node ${cliPath} init gen-test --minimal --skip-install`, {
        cwd: tmpDir,
        stdio: 'pipe',
        timeout: 15_000,
      })

      const projectDir = join(tmpDir, 'gen-test')

      // Generate module inside project
      execSync(`node ${cliPath} generate module my-mod -y`, {
        cwd: projectDir,
        stdio: 'pipe',
        timeout: 15_000,
      })

      await access(join(projectDir, 'my-mod', 'index.ts'))
      await access(join(projectDir, 'test', 'my-mod.test.ts'))
    })
  })
})
