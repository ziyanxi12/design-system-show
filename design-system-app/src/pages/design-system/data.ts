export type DsMeta = {
  name: string
  desc?: string
  author?: string
  usage?: number
  cover?: string
  default?: boolean
}

/** 卡片数据：仅 meta。详情内容由模版 iframe 自行 fetch systems/{id}/design-system.json */
export type DsData = {
  meta: DsMeta
}

export type DsEntry = {
  id: string
  meta: DsMeta
}

/**
 * 设计系统注册表 —— 由 data/*.json 自动发现（Vite glob，构建期静态分析）。
 *
 * 新增一个设计系统（卡片）：
 *   1. 往 ./data/ 放一个 {id}.json：{ "meta": { "name", "desc", "author", "usage", "cover", "default" } }
 *   2. （可选，详情内容）往 public/design-systems/detail/systems/{id}/ 放
 *      design-system.json + mapping.json + assets/，详情页即自动可看
 * 卡片自动出现在列表页，无需改任何代码。
 */
const modules = import.meta.glob<{ default: DsData }>("./data/*.json", {
  eager: true,
  import: "default",
})

function idFromPath(path: string): string {
  const match = path.match(/\/([^/]+)\.json$/)
  return match ? match[1] : ""
}

export const DS_REGISTRY: DsEntry[] = Object.entries(modules)
  .map(([path, data]) => ({ id: idFromPath(path), meta: data.meta }))
  .filter((entry) => entry.id !== "" && !!entry.meta.name)

export function getDsData(id: string | undefined): DsData | undefined {
  if (!id) return undefined
  return modules[`./data/${id}.json`]
}
