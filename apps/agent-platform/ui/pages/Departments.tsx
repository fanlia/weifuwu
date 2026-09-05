import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, Ava, EmptyState, Loading } from '../components/ui'
import { Badge, Button, Card, Icon } from 'weifuwu/components'
import { isTenantOwner, clientRole, writeDenyReason } from '../lib/roles'
import type { Department, DepartmentListResponse } from '../lib/types'

interface DepartmentsState {
  depts: Department[]; loading: boolean; q: string
}

export const Departments: Component = (_props, ctx) => {
  // W1 迁移（Agents 范本——Tests 实录同款）：load+ctx.render 是 pre-
  // useAsyncData——工厂期异步启动在 v2 段复用下数据不刷新；useAsyncData
  // 并发合并/竞态取消/缓存保留——getter 渲染期读（工厂期解构 = 快照 bug
  // 实证——Agents W1 实录）
  const $ = {} as DepartmentsState
  $.depts = []; $.q = ''
  let qTimer: ReturnType<typeof setTimeout> | null = null
  let qValue = ''
  const [getDepts, reloadDepts] = ctx.ui.useAsyncData(async () => {
    const q = qValue
    const d = await ctx.api.get<DepartmentListResponse>(`/api/departments${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    return d.departments ?? []
  }, 'departments-page')
  const onQInput = (e: Event) => {
    const v = ((e as unknown as { target: { value: string } }).target?.value ?? '')
    $.q = v; ctx.render()
    if (qTimer) clearTimeout(qTimer)
    qTimer = setTimeout(() => reloadDepts(), 300)
  }

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    const ok = await ctx.confirm('确定删除这个部门吗？')
    if (!ok) return
    try {
      // API 封装返回 JSON body——res.ok 不存在——不 throw 即成功
      // （2026-08 UI 测试抓出：删除成功却报「删除失败」——响应判断错）
      await ctx.api.delete(`/api/departments/${id}`)
      reloadDepts()  // 真源刷新
      ;ctx.toast('部门已删除', 'success')
    } catch {
      ;ctx.toast('删除失败', 'error')
    }
  }
  return (props) => {
    const loading = getDepts() === null
    const depts = getDepts() ?? []
    return (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="部门" sub="组织 Agent 与成员进行协作对话">
        {/* ROLES-OPTIMIZATION 波次 2：写入口遮蔽（与 API 403 双保险——前端不点后端必拒）。
            建部门仅 owner（波次 1 裁剪后）——member/viewer 禁用 + tooltip 引导 */}
        <Button variant="primary" disabled={!isTenantOwner()}
          title={isTenantOwner() ? undefined : (clientRole() === 'viewer' ? writeDenyReason() : '只有租户所有者可以创建部门')}
          onClick={() => ctx.app?.navigate('/departments/new')}>＋ 创建部门</Button>
      </PageHeader>
      <div class="wf-row wf-gap-sm wf-items-center">
        <div class="wf-fill" style="max-width: 320px">
          <input class="wf-input wf-padding-x-sm wf-padding-y-xs" placeholder="搜索部门（名称——1000 实体可管）" value={$.q} onInput={onQInput} />
        </div>
        <span class="wf-font-xs wf-text-tertiary">{loading ? '加载中…' : `${depts.length} 个`}</span>
      </div>

      {loading && <Loading />}
      {!loading && depts.length === 0 && <EmptyState icon={<Icon name="users" />} text="暂无部门" hint="点击上方按钮创建第一个部门" />}

      {depts.length > 0 && (
        <div class="wf-grid">
          {depts.map((d: Department) => (
            <Card key={d.id} clickable hover onClick={() => ctx.app?.navigate(`/departments/${d.id}`)}>
              <div class="wf-row wf-gap-sm">
                <Ava name={d.is_dm ? '💬' : '👥'} type={d.is_dm ? 'user' : 'knowledge_base'} />
                <div class="wf-fill wf-font-base wf-semibold wf-truncate">{d.name ?? '未命名'}</div>
                <Badge variant={d.is_dm ? 'primary' : 'default'}>{d.is_dm ? '单聊' : '群聊'}</Badge>
              </div>
              <div class="wf-font-sm wf-text-secondary wf-margin-top-sm">当前应用群组</div>
              <div class="wf-split wf-margin-top-md">
                <span class="wf-font-xs wf-text-tertiary">{d.member_count ?? 0} 位成员</span>
                <div class="wf-row wf-gap-sm">
                  <Button size="sm" variant="ghost"
                    onClick={(e: Event) => { e.stopPropagation(); ctx.app?.navigate(`/chat/${d.id}`) }}>聊天</Button>
                  <Button size="sm" variant="danger" onClick={(e: Event) => remove(e, d.id)}>删除</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
    )
  }
}
