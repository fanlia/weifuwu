/**
 * 沙盒管理页 — 一级概念：sandbox = 计算资源（三层模型：部门=目录，sandbox=计算，agent=能力）
 *
 * 列表卡片（与 Agents 页同构）：状态徽章/镜像/网络/内存/最后使用/容器实际状态 + 生命周期操作
 * 权限：管理操作（启动/停止/重启/终止）由 API 校验（owner/admin）——失败 toast 提示
 */
import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, EmptyState, Loading, StatusDot, errMsg } from '../components/ui'
import { Button, Card, Icon } from 'weifuwu/components'

interface SandboxItem {
  id: string
  name: string
  department_id: string | null
  departmentName: string | null
  status: 'requested' | 'running' | 'stopped' | 'terminated' | 'error'
  mode: string
  image: string
  network: boolean
  memory_mb: number
  cpus: number
  error: string | null
  created_at: string
  last_used_at: string | null
  containerStatus: string | null
}

const STATUS_LABEL: Record<string, string> = {
  running: '运行中',
  stopped: '已停止',
  requested: '待启动',
  terminated: '已终止',
  error: '错误',
}

function statusTone(s: string): boolean {
  return s === 'running' || s === 'requested'
}

export const Sandboxes: Component = async (_props, ctx) => {
  let sandboxes: SandboxItem[] = []
  let quota: { used: number; limit: number; pressure: boolean } | null = null
  let loading = true
  let busyId = ''
  let error = ''
  const rerender = () => ctx.ui.render()

  const load = () => {
    loading = true; error = ''
    rerender()
    return ctx.api!.get<{ sandboxes: SandboxItem[]; quota?: { used: number; limit: number; pressure: boolean } }>('/api/sandboxes')
      .then((d) => { sandboxes = d.sandboxes ?? []; quota = d.quota ?? null; loading = false; rerender() })
      .catch((e: any) => { error = errMsg(e, '加载失败'); loading = false; rerender() })
  }
  void load()

  async function action(id: string, action: string, confirmText?: string) {
    if (confirmText) {
      const ok = await ctx.confirm!(confirmText)
      if (!ok) return
    }
    busyId = id + action; rerender()
    try {
      const r = await ctx.api!.post(`/api/sandboxes/${id}/${action}`)
      if (r.ok || r.success) {
        ctx.toast!(`操作成功：${action}`, 'success')
      } else {
        ctx.toast!((r as any).error ?? `操作失败：${action}`, 'error')
      }
    } catch (e: any) {
      ctx.toast!(errMsg(e, `操作失败：${action}`), 'error')
    }
    busyId = ''; rerender()
    await load()
  }

  return async () => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="沙盒" sub="计算资源（Docker 容器）——部门 = 工作目录，沙盒 = 计算环境，Agent = 能力">
        <Button variant="ghost" onClick={() => void load()}><Icon name="refresh" size={14} /> 刷新</Button>
      </PageHeader>

      <div class="wf-text-xs wf-text-tertiary">
        三层模型：一个群聊部门 = 一个共享工作目录 + 一个沙盒环境——部门内所有 Agent 的工具（read/write/bash）都在该环境执行。
        空闲 10 分钟自动停止（瞬态保留、恢复快），停止超 24 小时自动终止（释放磁盘）。文件状态永远在卷（工作目录）——环境重建无损。
      </div>

      {/* M5-1 配额用量 + 压力告警（≥80% 黄条） */}
      {quota && (
        <div class={`wf-bg-tertiary wf-p-sm wf-rounded wf-text-xs ${quota.pressure ? 'wf-text-warning' : 'wf-text-tertiary'}`}>
          配额用量：{quota.used} / {quota.limit} 个{quota.pressure ? '（接近上限——终止不用的沙盒释放配额）' : ''}
        </div>
      )}

      {loading && <Loading />}
      {!loading && error && <EmptyState icon="⚠️" text={error}><Button size="sm" onClick={() => void load()}>重试</Button></EmptyState>}
      {!loading && !error && sandboxes.length === 0 && (
        <EmptyState icon="📦" text="还没有沙盒" hint="部门内 Agent 首次使用文件/命令工具时自动创建；或在部门详情页手动创建">
        </EmptyState>
      )}

      {sandboxes.map((s: SandboxItem) => (
        <Card key={s.id}>
          <div class="wf-row wf-gap-sm">
            <div class="wf-fill wf-stack wf-gap-none">
              <div class="wf-row wf-gap-sm wf-items-center">
                <span class="wf-text-base wf-text-semibold">{s.name}</span>
                <StatusDot on={statusTone(s.status)} />
                <span class={`wf-text-xs ${s.status === 'error' ? 'wf-text-danger' : s.status === 'running' ? 'wf-text-success' : 'wf-text-tertiary'}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                {s.status === 'error' && s.error && <span class="wf-text-xs wf-text-danger wf-truncate">— {s.error}</span>}
              </div>
              <div class="wf-text-xs wf-text-tertiary wf-mt-xs">
                {s.departmentName ? `部门：${s.departmentName}` : '独立沙盒'}
                {' · '}镜像 {s.image} · 内存 {s.memory_mb}MB · {s.cpus} CPU · 网络 {s.network ? '开' : '关'}
                {' · '}{s.mode === 'ephemeral' ? '一次性模式' : '常驻模式'}
              </div>
              <div class="wf-text-xs wf-text-tertiary wf-mt-xs">
                创建 {new Date(s.created_at).toLocaleString()}
                {s.last_used_at ? ` · 最后使用 ${new Date(s.last_used_at).toLocaleString()}` : ''}
                {s.containerStatus ? ` · 容器 ${s.containerStatus}` : ''}
              </div>
            </div>
            <div class="wf-row wf-gap-xs">
              {s.status !== 'terminated' && (
                <>
                  {s.status === 'running' ? (
                    <>
                      <Button size="sm" variant="ghost" disabled={busyId === s.id + 'stop'} onClick={() => action(s.id, 'stop')}>停止</Button>
                      <Button size="sm" variant="ghost" disabled={busyId === s.id + 'restart'} onClick={() => action(s.id, 'restart')}>重启</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="primary" disabled={busyId === s.id + 'start'} onClick={() => action(s.id, 'start')}>启动</Button>
                  )}
                  <Button size="sm" variant="danger-ghost" disabled={busyId === s.id + 'terminate'}
                    onClick={() => action(s.id, 'terminate', `确定终止沙盒「${s.name}」？容器将删除（工作目录文件保留）`)}>终止</Button>
                </>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}
