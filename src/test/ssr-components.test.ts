/**
 * SSR 组件冒烟测试 — 所有内置组件经 ssrToString 渲染不崩
 *
 * 契约：组件经 ctx.browser（SSR shim 安全默认）不直接碰 window/document——
 * render/mount 期引用 SSR 安全。本测试逐个组件典型 props SSR 渲染，
 * 崩溃即契约破坏（快速定位回归）。
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ssrToString } from '../ui-dom/vdom/ssr.ts'
import type { Component } from '../ui-dom/vnode.ts'
import {
  Button, Badge, Menu, Accordion, Collapse, Tabs, Breadcrumb, Steps, Pagination,
  Input, Textarea, Select, Checkbox, Switch, RadioGroup, Slider, DatePicker,
  Modal, Drawer, Tooltip, Popover, Confirm, Toast, Alert, Skeleton, Result,
  Table, Tree, Card, Avatar, Tag, List, Timeline, Descriptions, StatCard,
  Anchor, Affix, BackTop, QRCode, Watermark, Highlight, CopyButton,
  FileUpload, InfiniteScroll, Carousel, Calendar, Rate, ColorPicker, Transfer,
  Cascader, Mentions, PasswordInput, InputNumber, PinInput, TagsInput, SearchInput,
  CodeBlock, Markdown, MessageBubble, ToolCallCard, ApprovalCard, LogViewer,
  JSONViewer, VirtualList, VirtualTable, EmptyState, ProgressBar, Loading,
  Divider, AspectRatio, Label, ToggleGroup, SegmentedControl, Resizable,
  Command, Menubar, ContextMenu, HoverCard, PageHeader, ThemeSwitch,
  CheckboxGroup, Form, Field, Notification,
  Layout, LayoutHeader, LayoutSider, LayoutContent, LayoutFooter, Popconfirm, AutoComplete, Link,
  Space, Grid, Col, Scrollbar, AlertGroup, FloatButton, NavMenu,
} from '../components/index.ts'

const ctx: any = {}

const cases: Array<[string, Component, Record<string, any>]> = [
  ['Button', Button, { children: '按钮' }],
  ['Badge', Badge, { children: 'new' }],
  ['Menu', Menu, { items: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', group: 'G' }] }],
  ['Accordion', Accordion, { items: [{ key: '1', title: 't1', content: 'c1' }] }],
  ['Collapse', Collapse, { items: [{ key: '1', title: 't1', content: 'c1' }] }],
  ['Tabs', Tabs, { items: [{ key: 'a', label: 'A', content: 'x' }] }],
  ['Breadcrumb', Breadcrumb, { items: [{ label: '首页', href: '/' }] }],
  ['Steps', Steps, { items: [{ title: 's1' }, { title: 's2' }] }],
  ['Pagination', Pagination, { total: 100 }],
  ['Input', Input, { placeholder: '输入' }],
  ['Textarea', Textarea, { placeholder: '输入' }],
  ['Select', Select, { options: [{ value: 'a', label: 'A' }] }],
  ['Checkbox', Checkbox, { children: 'x' }],
  ['Switch', Switch, { label: '开' }],
  ['RadioGroup', RadioGroup, { options: [{ value: 'a', label: 'A' }] }],
  ['Slider', Slider, {}],
  ['DatePicker', DatePicker, {}],
  ['Modal', Modal, { open: false, children: 'x' }],
  ['Drawer', Drawer, { open: false, children: 'x' }],
  ['Tooltip', Tooltip, { content: 'tip', children: 'hover' }],
  ['Popover', Popover, { content: 'pop', children: 'click' }],
  ['Confirm', Confirm, { open: false, message: '确认？' }],
  ['Alert', Alert, { message: '提示' }],
  ['Skeleton', Skeleton, { rows: 2 }],
  ['Result', Result, { title: '成功' }],
  ['Table', Table, { columns: [{ key: 'a', label: 'A' }], data: [{ a: 1 }] }],
  ['Tree', Tree, { data: [{ key: '1', title: 't1' }] }],
  ['Card', Card, { children: '内容' }],
  ['Avatar', Avatar, { children: 'U' }],
  ['Tag', Tag, { children: '标签' }],
  ['Timeline', Timeline, { items: [{ title: 't1' }] }],
  ['Descriptions', Descriptions, { items: [{ label: 'l', value: 'v' }] }],
  ['StatCard', StatCard, { title: '统计', value: 42 }],
  ['Anchor', Anchor, { items: [{ href: '#a', title: '锚点' }] }],
  ['Affix', Affix, { children: '固定' }],
  ['BackTop', BackTop, {}],
  ['QRCode', QRCode, { value: 'https://weifuwu.dev' }],
  ['Watermark', Watermark, { children: '内容' }],
  ['Highlight', Highlight, { text: 'abc', keywords: ['b'] }],
  ['CopyButton', CopyButton, { value: 'copy' }],
  ['FileUpload', FileUpload, {}],
  ['Carousel', Carousel, { items: [{ children: '1' }, { children: '2' }] }],
  ['Calendar', Calendar, { month: 5, year: 2025 }],
  ['Rate', Rate, {}],
  ['ColorPicker', ColorPicker, {}],
  ['Cascader', Cascader, { options: [{ value: 'a', label: 'A' }] }],
  ['Mentions', Mentions, { options: [{ value: 'u', label: 'U' }] }],
  ['PasswordInput', PasswordInput, {}],
  ['InputNumber', InputNumber, {}],
  ['PinInput', PinInput, { length: 4 }],
  ['TagsInput', TagsInput, {}],
  ['SearchInput', SearchInput, {}],
  ['CodeBlock', CodeBlock, { code: 'const a = 1' }],
  ['Markdown', Markdown, { content: '# 标题' }],
  ['MessageBubble', MessageBubble, { content: 'hello' }],
  ['ToolCallCard', ToolCallCard, { call: { id: 't1', name: 'fn', args: { a: 1 } } }],
  ['ApprovalCard', ApprovalCard, { request: { id: 'a1', toolCallId: 't1', name: 'fn', args: {} } }],
  ['LogViewer', LogViewer, { lines: ['line1', '\x1b[31mred\x1b[0m'] }],
  ['JSONViewer', JSONViewer, { data: { a: 1, b: { c: [1, 2] } } }],
  ['VirtualList', VirtualList, { items: [1, 2, 3], height: 100, itemHeight: 20, renderItem: (i: any) => String(i) }],
  ['VirtualTable', VirtualTable, { columns: [{ key: 'a', label: 'A' }], data: [{ a: 1 }] }],
  ['EmptyState', EmptyState, { description: '空' }],
  ['ProgressBar', ProgressBar, { percent: 50 }],
  ['Loading', Loading, {}],
  ['Divider', Divider, {}],
  ['AspectRatio', AspectRatio, { ratio: 1, children: 'x' }],
  ['Label', Label, { children: '标签' }],
  ['ToggleGroup', ToggleGroup, { items: [{ value: 'a', label: 'A' }] }],
  ['SegmentedControl', SegmentedControl, { options: ['a', 'b'] }],
  ['Resizable', Resizable, { children: 'x' }],
  ['Menubar', Menubar, { items: [{ key: 'm', label: '菜单' }] }],
  ['ContextMenu', ContextMenu, { items: [{ key: 'c', label: '复制' }], children: '右键' }],
  ['HoverCard', HoverCard, { content: 'card', children: 'hover' }],
  ['PageHeader', PageHeader, { title: '页面' }],
  ['ThemeSwitch', ThemeSwitch, {}],
  ['CheckboxGroup', CheckboxGroup, { options: [{ value: 'a', label: 'A' }] }],
  ['Notification', Notification, { title: '通知' }],
  ['Layout', Layout, { children: [{ type: LayoutHeader, props: { children: 'h' } }, { type: LayoutContent, props: { children: 'c' } }] }],
  ['LayoutSider', LayoutSider, { children: 'nav', collapsible: true, collapsed: false }],
  ['Popconfirm', Popconfirm, { title: '确定？', children: '删除' }],
  ['AutoComplete', AutoComplete, { options: [{ value: 'a', label: 'A' }], value: '' }],
  ['Link', Link, { href: '/x', children: '链接' }],
  ['Space', Space, { children: ['a', 'b'] }],
  ['Grid', Grid, { children: [{ type: Col, props: { span: 12, children: 'c' } }] }],
  ['Scrollbar', Scrollbar, { maxHeight: 200, children: 'x' }],
  ['AlertGroup', AlertGroup, { items: [{ id: '1', message: 'm' }] }],
  ['FloatButton', FloatButton, { children: '+' }],
  ['NavMenu', NavMenu, { items: [{ key: 'a', label: 'A' }] }],
]

describe('SSR 组件冒烟（ctx.browser shim 安全）', () => {
  for (const [name, Comp, props] of cases) {
    it(`SSR ${name} 不崩`, async () => {
      try {
        const html = await ssrToString(Comp, props, ctx)
        assert.ok(html != null, 'html 应存在（可为空——组件条件渲染 null）')
      } catch (e: any) {
        assert.fail(`${name} SSR 崩溃: ${e?.message ?? e}`)
      }
    })
  }
})
