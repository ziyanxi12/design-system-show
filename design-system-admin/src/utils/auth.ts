const STORAGE_KEY = 'userInfo'
const LOGIN_TIME_KEY = 'loginTime'

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

/**
 * 补写登录时间：正式环境统一登录页（sign/index.html）只写 userInfo 不写 loginTime，
 * 由管理台在进入时自己写（仅缺失时写；已有值不覆盖，避免每次刷新续期）。
 * loginTime 不再用于前端判断过期——它随 getEncryptedUserData 塞进 X-User-Data 载荷，
 * 由后端按 DS_LOGIN_TTL_HOURS（默认 24h）校验，过期返回 401。
 */
export function ensureLoginTime(): void {
  if (!localStorage.getItem(LOGIN_TIME_KEY)) {
    localStorage.setItem(LOGIN_TIME_KEY, String(Date.now()))
  }
}

/** 过期登出：清除登录态后跳登录页（后端 401 过期响应触发，见 client.ts） */
export function expireLogout(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LOGIN_TIME_KEY)
  redirectToLogin()
}

export async function getEncryptedUserData(): Promise<string> {
  const user = getUserInfo()
  if (!user) return ''
  const { encryptUserData } = await import('./crypto')
  // loginTime 一并入加密载荷（缺失=0 → 后端判过期）；过期判断完全在后端
  const loginTime = Number(localStorage.getItem(LOGIN_TIME_KEY))
  return encryptUserData({ ...user, loginTime })
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
