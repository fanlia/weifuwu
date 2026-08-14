/**
 * 私有化授权服务 — 商业化 G12 License + G13 白标
 *
 * License（环境变量配置——私有化部署授权，信任边界 = 部署方）：
 *   LICENSE_KEY   授权标识（任意字符串；未配置 = 社区版）
 *   LICENSE_TO    授权到期日（YYYY-MM-DD；未配置/已过 = 到期状态）
 * 白标（环境变量配置——客户品牌）：
 *   WHITE_LABEL_NAME    产品名（默认 Agent Platform）
 *   WHITE_LABEL_LOGO    品牌标识（URL 或 emoji/文本）
 *   WHITE_LABEL_BRAND   品牌主色（hex——注入 --wf-brand-seed 全站换肤）
 */

export interface LicenseInfo {
  key: string
  edition: 'community' | 'licensed'
  expiresAt: string | null
  expired: boolean
}

export function getLicenseInfo(): LicenseInfo {
  const key = process.env.LICENSE_KEY?.trim() ?? ''
  const expiresAt = process.env.LICENSE_TO?.trim() ?? null
  const expired = !!expiresAt && new Date(expiresAt + 'T23:59:59').getTime() < Date.now()
  return {
    key: key ? key.slice(0, 8) + '…' : '',
    edition: key ? 'licensed' : 'community',
    expiresAt,
    expired,
  }
}

export interface WhiteLabelInfo {
  name: string
  logo: string
  brand: string
}

export function getWhiteLabelInfo(): WhiteLabelInfo {
  return {
    name: process.env.WHITE_LABEL_NAME?.trim() || 'Agent Platform',
    logo: process.env.WHITE_LABEL_LOGO?.trim() || 'A',
    brand: process.env.WHITE_LABEL_BRAND?.trim() || '',
  }
}
