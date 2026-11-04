/** zip 解析预览接口（POST /api/design-systems/parse）的返回结构 */

/** assets 扫描出的组件/Pattern 条目（含层级） */
export interface ZipAssetItem {
  id: string
  name: string
  /** 相对 zip 根路径（展示/追溯） */
  label?: string
  desc?: string
  /** 目录层级（assets/components 之下的各级目录名） */
  group?: string[]
}

/** 组件源码文件（lang=html/css；code 为内嵌源码，模板沙箱 srcdoc 渲染） */
export interface ZipAssetSourceFile {
  lang: string
  path: string
  code?: string
}

export interface ZipParseStats {
  slug: string
  name: string
  components: number
  patterns: number
  /** 出现过的目录层级（"a / b" 形式） */
  levels: string[]
  zip_size: number
}

export interface ZipParseResult {
  /** 解析后的 design-system.json（展示端模板协议：token 区块 + components/patterns） */
  ds: Record<string, unknown>
  stats: ZipParseStats
  skill_zip: {
    present: boolean
    filename: string | null
    size: number
  }
}

/** 从解析结果提取组件/Pattern 树（左栏统计与层级树展示用） */
export function extractAssetItems(ds: Record<string, unknown>, key: 'components' | 'patterns'): ZipAssetItem[] {
  const block = ds[key] as { items?: ZipAssetItem[] } | undefined
  return block?.items ?? []
}
