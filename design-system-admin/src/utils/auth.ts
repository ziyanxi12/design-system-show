const STORAGE_KEY = 'userInfo'

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
  redirectToLogin()
}
