/**
 * agent-builder 后端——Agent 世界模拟平台（Phase 1：世界数据模型 + CRUD API）
 * 独立运行：node server.ts → http://localhost:3400
 */
import { serve, Router, ui, postgres, ai } from 'weifuwu'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerWorldRoutes, WORLD_SCHEMA } from './src/routes/worlds.ts'
import { setWorldHub } from './src/services/engine.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── 数据库（DATABASE_URL——postgres 中间件注入 ctx.sql） ──
const pg = postgres()

// schema（CREATE IF NOT EXISTS——幂等——每次启动执行保证演进表结构
// 生效（isMigrated 一次性门会让后续新增表不建——真实事故——turns 表缺失））
await pg.migrate()
await pg.sql.unsafe(WORLD_SCHEMA)

const app = new Router()
app.use(pg)
app.use(ai({ embedding: {} })) // ctx.ai（DEEPSEEK_API_KEY——回合引擎 LLM）
app.use(ui())

// 世界 API（Phase 1：worlds/agents/relations/events CRUD）
registerWorldRoutes(app)

// ── 自闭环问卷页（browse 回合测试——真实浏览器填写——无需外部网站） ──
app.get('/demo-survey', async (_req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>产品满意度问卷</title>
<style>
  body { font-family: system-ui; max-width: 560px; margin: 40px auto; padding: 0 16px; color: #1a1a1a }
  h1 { font-size: 20px } .q { margin: 18px 0 } label { display: block; margin: 4px 0 }
  input[type=text], select, textarea { width: 100%; box-sizing: border-box; padding: 6px; margin-top: 4px }
  button { margin-top: 16px; padding: 8px 24px; cursor: pointer }
</style></head>
<body>
  <h1>产品满意度问卷</h1>
  <form id="survey" action="/demo-survey/submit" method="POST">
    <div class="q">1. 您的工作角色：
      <select name="role" id="role">
        <option value="">请选择</option>
        <option value="finance">财务</option><option value="market">市场</option>
        <option value="product">产品</option><option value="tech">技术</option>
      </select></div>
    <div class="q">2. 总体满意度：
      <label><input type="radio" name="sat" value="1"> 1（非常不满意）</label>
      <label><input type="radio" name="sat" value="2"> 2</label>
      <label><input type="radio" name="sat" value="3"> 3</label>
      <label><input type="radio" name="sat" value="4"> 4</label>
      <label><input type="radio" name="sat" value="5"> 5（非常满意）</label></div>
    <div class="q">3. 价格评价：
      <input type="text" name="price" id="price" placeholder="对定价的看法"></div>
    <div class="q">4. 改进建议：
      <textarea name="advice" id="advice" rows="3" placeholder="你的建议"></textarea></div>
    <div class="q"><label><input type="checkbox" name="rec" id="rec" value="yes"> 5. 愿意推荐给同事</label></div>
    <button type="submit" id="submit">提交问卷</button>
  </form>
</body></html>
`)
app.post('/demo-survey/submit', async (_req, ctx) => {
  // 提交成功 → 成功页（验证闭环）
  return ctx.ui.html`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>已提交</title></head>
<body style="font-family:system-ui;text-align:center;padding:80px 16px">
  <h1 style="font-size:24px">✅ 已提交</h1>
  <p style="color:#666">感谢参与！你的回答已记录。</p>
</body></html>`
})

// ── 世界实时通道（WS——借鉴 agent-platform 实时统计——回合状态推送） ──
/** 全局 hub（app.ws 注入——engine 推送回合状态——跨路由/后台可达） */
export const worldHub: { current: any } = { current: null }

app.ws('/worlds/:id/live', {
  open: (ws: any, ctx: any) => {
    // WS handler ctx 无中间件注入（真实事故——pg 只注 HTTP ctx——不查库——
    // 快照由前端 HTTP load 拿——WS 仅推送）
    const room = `world:${ctx.params?.id}`
    ctx.hub.join(room, ws)
    worldHub.current = ctx.hub
    setWorldHub(ctx.hub)
    ws.send(JSON.stringify({ type: 'world:live', worldId: ctx.params?.id }))
  },
  close: (ws: any, ctx: any) => {
    ctx.hub.leave(`world:${ctx.params?.id}`, ws)
  },
})

// ── UI（纯框架消费——UIRouter + components） ──
app.get('/app.js', (req, ctx) => ctx.ui.js(resolve(__dirname, 'ui/main.tsx')))
app.get('/components.css', (req, ctx) => ctx.ui.css('weifuwu/components/style.css'))

app.get('/*', async (req, ctx) => ctx.ui.html`
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/components.css">
  <title>agent-builder</title>
</head>
<body>
  <div id="root"></div>
  <script src="/app.js"></script>
</body>
</html>
`)

serve(app, { port: 3400 })
console.log('agent-builder → http://localhost:3400')
