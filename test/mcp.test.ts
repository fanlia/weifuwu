 
import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mcpClient } from '../mcp.ts'

const mockServer = resolve(fileURLToPath(import.meta.url), '..', 'fixtures', 'mock-mcp-server.mjs')

describe('mcpClient', () => {
  after(async () => {
    // Allow any lingering processes to be cleaned up by GC
    await new Promise((r) => setTimeout(r, 200))
  })

  it('should get tools from MCP server and convert to AI SDK tools', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: [mockServer],
      timeout: 5000,
    })

    try {
      const tools = await client.getTools()

      assert.ok(tools.echo, 'should have echo tool')
      assert.ok(tools.greet, 'should have greet tool')
      assert.ok(tools.add, 'should have add tool')
      assert.equal(typeof tools.echo.execute, 'function', 'execute should be a function')
      assert.equal(typeof tools.greet.execute, 'function', 'execute should be a function')
      assert.equal(typeof tools.add.execute, 'function', 'execute should be a function')

      // Call the echo tool
      const result = await tools.echo.execute({ text: 'hello world' }, {} as any)
      assert.equal(result, 'hello world')
    } finally {
      await client.close()
    }
  })

  it('should execute add tool with arguments', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: [mockServer],
      timeout: 5000,
    })

    try {
      const tools = await client.getTools()
      const result = await tools.add.execute({ a: 40, b: 2 }, {} as any)
      assert.equal(result, '42')

      // Test callTool directly
      const directResult = await client.callTool('add', { a: 10, b: 20 })
      assert.equal(directResult, '30')
    } finally {
      await client.close()
    }
  })

  it('should execute greet tool with optional arguments', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: [mockServer],
      timeout: 5000,
    })

    try {
      const tools = await client.getTools()
      const result = await tools.greet.execute({ name: 'Alice' }, {} as any)
      assert.equal(result, 'Hello, Alice!')
    } finally {
      await client.close()
    }
  })

  it('should refresh tool definitions (re-list)', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: [mockServer],
      timeout: 5000,
    })

    try {
      const first = await client.getTools()
      assert.ok(first.echo, 'first call should have tools')

      // Refresh — since the same server is used, tools should be the same
      await client.refresh()
      const second = await client.getTools()
      assert.ok(second.echo, 'refresh should still return tools')
    } finally {
      await client.close()
    }
  })

  it('should handle server that exits before responding (timeout)', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: ['-e', 'process.stdin.on("data", () => {});'],
      timeout: 2000,
    })

    try {
      await assert.rejects(
        () => client.getTools(),
        /timed out/,
        'should reject on timeout when server never responds',
      )
    } finally {
      await client.close()
    }
  })

  it('should handle close gracefully', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: [mockServer],
      timeout: 5000,
    })

    // Should not throw
    await client.getTools()
    await client.close()
  })

  it('should handle MCP server error response', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: [mockServer, 'error'],
      timeout: 5000,
    })

    try {
      await assert.rejects(() => client.getTools(), /MCP error/, 'should reject on server error')
    } finally {
      await client.close()
    }
  })

  it('should produce tools compatible with agent() Record<string, Tool>', async () => {
    const client = mcpClient({
      command: process.execPath,
      args: [mockServer],
      timeout: 5000,
    })

    try {
      const tools = await client.getTools()

      // Verify tools match the shape agent() expects: Record<string, Tool>
      // where Tool has execute, description, parameters
      assert.ok(tools.weather === undefined, 'no weather tool by default') // sanity check
      assert.equal(typeof tools.echo.execute, 'function')

      // Direct callTool works
      const echoResult = await client.callTool('echo', { text: 'direct' })
      assert.equal(echoResult, 'direct')
    } finally {
      await client.close()
    }
  })
})
