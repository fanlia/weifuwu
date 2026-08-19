import type { Component } from 'weifuwu/vdom'
import { PageHeader, Tabs, Form, Field, Input, Switch, Select, Button, Alert, Space } from 'weifuwu/components'

// ─────────────────────────────────────────────────────────────
// 模式 11：设置页（Settings Page）
//
// 多分区设置：Tabs 分块 + Form 表单 + 开关项 + 保存反馈。
// 复制此文件即可得到一个标准的"设置页"：
//   - PageHeader（标题 + 保存按钮）
//   - Tabs（基本设置 / 通知 / 安全——分区）
//   - Form + Field（表单校验）
//   - Switch（开关项——通知开关）
//   - Alert（保存成功反馈）
// 改造：换分区/字段 → 自己的设置项。
// ─────────────────────────────────────────────────────────────

export const SettingsPage: Component = async (_init: any, ctx: any) => {
  let tab = 'basic'
  let saved = false
  let saving = false
  let name = '团队工作台'
  let email = 'admin@acme.cn'
  let notifyOrder = true
  let notifyDigest = false
  let twoFactor = true

  const save = () => {
    saving = true
    saved = false
    ctx.render()
    setTimeout(() => { saving = false; saved = true; ctx.render() }, 800)
  }

  return async (_p: any) => (
    <div class="wf-container wf-stack" style="--wf-max:760px;--wf-gap:16px;padding:24px 16px">
      <PageHeader title="系统设置" sub="工作区偏好、通知与安全">
        <Button variant="primary" loading={saving} onClick={save}>保存设置</Button>
      </PageHeader>

      {saved && <Alert variant="success">设置已保存</Alert>}

      <Tabs
        items={[
          { key: 'basic', label: '基本设置' },
          { key: 'notify', label: '通知' },
          { key: 'security', label: '安全' },
        ]}
        active={tab}
        onChange={(k: string) => { tab = k; saved = false; ctx.render() }}
      />

      {tab === 'basic' && (
        <div class="wf-stack wf-gap-sm" style="max-width:480px">
          <Field label="工作区名称" hint="团队成员可见">
            <Input value={name} onInput={(e: any) => { name = (e.target as HTMLInputElement).value; ctx.render() }} />
          </Field>
          <Field label="管理员邮箱" required>
            <Input type="email" value={email} onInput={(e: any) => { email = (e.target as HTMLInputElement).value; ctx.render() }} />
          </Field>
        </div>
      )}

      {tab === 'notify' && (
        <div class="wf-stack wf-gap-sm" style="max-width:480px">
          <div class="wf-surface wf-border wf-rounded-sm wf-p-sm wf-row wf-between">
            <div class="wf-stack wf-gap-xs">
              <b class="wf-text-sm">订单通知</b>
              <span class="wf-text-xs wf-text-secondary">新订单到达时推送</span>
            </div>
            <Switch checked={notifyOrder} onChange={(v: boolean) => { notifyOrder = v; ctx.render() }} />
          </div>
          <div class="wf-surface wf-border wf-rounded-sm wf-p-sm wf-row wf-between">
            <div class="wf-stack wf-gap-xs">
              <b class="wf-text-sm">每日摘要</b>
              <span class="wf-text-xs wf-text-secondary">每天早上 9 点发送昨日汇总</span>
            </div>
            <Switch checked={notifyDigest} onChange={(v: boolean) => { notifyDigest = v; ctx.render() }} />
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div class="wf-stack wf-gap-sm" style="max-width:480px">
          <div class="wf-surface wf-border wf-rounded-sm wf-p-sm wf-row wf-between">
            <div class="wf-stack wf-gap-xs">
              <b class="wf-text-sm">两步验证</b>
              <span class="wf-text-xs wf-text-secondary">登录时要求验证码</span>
            </div>
            <Switch checked={twoFactor} onChange={(v: boolean) => { twoFactor = v; ctx.render() }} />
          </div>
          <Field label="登录密码">
            <Input type="password" placeholder="输入新密码（留空不修改）" />
          </Field>
        </div>
      )}
    </div>
  )
}
