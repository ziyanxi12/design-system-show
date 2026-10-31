import { createSignal } from "solid-js"

export type DsMeta = {
  name: string
  desc?: string
  author?: string
  usage?: number
  cover?: string
  /** 封面完整 URL（api1 的 cover_url） */
  coverImg?: string
  /** design-system.json 完整 URL（api1 的 json_url，详情页数据源） */
  jsonUrl?: string
  default?: boolean
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
  author?: string
  usage?: number
  cover?: string
  cover_url: string
  json_url: string
  default?: boolean
}

export type DsLoadState = "loading" | "ready" | "error"

/**
 * 设计系统注册表 —— 纯 API 数据源（GET /aaa/api/design-systems）：
 * 卡片来自 api1，详情用返回值里的 json_url 读 JSON 填充模板。
 * 无静态兜底：加载中显示提示，失败显示错误态。
 */
const [registry, setRegistry] = createSignal<DsEntry[]>([])
const [loadState, setLoadState] = createSignal<DsLoadState>("loading")

fetch("/aaa/api/design-systems")
  .then((r) => (r.ok ? r.json() : Promise.reject(new Error("HTTP " + r.status))))
  .then((data: { count: number; items: ApiItem[] }) => {
    setRegistry(
      (data.items ?? []).map((i) => ({
        id: i.slug,
        meta: {
          name: i.name,
          desc: i.desc,
          author: i.author,
          usage: i.usage,
          cover: i.cover,
          coverImg: i.cover_url,
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
