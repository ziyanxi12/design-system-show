import { getUserInfo, type UserInfo } from './auth'
import { api } from '../api/client'

export type Role = 'super' | 'admin' | null

export interface CheckResult {
  allowed: boolean
  role: Role
  user: UserInfo | null
}

/**
 * 已登录账号的白名单校验（复刻 lib-resource-ui 的 checkAuth 模式）。
 * 后端 GET /api/whitelist/check：WHITELIST_ENABLED=false 时放行所有账号（allowed 恒 true），
 * role 始终按白名单数据返回（super/admin/null）。
 */
export async function checkAuth(): Promise<CheckResult> {
  const user = getUserInfo()
  if (!user) return { allowed: false, role: null, user: null }
  const r = await api.checkWhitelist(user.account)
  const role: Role = r.role === 'super' ? 'super' : r.role === 'admin' ? 'admin' : null
  return { allowed: !!r.allowed, role, user }
}
