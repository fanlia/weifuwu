/**
 * weifuwu/components — toast() 命令式中间件测试
 *
 * 覆盖：
 *   - 注入 ctx.toast
 *   - 调用后渲染 Toast + 消息文本 / type 变体
 *   - 自动消失（duration 控制）
 *   - 单条 duration 覆盖全局
 *   - max 限制（超出移除最早）
 *   - 点击移除
 *   - 多次调用累加
 *   - position 选项
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()

const { UIRouter, uiServe } = await import('../../ui-dom/index.ts')
import { h } from '../../ui-dom/vnode.ts'
import { toast } from './Toast.ts'

const toasts = () => Array.from(document.querySelectorAll('.wf-toast')) as HTMLElement[]

/** 等待 $ 赋值触发的微任务渲染消化 */
const flush = () => new Promise(r => setTimeout(r, 20))

afterEach(() => {
  document.querySelectorAll('#__wf_portal').forEach(el => el.remove())
  document.body.innerHTML = ''
})

/** 挂载一个真实 app + toast 中间件，返回 (ctx, app) */
async function setup(opts?: any) {
  const router = new UIRouter()
  // 默认 duration 0：不自动消失（避免 3000ms 残留定时器拖慢测试——node --test 等定时器清空）
  router.use(toast({ duration: 0, ...opts }))
  router.get('/', () => h('span', {}, 'root'))
  const el = document.createElement('div')
  document.body.appendChild(el)
  el.id = `t-${Math.random().toString(36).slice(2, 8)}`
  const handle = uiServe(router, { root: `#${el.id}` })
  await flush()
  const ctx = handle.ctx as any
  return { ctx, app: { ctx }, el }
}

describe('toast() 命令式中间件', () => {
  it('注入 ctx.toast', async () => {
    const { ctx } = await setup()
    assert.equal(typeof ctx.toast, 'function')
  })

  it('ctx.toast 渲染消息与 type 变体', async () => {
    const { ctx } = await setup()
    ctx.toast('保存成功', 'success')
    await flush()

    assert.equal(toasts().length, 1)
    assert.ok(toasts()[0].textContent!.includes('保存成功'))
    assert.ok(toasts()[0].className.includes('wf-toast--success'))
  })

  it('默认 type 为 info', async () => {
    const { ctx } = await setup()
    ctx.toast('普通消息')
    await flush()
    assert.ok(toasts()[0].className.includes('wf-toast--info'))
  })

  it('自动消失（duration 控制）', async () => {
    const { ctx } = await setup({ duration: 30 })
    ctx.toast('很快消失', 'info')
    await flush()

    assert.equal(toasts().length, 1)
    await new Promise(r => setTimeout(r, 80))
    assert.equal(toasts().length, 0, '超过 duration 后自动移除')
  })

  it('单条 duration 覆盖全局默认', async () => {
    const { ctx } = await setup({ duration: 1000 })
    ctx.toast('覆盖为快速消失', 'info', 30)
    await flush()

    await new Promise(r => setTimeout(r, 80))
    assert.equal(toasts().length, 0, '单条 duration=30 生效')
  })

  it('max 限制：超出移除最早', async () => {
    const { ctx } = await setup({ duration: 0, max: 2 })
    ctx.toast('第一条', 'info')
    await flush()
    ctx.toast('第二条', 'info')
    await flush()
    ctx.toast('第三条', 'info')
    await flush()

    const visible = toasts()
    assert.equal(visible.length, 2, '只显示最近 2 条')
    assert.ok(!visible.some(t => t.textContent!.includes('第一条')), '最早一条被移除')
    assert.ok(visible.some(t => t.textContent!.includes('第三条')))
  })

  it('点击消息移除', async () => {
    const { ctx } = await setup({ duration: 0 })
    ctx.toast('点我移除', 'info')
    await flush()
    assert.equal(toasts().length, 1)

    toasts()[0].click()
    await flush()
    assert.equal(toasts().length, 0, '点击后移除')
  })

  it('action 按钮：点击回调且不自动关闭', async () => {
    const { ctx } = await setup({ duration: 0 })
    let acted = 0
    ctx.toast('文件已删除', 'info', 0, { label: '撤销', onClick: () => { acted++ } })
    await flush()

    const btn = toasts()[0].querySelector('.wf-toast-action') as HTMLButtonElement
    assert.ok(btn, '应渲染操作按钮')
    assert.equal(btn.textContent, '撤销')
    btn.click()
    await flush()
    assert.equal(acted, 1, '回调触发')
    assert.equal(toasts().length, 1, '点击 action 不自动关闭')
  })

  it('多次调用累加显示', async () => {
    const { ctx } = await setup({ duration: 0 })
    ctx.toast('a', 'info')
    await flush()
    ctx.toast('b', 'success')
    await flush()
    ctx.toast('c', 'error')
    await flush()

    assert.equal(toasts().length, 3)
  })

  it('position 选项生效', async () => {
    const { ctx } = await setup({ position: 'bottom-left', duration: 0 })
    ctx.toast('底部左侧', 'info')
    await flush()

    const container = document.querySelector('.wf-toast-container') as HTMLElement
    assert.ok(container.className.includes('wf-toast--bl'), 'bottom-left 容器类')
  })
})
