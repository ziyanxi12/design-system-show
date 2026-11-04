const STORAGE_KEY = 'userInfo'
const LOGIN_TIME_KEY = 'loginTime'
/** 登录过期时长：24 小时 */
const SESSION_EXPIRE_MS = 24 * 60 * 60 * 1000

export interface UserInfo {
  account: string
  dept: string[]
  deptCode: string[]
  nickName: string
  roleID: string
  roles: string[]
  uid: number
  userID: string
}

export function getUserInfo(): UserInfo | null {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const data = JSON.parse(raw)
    if (!data.account || !data.nickName) return null
    return data as UserInfo
  } catch {
    return null
  }
}

export function isLoggedIn(): boolean {
  return getUserInfo() !== null
}

/** 登录是否已过期（超过 24 小时未重新登录） */
export function isSessionExpired(): boolean {
  const loginTime = Number(localStorage.getItem(LOGIN_TIME_KEY))
  if (!loginTime || Number.isNaN(loginTime)) return true
  return Date.now() - loginTime > SESSION_EXPIRE_MS
}

/** 过期登出：清除登录态后跳登录页（AuthGuard 过期 / API 401 兜底共用） */
export function expireLogout(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LOGIN_TIME_KEY)
  redirectToLogin()
}

export async function getEncryptedUserData(): Promise<string> {
  const user = getUserInfo()
  if (!user) return ''
  const { encryptUserData } = await import('./crypto')
  return encryptUserData({ ...user })
}

/** 与 lib-resource-ui 相同：跳统一登录页（同域部署；dev 由 vite 提供 public/signIn/） */
export function redirectToLogin(): void {
  const redirect = window.location.href
  localStorage.setItem('login_redirect', redirect)
  window.location.href = '/signIn/index.html?model=web&redirect=' + encodeURIComponent(redirect)
}

export function redirectToLogout(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LOGIN_TIME_KEY)
  redirectToLogin()
}
