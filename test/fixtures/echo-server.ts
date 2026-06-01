import http from 'node:http'

const port = parseInt(process.env.PORT ?? '0', 10)

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('healthy')
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('echo')
  }
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})

server.listen(port, () => {
  process.stdout?.write(`listening on ${(server.address() as any).port}\n`)
})
