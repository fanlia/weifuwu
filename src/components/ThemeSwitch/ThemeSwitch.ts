/**
 * weifuwu/components — ThemeSwitch 主题切换器
 *
 * 三段式切换：auto（跟随系统偏好）/ light（强制亮色）/ dark（强制暗色）。
 * 对应 layout 的暗色双段激活机制：
 *   - auto  → 移除 data-theme，由 @media (prefers-color-scheme) 决定
 *   - light → <html data-theme="light">（系统暗色也强制亮色）
 *   - dark  → <html data-theme="dark">
 *
 * mount 时读取 localStorage 并立即应用（避免闪白）；
 * 用户选择后持久化。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

const browser = createClientBrowser()

export type ThemeMode = 'auto' | 'light' | 'dark'

export type PresetName = 'default' | 'minimal' | 'compact' | 'rounded'

const PRESETS: Array<{ value: PresetName; label: string }> = [
  { value: 'default', label: '默认' },
  { value: 'minimal', label: '极简' },
  { value: 'compact', label: '紧凑' },
  { value: 'rounded', label: '圆润' },
]

export interface ThemeSwitchProps {
  /** 初始模式（默认从 localStorage 读取，无记录时为 auto） */
  mode?: ThemeMode
  /** 切换回调 */
  onChange?: (mode: ThemeMode) => void
  /** localStorage 存储 key */
  storageKey?: string
  /** 预设主题（可选——传了才渲染预设行；对应 layout `data-preset`） */
  preset?: PresetName
  /** 预设切换回调 */
  onPresetChange?: (preset: PresetName) => void
}

const DEFAULT_KEY = 'wf_theme'
const DEFAULT_PRESET_KEY = 'wf_theme_preset'

function readStored(key: string): ThemeMode | null {
  const v = browser.storageGet(key)
  return v === 'light' || v === 'dark' || v === 'auto' ? v : null
}

function writeStored(key: string, value: string): void {
  browser.storageSet(key, value)
}

/** 应用主题：auto 移除属性，light/dark 显式设置 */
export function applyTheme(mode: ThemeMode): void {
  const root = browser.rootElement()
  if (!root) return
  if (mode === 'auto') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', mode)
}

function readStoredPreset(key: string): PresetName | null {
  const v = browser.storageGet(key)
  return v === 'minimal' || v === 'compact' || v === 'rounded' || v === 'default' ? v : null
}

/** 应用预设主题：default 移除属性，其余显式设置 data-preset（与 data-theme 正交） */
export function applyPreset(preset: PresetName): void {
  const root = browser.rootElement()
  if (!root) return
  if (preset === 'default') root.removeAttribute('data-preset')
  else root.setAttribute('data-preset', preset)
}

/** 读取当前生效主题（localStorage 优先，其次系统偏好） */
export function getTheme(): ThemeMode {
  const stored = readStored(DEFAULT_KEY)
  if (stored) return stored
  return 'auto'
}

export const ThemeSwitch: Component<ThemeSwitchProps> = async (initProps, ctx) => {
  const storageKey = initProps.storageKey ?? DEFAULT_KEY
  const presetKey = initProps.storageKey ? `${initProps.storageKey}_preset` : DEFAULT_PRESET_KEY
  // ── mount（只一次）：读取持久化设置并立即应用 ──
  let mode: ThemeMode = initProps.mode ?? readStored(storageKey) ?? 'auto'
  let preset: PresetName = initProps.preset ?? readStoredPreset(presetKey) ?? 'default'
  applyTheme(mode)
  applyPreset(preset)

  // ── render ──
  return async (props) => {
    const SL = (ctx as any)?.i18n?.components?.ThemeSwitch ?? {}
    const modes: Array<{ value: ThemeMode; label: string }> = [
      { value: 'auto', label: SL.auto ?? '自动' },
      { value: 'light', label: SL.light ?? '亮色' },
      { value: 'dark', label: SL.dark ?? '暗色' },
    ]

    const segments = modes.map(m =>
      h('button', {
        type: 'button',
        class: `wf-theme-seg${mode === m.value ? ' wf-theme-seg--active' : ''}`,
        role: 'radio',
        'aria-checked': String(mode === m.value),
        'aria-label': m.label,
        onClick: () => {
          if (mode === m.value) return
          mode = m.value
          applyTheme(mode)
          writeStored(storageKey, mode)
          props.onChange?.(mode)
          ctx.ui.render()
        },
      }, m.label),
    )

    // 预设行（可选——传 preset/onPresetChange 才渲染；与模式行同一分段控件）
    const presetSegs = PRESETS.map(p =>
      h('button', {
        type: 'button',
        class: `wf-theme-seg wf-theme-seg--preset${preset === p.value ? ' wf-theme-seg--active' : ''}`,
        role: 'radio',
        'aria-checked': String(preset === p.value),
        'aria-label': p.label,
        onClick: () => {
          if (preset === p.value) return
          preset = p.value
          applyPreset(preset)
          writeStored(presetKey, preset)
          props.onPresetChange?.(preset)
          ctx.ui.render()
        },
      }, p.label),
    )

    const hasPresetRow = props.preset !== undefined || props.onPresetChange !== undefined
    const children = hasPresetRow
      ? [segments, h('div', { class: 'wf-theme-preset-row', role: 'radiogroup', 'aria-label': '预设主题' }, presetSegs)]
      : segments

    return h('div', {
      class: 'wf-theme-switch',
      role: 'radiogroup',
      'aria-label': SL.label ?? '主题切换',
    }, children)
  }
}
