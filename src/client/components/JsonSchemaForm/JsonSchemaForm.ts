import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Field } from '../Field/Field.ts'
import { Input } from '../Input/Input.ts'
import { InputNumber } from '../InputNumber/InputNumber.ts'
import { Select } from '../Select/Select.ts'
import { Switch } from '../Switch/Switch.ts'
import { Icon } from '../Icon/Icon.ts'

/**
 * JsonSchemaForm — JSON Schema（对象子集）→ 参数输入表单（零依赖）
 *
 * AI 场景参数输入面：工具调用参数（ToolCallCard 只展示，本组件负责输入）、
 * 审批 modified 决策的取参来源、Agent 配置页 schema 驱动表单。
 *
 * 类型映射：string→Input / number|integer→InputNumber / boolean→Switch /
 * string+enum→Select / object→嵌套折叠区（递归）/ array→列表 + 添加/删除。
 *
 * 值管理：内部 state（非受控），`value` 仅作初始值——输入回流来自内部，
 * 无受控回流焦点问题（§5.3）；`onChange` 每次编辑通知（不回流控制）。
 * 校验（submit 时）：required / enum / min-max / minLength-maxLength，
 * 错误展示在字段 error，不触发 onSubmit。
 *
 * ```tsx
 * <JsonSchemaForm schema={tool.parameters} value={args} onSubmit={run} submitLabel="执行" />
 * ```
 */
export interface JsonSchema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'null'
  title?: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: (string | number)[]
  items?: JsonSchema
  default?: unknown
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
  /** 不支持的 schema 关键字（$ref 等）——诚实裁剪：告警 + 降级文本输入 */
  $ref?: string
}

export interface JsonSchemaFormProps {
  /** 顶层对象 schema（type: 'object' + properties） */
  schema: JsonSchema
  /** 初始值（非受控语义）；内部状态由编辑驱动 */
  value?: Record<string, any>
  /** 每次编辑通知（父层可读最新值；不回流控制） */
  onChange?: (values: Record<string, any>) => void
  /** 提交（校验通过才触发）；不传则不渲染提交按钮 */
  onSubmit?: (values: Record<string, any>) => void
  submitLabel?: string
}

/** 不支持的 schema 关键字 → 告警 + 降级文本输入（诚实裁剪 CS-05，见 design/components-cuts.md：$ref/组合 schema 不提供） */
function unsupported(prop: string, why: string): void {
  console.warn(`[JsonSchemaForm] 字段 "${prop}" 不支持 ${why}——降级为文本输入`)
}

/** 展开嵌套值（仅首层浅拷贝，对象保持引用一致——嵌套编辑经递归 set 修改） */
function cloneValues(v: Record<string, any> | undefined): Record<string, any> {
  return { ...(v ?? {}) }
}

/** 深度 set：路径 a.b.c → values[a][b][c] = val */
function setPath(values: Record<string, any>, path: string[], val: unknown): void {
  let cur: any = values
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  cur[path[path.length - 1]] = val
}

/** 深度 get */
function getPath(values: Record<string, any>, path: string[]): any {
  let cur: any = values
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = cur[k]
  }
  return cur
}

/** 递归 set（数组项编辑/删除用——数组按索引路径修改） */
function setDeep(values: Record<string, any>, path: string[], val: unknown): void {
  const parent = getPath(values, path.slice(0, -1))
  if (parent && typeof parent === 'object') parent[path[path.length - 1]] = val
}

// ── 字段校验（submit 时，返回错误消息或 undefined）──

function validateField(s: JsonSchema, val: any, required = false): string | undefined {
  if (required && (val === undefined || val === null || val === '')) return '必填'
  if (val === undefined || val === null || val === '') return undefined
  if (s.type === 'number' || s.type === 'integer') {
    const n = Number(val)
    if (Number.isNaN(n)) return '必须是数字'
    if (s.minimum != null && n < s.minimum) return `不能小于 ${s.minimum}`
    if (s.maximum != null && n > s.maximum) return `不能大于 ${s.maximum}`
    return undefined
  }
  if (typeof val === 'string') {
    if (s.minLength != null && val.length < s.minLength) return `至少 ${s.minLength} 个字符`
    if (s.maxLength != null && val.length > s.maxLength) return `最多 ${s.maxLength} 个字符`
  }
  if (s.enum?.length && !s.enum.includes(val as never)) return '不在允许值范围内'
  return undefined
}

