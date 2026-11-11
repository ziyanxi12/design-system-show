/**
 * 登录态读取（与 lib-resource-ui 同协议）：localStorage `userInfo` 由统一登录门户写入。
 * 展示端无强制登录：有身份则随 /views 打点携带（统计页人员/部门数据来源），无则匿名降级。
 * 嵌入兜底：宿主以 iframe 嵌入本端（跨源、门户 localStorage 不可达）时，onload 后向父页面
 * 播报 {type:"onLoad"}，宿主回发 {type:"userInfo", data:{...userInfo}} 作兜底登录态。
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

/** 宿主经 postMessage 注入的兜底用户（后发覆盖先发，支持宿主刷新身份） */
let hostUserInfo: UserInfo | null = null

/**
 * 宿主嵌入握手（入口调用一次）：
 *   收：{type:"userInfo", data:{...userInfo}}——校验 account+nickName（与 localStorage 路径同口径）。
 *       消息兼容对象与 JSON 字符串两种形态：整包字符串化（'{"type":"userInfo","data":{...}}'）
 *       或 data 字段字符串化（{type:"userInfo", data:'{...}'}）均解析后按同口径校验
 *   发：页面 onload 后向父页面播报 {type:"onLoad"}（仅嵌入时；targetOrigin 沿用库内 "*" 惯例）
 */
export function initHostUserChannel(): void {
  window.addEventListener("message", (e) => {
    if (e.source === window) return
    let d: unknown = e.data
    if (typeof d === "string") {
      try { d = JSON.parse(d) } catch { return }   // 整包字符串：非法 JSON → 丢弃
    }
    const msg = d as { type?: string; data?: unknown } | null
    if (!msg || typeof msg !== "object" || msg.type !== "userInfo") return
    let user = msg.data
    if (typeof user === "string") {
      try { user = JSON.parse(user) } catch { return }   // data 字段字符串：非法 JSON → 丢弃
    }
    const u = user as UserInfo | null
    if (!u || !u.account || !u.nickName) return
    hostUserInfo = u
  })
  const announce = () => {
    if (window.parent !== window) window.parent.postMessage({ type: "onLoad" }, "*")
  }
  if (document.readyState === "complete") announce()
  else window.addEventListener("load", announce)
}

function readLocalUser(): UserInfo | null {
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

export function getUserInfo(): UserInfo | null {
  return readLocalUser() ?? hostUserInfo
}

export async function getEncryptedUserData(): Promise<string> {
  const user = getUserInfo()
  if (!user) return ""
  const { encryptUserData } = await import("./crypto")
  return encryptUserData({ ...user })
}
