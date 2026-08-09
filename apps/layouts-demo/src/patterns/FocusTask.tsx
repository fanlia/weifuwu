import type { Component } from 'weifuwu/client'
import {Text, Button, Card, Checkbox, Field, Form, Icon, Input, Space, Alert, Divider } from 'weifuwu/components'


// ─────────────────────────────────────────────────────────────
// 模式 8：聚焦任务页（Focus Task）
//
// 单任务页面：居中卡片承载表单——登录、注册、支付、审批通用。
// 100% 原语 + 组件：wf-fill + wf-center（视口居中）+ Card 承载
//   Form / Field / Input / Checkbox / Button（weifuwu 表单全家桶）
// ─────────────────────────────────────────────────────────────

export const FocusTask: Component = (_init, ctx) => {
  const $ = ctx.ui.$()
  $.ok = false

  return () => (
    <div class="wf-fill wf-center wf-p-md wf-bg-secondary" style={{ minHeight: 'calc(100vh - 48px)' }}>
      <Card padding="lg" style={{ width: '400px', maxWidth: '100%' }}>
        <div class="wf-stack wf-gap-md wf-center">
          {/* 品牌区 */}
          <Space direction="vertical" size="sm" align="center">
            <Icon name="lock" size={32} className="wf-text-primary" />
            <b class="wf-text-bold wf-text-lg">登录 weifuwu</b>
            <Text type="secondary" className="wf-text-sm">进入你的工作台</Text>
          </Space>

          <Form
            validation={{
              username: [{ required: true, message: '请输入用户名' }],
              password: [{ required: true, message: '请输入密码' }],
            }}
            onSubmit={(v) => {
              if (v.username === 'admin' && v.password === 'admin') {
                $.ok = true
              }
            }}
          >
            <div class="wf-stack wf-gap-md">
              <Field label="用户名" required>
                <Input name="username" placeholder="请输入用户名" />
              </Field>
              <Field label="密码" required>
                <Input name="password" type="password" placeholder="请输入密码" />
              </Field>
              <div class="wf-row wf-between">
                <Checkbox label="记住我" />
                <Text className="wf-text-primary wf-text-sm wf-pointer">忘记密码？</Text>
              </div>
              <Button type="submit" variant="primary" block size="lg">登 录</Button>
            </div>
          </Form>

          {$.ok && <Alert variant="success">登录成功（demo：admin / admin）</Alert>}
          {!$.ok && (
            <Divider>
              <Text type="secondary" className="wf-text-sm">没有账号？<Text className="wf-text-primary wf-pointer">立即注册</Text></Text>
            </Divider>
          )}
        </div>
      </Card>
    </div>
  )
}

