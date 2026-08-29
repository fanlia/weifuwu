/**
 * 表单核心分类 demo（从 components-demo 迁移——P1 第一批活体 demo）
 * 组件页活体区渲染：DEMOS[组件名] —— 未迁移分类显示文档（P2 批量接入）
 */
import type { Component } from 'weifuwu/vdom'
import { Button, Input, Textarea, Select, SearchInput } from 'weifuwu/components'

export const DemoButton: Component = (_props, ctx) => {
  let loading = false
  let count = 0
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm">
      <div class="wf-row">
        <Button variant="primary" onClick={() => { count++; ctx.render() }}>点击 {count} 次</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Danger</Button>
      </div>
      <div class="wf-row">
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <div class="wf-row">
        <Button loading={loading} onClick={() => { loading = true; ctx.render(); setTimeout(() => { loading = false; ctx.render() }, 1500) }}>点我 Loading</Button>
        <Button disabled>Disabled</Button>
        <Button variant="primary" block>Block</Button>
      </div>
    </div>
  )
}

export const DemoInput: Component = (_props, ctx) => {
  let text = '可编辑'
  let email = ''
  let pwd = ''
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <Input label="文本" value={text} onInput={e => { text = (e.target as HTMLInputElement).value; ctx.render() }} />
      <Input label="邮箱" type="email" placeholder="name@example.com" required value={email} onInput={e => { email = (e.target as HTMLInputElement).value; ctx.render() }} />
      <Input label="密码" type="password" placeholder="••••••••" value={pwd} onInput={e => { pwd = (e.target as HTMLInputElement).value; ctx.render() }} />
      <Input label="错误状态" error="请输入有效内容" />
      <Input label="带提示" hint="只能包含字母和数字" />
    </div>
  )
}

export const DemoTextarea: Component = (_props, ctx) => {
  let bio = '可编辑文本'
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <Textarea label="简介" value={bio} onInput={e => { bio = (e.target as HTMLTextAreaElement).value; ctx.render() }} rows={3} />
      <Textarea label="错误状态" error="内容不能为空" rows={2} />
      <Textarea label="带提示" hint="最多 500 字" rows={2} />
    </div>
  )
}

export const DemoSelect: Component = (_props, ctx) => {
  let role = ''
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <Select label="原生 select" placeholder="请选择"
        value={role}
        onChange={v => { role = v as string; ctx.render() }}
        options={[
          { value: 'admin', label: '管理员' },
          { value: 'user', label: '普通用户' },
          { value: 'guest', label: '访客' },
        ]} />
      <div class="wf-font-xs wf-text-secondary">当前值: {role || '(未选择)'}</div>
      <Select label="带错误" error="请选择角色" options={[{ value: 'a', label: '选项 A' }]} />
      <Select label="分组选项（optgroup）" placeholder="选择城市"
        options={[
          { label: '一线', options: [{ value: 'bj', label: '北京' }, { value: 'sh', label: '上海' }] },
          { label: '二线', options: [{ value: 'hz', label: '杭州' }] },
          { value: 'other', label: '其他' },
        ]} />
    </div>
  )
}

export const DemoSearchInput: Component = (_props, ctx) => {
  let query = ''
  return (_p: any) => (
    <div class="wf-stack wf-gap-sm wf-width-full">
      <SearchInput placeholder="搜索用户..." value={query} onInput={e => { query = (e.target as HTMLInputElement).value; ctx.render() }} onClear={() => { query = ''; ctx.render() }} />
      <div class="wf-font-xs wf-text-secondary">搜索词: {query || '(空)'}</div>
    </div>
  )
}

export const DEMOS: Record<string, any> = {
  Button: DemoButton,
  Input: DemoInput,
  Textarea: DemoTextarea,
  Select: DemoSelect,
  'Select (searchable)': DemoSelect, // 变体卡片复用主 demo
  SearchInput: DemoSearchInput,
}
