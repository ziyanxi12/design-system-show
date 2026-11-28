/**
 * 登录态读取（与 lib-resource-ui 同协议）：localStorage `userInfo` 由统一登录门户写入。
 * 展示端无强制登录：有身份则随 /views 打点携带（统计页人员/部门数据来源），无则匿名降级。
 * 嵌入兜底：宿主以 iframe 嵌入本端（跨源、门户 localStorage 不可达）时，onload 后向父页面
 * 播报 {type:"onLoad"}，宿主回发 {type:"userInfo", data:{...userInfo}} 作兜底登录态。
 */
import { API_BASE } from "../config"

const STORAGE_KEY = "userInfo"
const LOGIN_TIME_KEY = "loginTime"

export interface UserInfo {
  account: string
  dept: string[]
  deptCode: string[]
  nickName: string
  roleID: string
  roles: string[]
  uid: number
  userID: string
  /** 登录时间戳（毫秒）——门户写在 userInfo 内与 account 同层 */
  loginTime?: number
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

/**
 * X-User-Data 加密载荷 = userInfo + loginTime（api.md 契约；后端 AuthMiddleware 按
 * DS_LOGIN_TTL_HOURS 校验 loginTime，缺失/超时 401——实测 whitelist/check 无 loginTime 即 401）。
 * loginTime 优先从 userInfo 内取（门户同层写入）；独立键兜底（admin 登录页 signIn 仍写独立键）；
 * 皆无则懒补写（首次访问）——已有值不覆盖，避免每次刷新续期。
 */
export async function getEncryptedUserData(): Promise<string> {
  const user = getUserInfo()
  if (!user) return ""
  const loginTime =
    user.loginTime ||
    Number(localStorage.getItem(LOGIN_TIME_KEY)) ||
    (localStorage.setItem(LOGIN_TIME_KEY, String(Date.now())), Date.now())
  const { encryptUserData } = await import("./crypto")
  return encryptUserData({ ...user, loginTime })
}

/**
 * 白名单管理员校验（与管理台 AuthGuard 同口径）：GET /api/design-systems/whitelist/check，
 * allowed && role ∈ {super, admin} 才可进映射编辑页（allowed=false 为停用/白名单外——管理台
 * AuthGuard 同样拒绝；WHITELIST_ENABLED=false 时后端 allowed 恒 true，实际由 role 决定）。
 * 无登录态 / 接口失败一律 false（fail-closed）。
 * account 双通道：X-User-Data 头（AES 加密，后端优先解密，须含 loginTime——缺失即 401）+
 * ?account= 查询参数（dev 未注入 AES key 时唯一通道）。
 */
export async function checkIsAdmin(): Promise<boolean> {
  const user = getUserInfo()
  console.info("[admin-check] account:", user?.account ?? "(无登录态)")
  if (!user?.account) return false
  try {
    const headers: Record<string, string> = { "octo-vs-token": "octo_vs_7e91e862389139bab49247ba2550f366" }
    try {
      const encrypted = await getEncryptedUserData()
      if (encrypted) headers["X-User-Data"] = encrypted
    } catch { /* 加密失败 → 仅剩 ?account= 查询参数通道 */ }
    const r = await fetch(
      `${API_BASE}/api/design-systems/whitelist/check?account=${encodeURIComponent(user.account)}`,
      { headers },
    )
    if (!r.ok) return false
    const d = (await r.json()) as { allowed?: boolean; role?: string | null }
    const ok = !!d.allowed && (d.role === "super" || d.role === "admin")
    console.info("[admin-check] result:", JSON.stringify(d), "→", ok)
    return ok
  } catch {
    return false
  }
}
