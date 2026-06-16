/**
 * Minimal mock MCP server for testing.
 * Responds to JSON-RPC over stdio.
 * 
 * Usage: node mock-mcp-server.mjs [mode]
 *   mode = 'default' | 'slow' | 'error'
 */
import { createInterface } from 'node:readline'

const mode = process.argv[2] || 'default'

const rl = createInterface({ input: process.stdin })

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line)

    if (msg.method === 'initialize') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '0.1.0',
          capabilities: { tools: {} },
          serverInfo: { name: 'mock-mcp', version: '1.0.0' },
        },
      }) + '\n')
      return
    }

    if (msg.method === 'notifications/initialized') {
      return
    }

    if (msg.method === 'tools/list') {
      if (mode === 'error') {
        process.stdout.write(JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          error: { code: -32603, message: 'Internal error' },
        }) + '\n')
        return
      }

      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          tools: [
            {
              name: 'greet',
              description: 'Greet someone by name',
              inputSchema: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'The name to greet' },
                  count: { type: 'integer', description: 'Number of times to greet' },
                },
                required: ['name'],
              },
            },
            {
              name: 'add',
              description: 'Add two numbers',
              inputSchema: {
                type: 'object',
                properties: {
                  a: { type: 'number', description: 'First number' },
                  b: { type: 'number', description: 'Second number' },
                },
                required: ['a', 'b'],
              },
            },
            {
              name: 'echo',
              description: 'Echo back input',
              inputSchema: {
                type: 'object',
                properties: {
                  text: { type: 'string', description: 'Text to echo' },
                },
                required: ['text'],
              },
            },
          ],
        },
      }) + '\n')
      return
    }

    if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params
      let result

      if (name === 'greet') {
        const count = (args && args.count) || 1
        const greetings = Array(count).fill('Hello, ' + args.name + '!').join('\n')
        result = { content: [{ type: 'text', text: greetings }] }
      } else if (name === 'add') {
        result = { content: [{ type: 'text', text: String(args.a + args.b) }] }
      } else if (name === 'echo') {
        result = { content: [{ type: 'text', text: args.text }] }
      } else {
        result = { content: [{ type: 'text', text: 'Unknown tool' }] }
      }

      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result,
      }) + '\n')
      return
    }

    if (msg.method === 'shutdown') {
      process.stdout.write(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: null,
      }) + '\n')
      process.exit(0)
    }
  } catch {
    // Ignore parse errors
  }
})
