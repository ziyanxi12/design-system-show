import { createSignal } from "solid-js"
import { API_BASE } from "../../config"

export type DsMeta = {
  name: string
  desc?: string
  /** 作者（/getAccount 完整值，驼峰：id/userID/account/nickName/dept） */
  authors?: AuthorEntry[]
  usage?: number
  /** 预览量（api1 的 views：详情页每次加载自动 +1） */
  views?: number
  cover?: string
  /** 封面完整 URL（api1 的 cover_url） */
  coverImg?: string
  /** 图标完整 URL（api1 的 icon_url，未自定义时后端回落内置默认图标，恒有值） */
  iconUrl?: string
  /** design-system.json 完整 URL（api1 的 json_url，详情页数据源） */
  jsonUrl?: string
  default?: boolean
}

/** 作者条目（与 api1 的 author 数组元素同构，管理台 /getAccount 选人后原样存取） */
export type AuthorEntry = {
  id?: number | null
  userID?: string | null
  account: string
  nickName?: string | null
  /** 部门（最多 4 级数组） */
  dept?: string[] | null
}

/** 卡片数据：仅 meta。详情内容由模版 iframe 用 jsonUrl 直接 fetch 后端 */
export type DsData = {
  meta: DsMeta
}

export type DsEntry = {
  id: string
  meta: DsMeta
}

/** api1 列表条目（对齐 requirement/api.md 契约） */
type ApiItem = {
  slug: string
  name: string
  desc?: string
  author?: AuthorEntry[]
  usage?: number
  views?: number
  cover?: string
  cover_url: string
  icon_url: string
  json_url: string
  default?: boolean
}

export type DsLoadState = "loading" | "ready" | "error"

/** 用户头像服务（mock 3091 直连；face 入参 = account 去掉第一个字符；尺寸固定 120，其余值接口会报错） */
export const FACE_API_BASE = "http://localhost:3091"
export const faceUrl = (account: string): string =>
  `${FACE_API_BASE}/face/${account.slice(1)}/120`

/** 作者显示标签（展示端）：昵称优先回落账号；管理台才显示 nickName(account) 完整格式 */
export const authorLabel = (a: AuthorEntry): string => {
  return (a.nickName || a.account || "").trim()
}

/**
 * 设计系统注册表 —— 纯 API 数据源（GET {API_BASE}/api/design-systems，API_BASE 由 .env 配置）：
 * 卡片来自 api1，详情用返回值里的 json_url 读 JSON 填充模板。
 * 无静态兜底：加载中显示提示，失败显示错误态。
 */
const [registry, setRegistry] = createSignal<DsEntry[]>([])
const [loadState, setLoadState] = createSignal<DsLoadState>("loading")

fetch(`${API_BASE}/api/design-systems`)
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
  .then((data: { count: number; items: ApiItem[] }) => {
    setRegistry(
      (data.items ?? []).map((i) => ({
        id: i.slug,
        meta: {
          name: i.name,
          desc: i.desc,
          authors: Array.isArray(i.author) ? i.author : [],
          usage: i.usage,
          views: i.views,
          cover: i.cover,
          coverImg: i.cover_url,
          iconUrl: i.icon_url,
          jsonUrl: i.json_url,
          default: i.default,
        },
      })),
    )
    setLoadState("ready")
  })
  .catch(() => setLoadState("error"))

/** 卡片注册表（signal 访问器） */
export const DS_REGISTRY = registry

/** 列表加载状态（loading / ready / error） */
export const dsLoadState = loadState

export function getDsData(id: string | undefined): DsData | undefined {
  if (!id) return undefined
  return registry().find((entry) => entry.id === id)
}
