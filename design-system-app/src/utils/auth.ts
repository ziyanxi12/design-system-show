/**
 * 登录态读取（与 lib-resource-ui 同协议）：localStorage `userInfo` 由统一登录门户写入。
 * 展示端无强制登录：有身份则随 /views 打点携带（统计页人员/部门数据来源），无则匿名降级。
 */
const STORAGE_KEY = "userInfo"

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

export async function getEncryptedUserData(): Promise<string> {
  const user = getUserInfo()
  if (!user) return ""
  const { encryptUserData } = await import("./crypto")
  return encryptUserData({ ...user })
}
