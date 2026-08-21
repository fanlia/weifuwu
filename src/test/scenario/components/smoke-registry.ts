/**
 * 组件冒烟陈列——第一批（40 核心组件——表单/浮层/交互类）
 *
 * 冒烟基线：全部渲染 + 点击扫描（console.error 零——渲染/交互不崩）。
 * 每个组件带 data-smoke 标记（e2e 断言渲染 + 点击定位）。
 * 深度行为断言在各自场景（后续分批）。
 */
import { h, type VNode } from '../../../client/vdom/index.ts'
import type { Component } from '../../../client/vdom/index.ts'
import {
  Button, Input, Textarea, SearchInput, PasswordInput, InputNumber, Select, Switch,
  Checkbox, CheckboxGroup, RadioGroup, Slider, Rate, PinInput, TagsInput, Tabs,
  Menu, Collapse, Accordion, Carousel, Pagination, Table, List, Tag, Badge, Avatar,
  StatCard, ProgressBar, Alert, EmptyState, Divider, Space, Text, Grid, Steps,
  Timeline, Breadcrumb, Calendar, DatePicker, Cascader,
} from '../../../client/components/index.ts'

/** 陈列项（组件名 → 简单实例化——渲染不崩为基线） */
export interface SmokeItem {
  name: string
  vnode: () => VNode
}

const btn = (name: string, children: string) =>
  h('button', { class: `smoke-click-${name}`, onClick: () => {} }, children)

