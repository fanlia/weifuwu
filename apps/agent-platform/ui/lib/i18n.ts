/**
 * agent-platform 应用级 i18n 文案（框架 i18n 中间件 messages）
 *
 * 服务端（框架 userSystem）错误为英文——前端经 i18n key 映射中文，
 * 未来多语言只需加语言包。
 */
export const APP_MESSAGES: Record<string, string> = {
  'err.invalid_credentials': '邮箱或密码不正确',
  'err.email_exists': '该邮箱已注册',
  'err.not_found': '资源不存在',
  'err.unauthorized': '未登录或登录已过期',
  'err.forbidden': '无权限执行此操作',
  'err.app_not_joined': '该账号尚未加入任何应用',
}

/** 服务端英文错误 → i18n key（无匹配返回 ''——回退原文） */
export function authErrorKey(msg: string): string {
  const m = String(msg ?? '')
  if (/invalid email or password/i.test(m)) return 'err.invalid_credentials'
  if (/already|exists|duplicate/i.test(m)) return 'err.email_exists'
  if (/not found/i.test(m)) return 'err.not_found'
  if (/unauthorized/i.test(m)) return 'err.unauthorized'
  if (/forbidden/i.test(m)) return 'err.forbidden'
  if (/尚未加入|no app/i.test(m)) return 'err.app_not_joined'
  return ''
}
