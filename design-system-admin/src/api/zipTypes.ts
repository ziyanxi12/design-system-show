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
    /** 技能名（附件 zip 第一层 SKILL.md frontmatter 的 name；无附件为 null） */
    skill_name?: string | null
    /** 附件原文件名（DESIGN.md 同级任意 .zip，不强制命名） */
    filename: string | null
    size: number
    /** 附件内容 base64（≤50MB 时回传，解析页直接提供下载链接）；超限为 null（入库后经 skill_zip_url 下载） */
    content_base64?: string | null
  }
}

/** 从解析结果提取组件/Pattern 树（左栏统计与层级树展示用） */
export function extractAssetItems(ds: Record<string, unknown>, key: 'components' | 'patterns'): ZipAssetItem[] {
  const block = ds[key] as { items?: ZipAssetItem[] } | undefined
  return block?.items ?? []
}