export const smokeItems: SmokeItem[] = [
  { name: 'Button', vnode: () => h('div', { class: 'smoke-Button' }, [h(Button, {}, '按钮'), h(Button, { variant: 'primary' }, '主按钮'), h(Button, { size: 'sm' }, '小')]) },
  { name: 'Input', vnode: () => h('div', { class: 'smoke-Input' }, h(Input, { placeholder: '输入' })) },
  { name: 'Textarea', vnode: () => h('div', { class: 'smoke-Textarea' }, h(Textarea, { placeholder: '多行' })) },
  { name: 'SearchInput', vnode: () => h('div', { class: 'smoke-SearchInput' }, h(SearchInput, { placeholder: '搜索' })) },
  { name: 'PasswordInput', vnode: () => h('div', { class: 'smoke-PasswordInput' }, h(PasswordInput, { placeholder: '密码' })) },
  { name: 'InputNumber', vnode: () => h('div', { class: 'smoke-InputNumber' }, h(InputNumber, { defaultValue: 5 })) },
  { name: 'Select', vnode: () => h('div', { class: 'smoke-Select' }, h(Select, { options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], placeholder: '选择' })) },
  { name: 'Switch', vnode: () => h('div', { class: 'smoke-Switch' }, h(Switch, { defaultChecked: true })) },
  { name: 'Checkbox', vnode: () => h('div', { class: 'smoke-Checkbox' }, h(Checkbox, { checked: true }, '勾选')) },
  { name: 'CheckboxGroup', vnode: () => h('div', { class: 'smoke-CheckboxGroup' }, h(CheckboxGroup, { options: ['A', 'B', 'C'] })) },
  { name: 'RadioGroup', vnode: () => h('div', { class: 'smoke-RadioGroup' }, h(RadioGroup, { options: ['甲', '乙'] })) },
  { name: 'Slider', vnode: () => h('div', { class: 'smoke-Slider' }, h(Slider, { defaultValue: 30 })) },
  { name: 'Rate', vnode: () => h('div', { class: 'smoke-Rate' }, h(Rate, { defaultValue: 3 })) },
  { name: 'PinInput', vnode: () => h('div', { class: 'smoke-PinInput' }, h(PinInput, { length: 4 })) },
  { name: 'TagsInput', vnode: () => h('div', { class: 'smoke-TagsInput' }, h(TagsInput, { defaultValue: ['a', 'b'] })) },
  { name: 'Tabs', vnode: () => h('div', { class: 'smoke-Tabs' }, h(Tabs, { items: [{ key: '1', label: '标签1' }, { key: '2', label: '标签2' }] })) },
  { name: 'Menu', vnode: () => h('div', { class: 'smoke-Menu' }, h(Menu, { items: [{ key: '1', label: '菜单1' }, { key: '2', label: '菜单2' }] })) },
  { name: 'Collapse', vnode: () => h('div', { class: 'smoke-Collapse' }, h(Collapse, { items: [{ key: '1', title: '面板1', content: '内容1' }] })) },
  { name: 'Accordion', vnode: () => h('div', { class: 'smoke-Accordion' }, h(Accordion, { items: [{ key: '1', title: '折叠1', content: '内容1' }] })) },
  { name: 'Carousel', vnode: () => h('div', { class: 'smoke-Carousel' }, h(Carousel, { items: ['图1', '图2'] })) },
  { name: 'Pagination', vnode: () => h('div', { class: 'smoke-Pagination' }, h(Pagination, { total: 50, pageSize: 10 })) },
  { name: 'Table', vnode: () => h('div', { class: 'smoke-Table' }, h(Table, { columns: [{ key: 'name', title: '名称' }], data: [{ name: '行1' }] })) },
  { name: 'List', vnode: () => h('div', { class: 'smoke-List' }, h(List, { items: ['项1', '项2'], renderItem: (i: string) => h('div', {}, i) })) },
  { name: 'Tag', vnode: () => h('div', { class: 'smoke-Tag' }, h(Tag, { color: 'blue' }, '标签')) },
  { name: 'Badge', vnode: () => h('div', { class: 'smoke-Badge' }, h(Badge, { count: 5 }, '消息')) },
  { name: 'Avatar', vnode: () => h('div', { class: 'smoke-Avatar' }, h(Avatar, { name: '张三' })) },
  { name: 'StatCard', vnode: () => h('div', { class: 'smoke-StatCard' }, h(StatCard, { title: '订单', value: '128' })) },
  { name: 'ProgressBar', vnode: () => h('div', { class: 'smoke-ProgressBar' }, h(ProgressBar, { percent: 60 })) },
  { name: 'Alert', vnode: () => h('div', { class: 'smoke-Alert' }, h(Alert, { type: 'success', title: '成功' })) },
  { name: 'EmptyState', vnode: () => h('div', { class: 'smoke-EmptyState' }, h(EmptyState, { description: '无数据' })) },
  { name: 'Divider', vnode: () => h('div', { class: 'smoke-Divider' }, h(Divider, {}, '分隔')) },
  { name: 'Space', vnode: () => h('div', { class: 'smoke-Space' }, h(Space, {}, [h(Button, {}, 'a'), h(Button, {}, 'b')])) },
  { name: 'Typography', vnode: () => h('div', { class: 'smoke-Typography' }, h(Text, {}, '文本')) },
  { name: 'Grid', vnode: () => h('div', { class: 'smoke-Grid' }, h(Grid, { cols: 2 }, [h('div', {}, '格1'), h('div', {}, '格2')])) },
  { name: 'Steps', vnode: () => h('div', { class: 'smoke-Steps' }, h(Steps, { items: [{ title: '一步' }, { title: '二步' }], current: 0 })) },
  { name: 'Timeline', vnode: () => h('div', { class: 'smoke-Timeline' }, h(Timeline, { items: [{ title: '事件1' }, { title: '事件2' }] })) },
  { name: 'Breadcrumb', vnode: () => h('div', { class: 'smoke-Breadcrumb' }, h(Breadcrumb, { items: ['首页', '详情'] })) },
  { name: 'Calendar', vnode: () => h('div', { class: 'smoke-Calendar' }, h(Calendar, {})) },
  { name: 'DatePicker', vnode: () => h('div', { class: 'smoke-DatePicker' }, h(DatePicker, { placeholder: '选日期' })) },
  { name: 'Cascader', vnode: () => h('div', { class: 'smoke-Cascader' }, h(Cascader, { options: [{ value: 'a', label: 'A', children: [{ value: 'a1', label: 'A1' }] }], placeholder: '级联' })) },
]

/** 冒烟陈列场景（全部渲染——data-smoke 标记） */
export const SmokeScene: Component = () =>
  () =>
    h('div', { class: 'smoke-gallery' },
      smokeItems.map((item) =>
        h('div', { class: 'smoke-item', 'data-smoke': item.name, key: item.name },
          h('div', { class: 'smoke-label' }, item.name),
          item.vnode(),
        ),
      ),
    )
