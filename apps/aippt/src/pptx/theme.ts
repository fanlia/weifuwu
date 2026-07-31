/**
 * pptx-vdom theme.ts — 主题 token（配色/字体）
 *
 * 换肤 = 换 theme 对象；组件消费 token 而非硬编码颜色。
 * color 字段既可传 token 名（'primary'/'text'...），也可传 #RRGGBB 色值。
 */

export interface Theme {
  id: string
  name: string
  colors: {
    /** 页面背景 */
    bg: string
    /** 卡片/容器表面 */
    surface: string
    /** 主色（强调/按钮/标题装饰） */
    primary: string
    /** 主色浅底（强调背景块） */
    primarySoft: string
    /** 主文本 */
    text: string
    /** 次级文本 */
    textSecondary: string
    /** 弱化文本（注释/页码） */
    muted: string
    /** 分隔线 */
    line: string
    /** 深色主题下封面用的浅色文本（浅色主题下=白色文字色） */
    onDark: string
    /** 强调块内的文字色 */
    onPrimary: string
    /** 成功/正向 */
    success: string
    /** 警示 */
    warning: string
  }
  fonts: {
    heading: string
    body: string
  }
}

/** 商务 — 蓝白，稳重 */
const corporate: Theme = {
  id: 'corporate',
  name: '商务',
  colors: {
    bg: '#FFFFFF',
    surface: '#F3F4F6',
    primary: '#2563EB',
    primarySoft: '#EFF6FF',
    text: '#111827',
    textSecondary: '#4B5563',
    muted: '#9CA3AF',
    line: '#E5E7EB',
    onDark: '#FFFFFF',
    onPrimary: '#FFFFFF',
    success: '#059669',
    warning: '#D97706',
  },
  fonts: { heading: 'Arial', body: 'Arial' },
}

/** 极简 — 黑白灰 */
const minimal: Theme = {
  id: 'minimal',
  name: '极简',
  colors: {
    bg: '#FAFAFA',
    surface: '#FFFFFF',
    primary: '#171717',
    primarySoft: '#F5F5F5',
    text: '#171717',
    textSecondary: '#525252',
    muted: '#A3A3A3',
    line: '#E5E5E5',
    onDark: '#FAFAFA',
    onPrimary: '#FFFFFF',
    success: '#15803D',
    warning: '#B45309',
  },
  fonts: { heading: 'Helvetica', body: 'Helvetica' },
}

/** 科技 — 深底青蓝 */
const tech: Theme = {
  id: 'tech',
  name: '科技',
  colors: {
    bg: '#0B1120',
    surface: '#152238',
    primary: '#22D3EE',
    primarySoft: '#164E63',
    text: '#E2E8F0',
    textSecondary: '#94A3B8',
    muted: '#475569',
    line: '#1E293B',
    onDark: '#0B1120',
    onPrimary: '#0B1120',
    success: '#34D399',
    warning: '#FBBF24',
  },
  fonts: { heading: 'Arial', body: 'Arial' },
}

/** 学术 — 紫调，沉稳 */
const academic: Theme = {
  id: 'academic',
  name: '学术',
  colors: {
    bg: '#FDFDFD',
    surface: '#F5F3FF',
    primary: '#7C3AED',
    primarySoft: '#EDE9FE',
    text: '#1E1B4B',
    textSecondary: '#4C4A6B',
    muted: '#A5A3C2',
    line: '#E4E2F0',
    onDark: '#FFFFFF',
    onPrimary: '#FFFFFF',
    success: '#047857',
    warning: '#B45309',
  },
  fonts: { heading: 'Georgia', body: 'Georgia' },
}

/** 活力 — 玫红，年轻 */
const vibrant: Theme = {
  id: 'vibrant',
  name: '活力',
  colors: {
    bg: '#FFF8F8',
    surface: '#FFFFFF',
    primary: '#F43F5E',
    primarySoft: '#FFF1F2',
    text: '#1F2937',
    textSecondary: '#6B7280',
    muted: '#B0B7C3',
    line: '#F3E8E8',
    onDark: '#FFFFFF',
    onPrimary: '#FFFFFF',
    success: '#10B981',
    warning: '#F59E0B',
  },
  fonts: { heading: 'Arial', body: 'Arial' },
}

export const themes: Record<string, Theme> = { corporate, minimal, tech, academic, vibrant }

export function getTheme(id?: string): Theme {
  return themes[id ?? 'corporate'] ?? corporate
}

/** 解析颜色：token 名 → 主题色值；否则视为 #RRGGBB 原样返回 */
export function resolveColor(color: string | undefined, theme: Theme): string | undefined {
  if (!color) return undefined
  if (color in theme.colors) return (theme.colors as Record<string, string>)[color]
  return color
}