export const JsonSchemaForm: Component<JsonSchemaFormProps, WfuiContext> = async (initProps, ctx) => {
  // ── 手动状态（组件库纪律：let + render()；value 仅初始值）──
  let values: Record<string, any> = cloneValues(initProps.value)

  function emit(): void {
    ctx.ui.render()
    initProps.onChange?.(values)
  }

  // ── 字段渲染 ──────────────────────────────────────────

  function renderField(key: string, s: JsonSchema, path: string[], value: any, errors: Record<string, string>, required = false): any {
    const err = errors[path.join('.')]
    const label = s.title ?? key

    // enum（string/number）→ Select
    if (s.enum?.length) {
      const options = s.enum.map((v) => ({ value: String(v), label: String(v) }))
      return h(Field, { key, label, required, error: err, hint: s.description }, h(Select, {
        value: value == null ? undefined : String(value),
        options,
        error: err,
        onChange: (v2: any) => {
          setPath(values, path, v2 == null ? undefined : s.enum?.find((e) => String(e) === v2))
          emit()
        },
      }))
    }

    switch (s.type) {
      case 'number':
      case 'integer': {
        return h(Field, { key, label, required, error: err, hint: s.description }, h(InputNumber, {
          value: value == null ? null : Number(value),
          min: s.minimum,
          max: s.maximum,
          error: err,
          onChange: (v2: number | null) => { setPath(values, path, v2 ?? undefined); emit() },
        }))
      }
      case 'boolean': {
        return h(Field, { key, label, required, error: err, hint: s.description }, h(Switch, {
          checked: !!value,
          onChange: (v2: boolean) => { setPath(values, path, v2); emit() },
        }))
      }
      case 'object': {
        // 嵌套对象：折叠区容器（递归渲染 properties）
        return h('div', { key, class: 'wf-jsf-obj' }, [
          h('div', { class: 'wf-jsf-obj-title' }, [label, required ? h('span', { class: 'wf-field-req' }, '*') : null]),
          ...Object.entries(s.properties ?? {}).map(([k, sub]) =>
            renderField(k, sub, [...path, k], getPath(values, [...path, k]), errors, s.required?.includes(k))),
        ])
      }
      case 'array': {
        const arr = Array.isArray(value) ? value : []
        const items = arr.map((_it: unknown, i: number) => {
          const itemPath = [...path, String(i)]
          return h('div', { key: i, class: 'wf-jsf-arr-item' }, [
            renderArrayItem(String(i), s.items ?? {}, itemPath, arr[i], errors),
            h('button', {
              type: 'button',
              class: 'wf-jsf-arr-del',
              'aria-label': `删除 ${label} 第 ${i + 1} 项`,
              onClick: () => {
                const cur = Array.isArray(getPath(values, path)) ? [...getPath(values, path)] : []
                cur.splice(i, 1)
                setPath(values, path, cur)
                emit()
              },
            }, h(Icon, { name: 'trash' })),
          ])
        })
        return h('div', { key, class: 'wf-jsf-arr' }, [
          h('div', { class: 'wf-jsf-obj-title' }, [label, h('span', { class: 'wf-jsf-arr-add', role: 'button', tabindex: 0, 'aria-label': `添加 ${label} 项`, onClick: () => {
            const cur = Array.isArray(getPath(values, path)) ? [...getPath(values, path)] : []
            cur.push(undefined)
            setPath(values, path, cur)
            emit()
          }, onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLElement).click() } } }, h(Icon, { name: 'plus' }))]),
          ...items,
        ])
      }
      default: {
        // string；未知/不支持类型 → 告警 + 文本输入逃生舱（诚实裁剪：不静默）
        if (s.type && s.type !== 'string') unsupported(key, `type "${s.type}"`)
        if (s.$ref) unsupported(key, `$ref 引用（${s.$ref}）`)
        return h(Field, { key, label, required, error: err, hint: s.description }, h(Input, {
          value: value == null ? '' : String(value),
          onInput: (e: Event) => {
            setPath(values, path, (e.target as HTMLInputElement).value)
            emit()
          },
        }))
      }
    }
  }

  /** 数组项控件（标量 items；对象 items 裁剪——诚实登记 components-cuts.md） */
  function renderArrayItem(k: string, s: JsonSchema, path: string[], value: any, errors: Record<string, string>): any {
    if (s.enum?.length) {
      const options = s.enum.map((v) => ({ value: String(v), label: String(v) }))
      return h(Select, {
        value: value == null ? undefined : String(value),
        options,
        onChange: (v2: any) => { setDeep(values, path, s.enum?.find((e) => String(e) === v2)); emit() },
      })
    }
    switch (s.type) {
      case 'number':
      case 'integer':
        return h(InputNumber, {
          value: value == null ? null : Number(value),
          onChange: (v2: number | null) => { setDeep(values, path, v2 ?? undefined); emit() },
        })
      case 'boolean':
        return h(Switch, {
          checked: !!value,
          onChange: (v2: boolean) => { setDeep(values, path, v2); emit() },
        })
      case 'object':
        unsupported(path.join('.'), '数组对象 items（对象数组）')
        break
      default:
        return h(Input, {
          value: value == null ? '' : String(value),
          onInput: (e: Event) => { setDeep(values, path, (e.target as HTMLInputElement).value); emit() },
        })
    }
  }

  // ── render（每次 render()/props 变化）──
  return async (props) => {
    // 初始值只取一次（mount 时 value 是 initProps）；render 期 props.value 变化不回流
    // （非受控语义，文档注明）
    const schema = props.schema

    // 收集提交错误（render 期计算；onClick 闭包捕获最新 errors）
    const errors: Record<string, string> = {}
    function collectErrors(s: JsonSchema, path: string[], required = false): void {
      if (s.type === 'object') {
        for (const [k, sub] of Object.entries(s.properties ?? {})) collectErrors(sub, [...path, k], s.required?.includes(k))
        return
      }
      const err = validateField(s, getPath(values, path), required)
      if (err) errors[path.join('.')] = err
    }
    for (const [k, sub] of Object.entries(schema.properties ?? {})) {
      collectErrors(sub, [k], schema.required?.includes(k))
    }

    const fields = Object.entries(schema.properties ?? {}).map(([k, sub]) =>
      renderField(k, sub, [k], getPath(values, [k]), errors, schema.required?.includes(k)))

    const submitBtn = props.onSubmit
      ? h('button', {
          type: 'button',
          class: 'wf-btn wf-btn--primary wf-jsf-submit',
          onClick: () => {
            // 提交时重新校验（errors 已在 render 期计算，此处直接判定）
            if (Object.keys(errors).length > 0) return
            props.onSubmit?.(values)
          },
        }, props.submitLabel ?? '提交')
      : null

    return h('div', { class: 'wf-jsf' }, [
      schema.title ? h('div', { class: 'wf-jsf-title' }, schema.title) : null,
      ...fields,
      submitBtn,
    ])
  }
}
