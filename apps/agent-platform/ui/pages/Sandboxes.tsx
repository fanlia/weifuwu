/**
 * 沙盒管理页 — 一级概念：sandbox = 计算资源（三层模型：部门=目录，sandbox=计算，agent=能力）
 *
 * 列表卡片（与 Agents 页同构）：状态徽章/镜像/网络/内存/最后使用/容器实际状态 + 生命周期操作
 * 权限：管理操作（启动/停止/重启/终止）由 API 校验（owner/admin）——失败 toast 提示
 */
import type { UIContext, Component } from 'weifuwu/vdom'
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
  runningExec: { tool: string; startedAt: number; timeoutMs: number } | null
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

export const Sandboxes: Component = (_props, ctx) => {
  let sandboxes: SandboxItem[] = []
  let quota: { used: number; limit: number; pressure: boolean } | null = null
  let loading = true
  let busyId = ''
  let error = ''
  // 诊断（2026-12 可观测性：生命周期事件 + 运行中 exec + 进程）
  let debugOf: string | null = null
  let debugData: any = null
  let debugLoading = false
  const rerender = () => ctx.render()

  const load = () => {
    loading = true; error = ''
    rerender()
    return ctx.api!.get<{ sandboxes: SandboxItem[]; quota?: { used: number; limit: number; pressure: boolean } }>('/api/sandboxes')
      .then((d) => { sandboxes = d.sandboxes ?? []; quota = d.quota ?? null; loading = false; rerender() })
      .catch((e: any) => { error = errMsg(e, '加载失败'); loading = false; rerender() })
  }
  void load()

  const loadDebug = async (id: string) => {
    debugOf = id; debugData = null; debugLoading = true; rerender()
    try {
      const d = await ctx.api!.get<any>(`/api/sandboxes/${id}/debug`)
      debugData = d; debugLoading = false; rerender()
    } catch { debugLoading = false; rerender() }
  }

  async function action(id: string, action: string, confirmText?: string) {
    if (confirmText) {
      const ok = await ctx.confirm!(confirmText)
      if (!ok) return
    }
    busyId = id + action; rerender()
    try {
      const r = await ctx.api!.post<{ ok?: boolean; success?: boolean }>(`/api/sandboxes/${id}/${action}`)
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

  return () => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="沙盒" sub="计算资源（Docker 容器）——部门 = 工作目录，沙盒 = 计算环境，Agent = 能力">
        <Button variant="ghost" onClick={() => void load()}><Icon name="refresh" size={14} /> 刷新</Button>
      </PageHeader>

      <div class="wf-font-xs wf-text-tertiary">
        三层模型：一个群聊部门 = 一个共享工作目录 + 一个沙盒环境——部门内所有 Agent 的工具（read/write/bash）都在该环境执行。
        空闲 10 分钟自动停止（瞬态保留、恢复快），停止超 24 小时自动终止（释放磁盘）。文件状态永远在卷（工作目录）——环境重建无损。
      </div>

      {/* 2026-12 并发聚合：执行中任务（P4） */}
      {sandboxes.filter((s) => s.runningExec).length > 0 && (
        <div class="wf-bg-primary wf-padding-sm wf-radius wf-font-xs wf-text-on-brand">
          ▶ 执行中 {sandboxes.filter((s) => s.runningExec).length} 个环境正在运行任务：
          {sandboxes.filter((s) => s.runningExec).slice(0, 4).map((s) => `${s.name}(${s.runningExec?.tool})`).join(' · ')}
          {sandboxes.filter((s) => s.runningExec).length > 4 ? ' …' : ''}
        </div>
      )}

      {/* M5-1 配额用量 + 压力告警（≥80% 黄条） */}
      {quota && (
        <div class={`wf-bg-tertiary wf-padding-sm wf-radius wf-font-xs ${quota.pressure ? 'wf-text-warning' : 'wf-text-tertiary'}`}>
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
                <span class="wf-font-base wf-semibold">{s.name}</span>
                <StatusDot on={statusTone(s.status)} />
                <span class={`wf-font-xs ${s.status === 'error' ? 'wf-text-error' : s.status === 'running' ? 'wf-text-success' : 'wf-text-tertiary'}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                {s.status === 'error' && s.error && <span class="wf-font-xs wf-text-error wf-truncate">— {s.error}</span>}
              </div>
              <div class="wf-font-xs wf-text-tertiary wf-margin-top-xs">
                {s.departmentName ? `部门：${s.departmentName}` : '独立沙盒'}
                {' · '}镜像 {s.image} · 内存 {s.memory_mb}MB · {s.cpus} CPU · 网络 {s.network ? '开' : '关'}
                {' · '}{s.mode === 'ephemeral' ? '一次性模式' : '常驻模式'}
              </div>
              <div class="wf-font-xs wf-text-tertiary wf-margin-top-xs">
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
              <Button size="sm" variant="ghost" onClick={() => loadDebug(s.id)} title="生命周期事件 + 运行中任务 + 容器进程">诊断</Button>
            </div>
          </div>
          {debugOf === s.id && (
            <div class="wf-bg-tertiary wf-radius wf-padding-sm wf-margin-top-sm wf-font-xs wf-stack wf-gap-xs">
              {debugLoading && <span class="wf-text-tertiary">诊断加载中...</span>}
              {debugData && (
                <>
                  <div class="wf-row wf-gap-md">
                    <span>状态：<b class="wf-medium">{debugData.sandbox?.status}</b></span>
                    {debugData.sandbox?.error && <span class="wf-text-error">错误：{debugData.sandbox.error}</span>}
                    {debugData.sandbox?.last_used_at && <span>最后使用 {new Date(debugData.sandbox.last_used_at).toLocaleString()}</span>}
                  </div>
                  {debugData.runningExec ? (
                    <div class="wf-text-primary">▶ 运行中任务：{debugData.runningExec.tool}（已 {Math.round(debugData.runningExec.elapsedMs / 1000)}s / 超时 {Math.round(debugData.runningExec.timeoutMs / 1000)}s）——{debugData.runningExec.startedAt}</div>
                  ) : <div class="wf-text-tertiary">当前无运行中任务</div>}
                  <div class="wf-text-tertiary">容器进程（{debugData.processes?.length ?? 0}）：{debugData.processes?.slice(0, 5).map((p: any) => p.CMD ?? p.Command ?? '').filter(Boolean).join(' · ') || '无'}</div>
                  <div class="wf-text-tertiary">最近事件：</div>
                  {(debugData.events ?? []).slice(0, 10).map((ev: any, i: number) => (
                    <div key={i} class="wf-row wf-gap-xs">
                      <span class="wf-text-tertiary wf-nums">{new Date(ev.created_at).toLocaleTimeString()}</span>
                      <span class={`${ev.type.includes('error') || ev.type.includes('timeout') ? 'wf-text-error' : ev.type.includes('exec_start') ? 'wf-text-primary' : 'wf-text-secondary'}`}>{ev.type}</span>
                      {ev.detail && <span class="wf-text-tertiary wf-truncate">— {ev.detail}</span>}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </Card>
      ))}
    </div>
  )
}
