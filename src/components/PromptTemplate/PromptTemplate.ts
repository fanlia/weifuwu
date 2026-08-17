/**
 * weifuwu/components — PromptTemplate 提示词模板编辑器（AI 场景）
 *
 * agent-platform 类应用的提示词管理痛点：变量占位 `{{var}}` 记忆/拼写错误 +
 * 填充结果不可见。组件提供：
 *   ① 变量 chips（点击在光标处插入 `{{name}}`——不记变量名）
 *   ② 模板编辑（受控 textarea）
 *   ③ 实时预览（填充 values 后的最终提示词）
 *
 * 纪律：
 * - 受控输入纪律（§5.3）：value 由父控制 + onChange 通知（组件不持输入态）
 * - 插入走 textarea selectionStart（光标处插入——无光标则末尾追加）
 * - 预览替换只认 `{{name}}` 精确匹配；values 缺失的变量保持占位（诚实可见）
 */
import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface PromptTemplateVariable {
  /** 变量名（插入后为 {{name}}） */
  name: string
  /** 描述（chips 悬停提示） */
  description?: string
}

export interface PromptTemplateProps {
  /** 模板文本（受控） */
  value?: string
  onChange?: (value: string) => void
  /** 变量定义（chips 行——点击插入） */
  variables?: PromptTemplateVariable[]
  /** 变量值（预览填充用——缺失的变量保持占位） */
  values?: Record<string, string>
  /** 只读（预览场景） */
  readOnly?: boolean
  label?: string
  /** 预览区显示开关（默认开） */
  showPreview?: boolean
  className?: string
}

export const PromptTemplate: Component<PromptTemplateProps> = async (_init, ctx: WfuiContext) => {
  // ── mount（只一次）：textarea DOM 引用（光标插入需要） ──
  let taEl: HTMLTextAreaElement | null = null
  const taRef = (el: HTMLTextAreaElement | null) => { taEl = el }

  return async (props: PromptTemplateProps) => {
    const {
      value = '', onChange, variables = [], values = {}, readOnly,
      label, showPreview = true, className,
    } = props

    // 插入变量到光标处（无光标/未聚焦 → 末尾追加）
    const insertVar = (name: string) => {
      const token = `{{${name}}}`
      if (!onChange) return
      const el = taEl
      if (!el) {
        // 无 DOM ref（首帧未挂载/测试 VNode 层）→ 末尾追加
        onChange(value + token)
        return
      }
      const start = el.selectionStart ?? value.length
      const end = el.selectionEnd ?? value.length
      const next = value.slice(0, start) + token + value.slice(end)
      onChange(next)
      // 光标移到插入后（受控回流后组件不持 DOM 态——经微任务恢复焦点/光标）
      queueMicrotask(() => {
        el.focus()
        const pos = start + token.length
        el.setSelectionRange(pos, pos)
      })
    }

    // 预览：精确替换 {{name}} → values[name]（缺失保持占位——诚实可见）
    const preview = value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (m, name: string) => values[name] ?? m)

    const chips = variables.length > 0
      ? h('div', { class: 'wf-prompt-chips' }, [
          h('span', { class: 'wf-prompt-chips-hint' }, '插入变量：'),
          ...variables.map((v) =>
            h('button', {
              key: v.name,
              type: 'button',
              class: 'wf-prompt-chip',
              title: v.description ?? `{{${v.name}}}`,
              disabled: readOnly || undefined,
              onClick: () => insertVar(v.name),
            }, `{{${v.name}}}`)),
        ])
      : null

    const editor = h('textarea', {
      class: 'wf-prompt-editor',
      ref: taRef,
      value,
      readOnly: readOnly || undefined,
      placeholder: '输入提示词模板…（点击上方变量插入占位）',
      'aria-label': label ?? '提示词模板',
      onInput: onChange ? (e: Event) => onChange((e.target as HTMLTextAreaElement).value) : undefined,
    })

    const previewEl = showPreview && !readOnly
      ? h('div', { class: 'wf-prompt-preview' }, [
          h('div', { class: 'wf-prompt-preview-title' }, '预览（变量填充）'),
          h('div', { class: 'wf-prompt-preview-body' }, preview || '（空模板）'),
        ])
      : null

    return h('div', { class: ['wf-prompt-template', className ?? ''].filter(Boolean).join(' ') }, [
      label ? h('div', { class: 'wf-prompt-label' }, label) : null,
      chips,
      editor,
      previewEl,
    ])
  }
}
