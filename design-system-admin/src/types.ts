export interface DesignSystemMeta {
  slug: string
  name: string
  desc?: string
  author?: string | AuthorEntry[]
  usage?: number
  cover?: string
  default?: boolean
}

/** 作者条目（API 的 author 数组元素；为 /getAccount 返回的完整值，驼峰原样存储） */
export interface AuthorEntry {
  id?: number | null
  userID?: string | null
  account: string
  nickName?: string | null
  /** 部门（最多 4 级数组） */
  dept?: string[] | null
}

/** 作者显示标签：两者都有 → nickName(account)；缺一只显示有的那个 */
export function authorLabel(a: AuthorEntry): string {
  if (a.nickName && a.account) return `${a.nickName}(${a.account})`
  return (a.nickName || a.account || '').trim()
}

export interface DesignSystemItem extends DesignSystemMeta {
  author: AuthorEntry[]
  /** DESIGN.md frontmatter 的 id 原样保留（不唯一，允许重复；展示/搜索/追溯） */
  source_slug?: string | null
  cover_url: string
  /** 图标相对路径（null=未自定义，走内置默认图标） */
  icon?: string | null
  /** 图标完整 URL（服务端对未自定义的回落内置默认图标，恒有值） */
  icon_url: string
  /** design-system.json 可直接 fetch 的地址 */
  json_url: string
  /** DESIGN.md 原件可下载地址（design_md 部件落盘件；旧数据可能为 null） */
  design_md_url?: string | null
  /** tokens.json 原件可下载地址（tokens 部件落盘件；老系统无原件为 null） */
  tokens_url?: string | null
  /** skill 包完整下载链接（无 skill 部件为 null） */
  skill_zip_url?: string | null
  /** 技能名（skill 包 zip 第一层 SKILL.md frontmatter 的 name；无 skill 部件为 null） */
  skill_name?: string | null
  /** 五部件存在性（编辑/查看用；展示端忽略） */
  parts: DesignSystemParts
  /** 创建人 / 最后编辑人（account）及显示名（"昵称 account"，无用户记录时回落 account） */
  created_by: string
  updated_by: string
  created_by_name: string
  updated_by_name: string
  /** {slug} 目录落盘内容合计（旧数据为 zip/MD 原件大小） */
  file_size?: number
  updated_at: string
}

/** 五部件存在性（api1 item.parts） */
export interface DesignSystemParts {
  /** source.md 落盘件存在 */
  design_md: boolean
  /** tokens.json 原件存在，或 json 含 token 区块（老系统按数据判断） */
  tokens: boolean
  /** json components 区块存在且有 items */
  components: boolean
  /** json patterns 区块存在且有 items */
  patterns: boolean
  /** skill 包落盘件存在 */
  skill: boolean
  components_count: number
  patterns_count: number
}

export type DesignSystemPartKey = 'design_md' | 'tokens' | 'components' | 'patterns' | 'skill'

/** 五部件文件集合（create / putParts 入参；全部可选，一个都不选 = 纯壳系统） */
export interface PartFiles {
  design_md?: File | null
  tokens?: File | null
  components?: File | null
  patterns?: File | null
  skill?: File | null
}

/** POST / PUT parts 响应的逐部件导入报告 */
export interface PartIngestEntry {
  provided: boolean
  ok?: boolean
  error?: string
  size?: number
  count?: number
  /** 组件/Pattern 包检测到同名嵌套目录并已剥离 */
  nested?: boolean
  skill_name?: string
}

export type PartIngestReport = Record<DesignSystemPartKey, PartIngestEntry>

/** create / putParts 响应：item + 顶层 ingest 报告 */
export interface DesignSystemCreateResp extends DesignSystemItem {
  ingest: PartIngestReport
}

export interface DesignSystemListResp {
  count: number
  items: DesignSystemItem[]
}

export const BUILTIN_COVERS = ['cover-blue.jpg', 'cover-cyan.jpg', 'cover-purple.jpg', 'cover-violet.jpg'] as const
export const DEFAULT_COVER = 'cover-cyan.jpg'

/** 设计系统白名单账号 */
export interface WhitelistAccount {
  id: number
  account: string
  nick_name: string | null
  remark: string | null
  /** super=超管 admin=管理员 */
  role: 'super' | 'admin' | string
  /** 1=启用 0=禁用 */
  is_active: number
  created_at?: number | null
  updated_at?: number | null
}

export interface WhitelistListResp {
  items: WhitelistAccount[]
}

/** 操作记录 */
export interface OperationLog {
  id: number
  source_id?: number | null
  resource_type?: number | null
  operator: string
  operator_account: string
  action: string
  target_type: string
  target_id?: number | null
  target_name?: string | null
  detail?: Record<string, unknown> | null
  /** epoch 毫秒 */
  created_at?: number | null
}

export interface OperationLogsResp {
  items: OperationLog[]
  total: number
  page: number
  limit: number
}

export interface OperationLogsParams {
  page: number
  limit: number
  action?: string
  target_type?: string
}

// ─────────────── 打点统计（数据统计页，契约 10 号接口组） ───────────────

export type StatsMetric = 'view' | 'usage' | 'users'
export type StatsGranularity = 'day' | 'week' | 'month'

export interface StatsSummaryItem {
  slug: string
  name: string
  views: number
  usage: number
  users: number
  last_at: string | null
}

export interface StatsSummaryResp {
  start: string | null
  end: string | null
  total: { views: number; usage: number; users: number; last_at: string | null }
  items: StatsSummaryItem[]
}

export interface StatsTrendResp {
  metric: StatsMetric
  granularity: StatsGranularity
  start: string | null
  end: string | null
  /** 扁平行：时间桶 × 一层部门（dept1 为空 = 匿名/未知），前端透视为堆叠柱状图 */
  buckets: { date: string; dept1: string; value: number }[]
}

export interface StatsDeptShareResp {
  metric: StatsMetric
  start: string | null
  end: string | null
  items: { dept1: string; value: number }[]
}

export interface StatsUserItem {
  account: string
  nick_name: string
  last_at: string | null
  views: number
  usage: number
  dept1: string
  dept2: string
  dept3: string
  dept4: string
}

export interface StatsUsersResp {
  start: string | null
  end: string | null
  total: number
  items: StatsUserItem[]
}
